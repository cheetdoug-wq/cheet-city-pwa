// Networking. One player hosts and everyone else connects to them (a star).
// Online play uses PeerJS (WebRTC, with PeerJS's free public signalling and relay servers).
// Add ?net=local to the page address to test between tabs of one browser with BroadcastChannel.

export const PREFIX = 'cheet-slasher-v1-';
export const MAX_PLAYERS = 20;

const PEER_URLS = [
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
];

let peerLoad = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLoad) return peerLoad;
  peerLoad = new Promise((resolve, reject) => {
    let i = 0;
    const next = () => {
      if (i >= PEER_URLS.length) { peerLoad = null; reject(new Error('Could not load the networking library. Check your internet connection.')); return; }
      const s = document.createElement('script');
      s.src = PEER_URLS[i++];
      s.onload = () => (window.Peer ? resolve(window.Peer) : next());
      s.onerror = next;
      document.head.appendChild(s);
    };
    next();
  });
  return peerLoad;
}

// ---------- PeerJS ----------
async function peerHost(code, h) {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { debug: 1 });
    const conns = new Map();
    let opened = false, closed = false;
    const safeSend = (c, m) => { try { c.send(m); } catch (e) { /* closed */ } };
    const api = {
      send(id, m) { const c = conns.get(id); if (c && c.open) safeSend(c, m); },
      broadcast(m, except) { for (const [id, c] of conns) if (id !== except && c.open) safeSend(c, m); },
      kick(id) { const c = conns.get(id); if (c) { conns.delete(id); try { c.close(); } catch (e) {} } },
      close() { closed = true; try { peer.destroy(); } catch (e) {} },
    };
    peer.on('open', () => { opened = true; resolve(api); });
    peer.on('connection', conn => {
      conn.on('open', () => conns.set(conn.peer, conn));
      conn.on('data', d => { if (conns.get(conn.peer) !== conn) conns.set(conn.peer, conn); h.onMessage(conn.peer, d); });
      const drop = () => { if (conns.get(conn.peer) === conn) { conns.delete(conn.peer); h.onLeave(conn.peer); } };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('disconnected', () => {
      if (!closed) setTimeout(() => { try { if (!closed && !peer.destroyed) peer.reconnect(); } catch (e) {} }, 1000);
    });
    peer.on('error', e => {
      if (!opened) {
        try { peer.destroy(); } catch (_) {}
        reject(new Error(e.type === 'unavailable-id' ? 'taken' : 'Network error (' + e.type + '). Try again.'));
      }
    });
  });
}

async function peerClient(code, h) {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 1 });
    let conn = null, done = false, closed = false;
    const fail = msg => {
      if (done) return;
      done = true; clearTimeout(timer);
      try { peer.destroy(); } catch (e) {}
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail("Couldn't reach that server. Check the code and try again."), 15000);
    peer.on('open', id => {
      conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (done) return;
        done = true; clearTimeout(timer);
        resolve({
          id,
          send(m) { if (conn.open) { try { conn.send(m); } catch (e) {} } },
          close() { closed = true; try { peer.destroy(); } catch (e) {} },
        });
      });
      conn.on('data', d => h.onMessage(d));
      conn.on('close', () => { if (done && !closed) { closed = true; h.onClose('Lost connection to the server.'); } });
    });
    peer.on('error', e => { if (!done) fail(e.type === 'peer-unavailable' ? 'No server with that code.' : 'Network error (' + e.type + ').'); });
    peer.on('disconnected', () => { if (!closed) { try { peer.reconnect(); } catch (e) {} } });
  });
}

// ---------- BroadcastChannel (same-browser testing) ----------
function localHost(code, h) {
  const ch = new BroadcastChannel('cheet-slasher-' + code);
  const peers = new Set();
  ch.onmessage = e => {
    const m = e.data;
    if (!m || m.to !== 'host') return;
    if (m.msg && m.msg.t === 'bye') { if (peers.delete(m.from)) h.onLeave(m.from); return; }
    peers.add(m.from);
    h.onMessage(m.from, m.msg);
  };
  return Promise.resolve({
    send(id, msg) { ch.postMessage({ to: id, from: 'host', msg }); },
    broadcast(msg, ex) { ch.postMessage({ to: '*', ex, from: 'host', msg }); },
    kick(id) { peers.delete(id); },
    close() { try { ch.postMessage({ to: '*', from: 'host', msg: { t: 'bye' } }); ch.close(); } catch (e) {} },
  });
}

function localClient(code, h) {
  const id = 'L' + Math.random().toString(36).slice(2, 8);
  const ch = new BroadcastChannel('cheet-slasher-' + code);
  let closed = false;
  ch.onmessage = e => {
    const m = e.data;
    if (!m || closed || !(m.to === id || (m.to === '*' && m.ex !== id))) return;
    h.onMessage(m.msg);
  };
  return Promise.resolve({
    id,
    send(msg) { if (!closed) ch.postMessage({ to: 'host', from: id, msg }); },
    close() { if (!closed) { closed = true; try { ch.postMessage({ to: 'host', from: id, msg: { t: 'bye' } }); ch.close(); } catch (e) {} } },
  });
}

export function hostServer(code, handlers, local) { return local ? localHost(code, handlers) : peerHost(code, handlers); }
export function joinServer(code, handlers, local) { return local ? localClient(code, handlers) : peerClient(code, handlers); }
