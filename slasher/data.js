// Game data: levels, weapons, masks, colours and names.

export const MAX_HP = 100;

export const LEVELS = [
  { name: 'First Night', victims: 4, speed: 0.9, sight: 12, time: 300 },
  { name: 'House Party', victims: 6, speed: 0.95, sight: 14, time: 300 },
  { name: 'Sleepover', victims: 8, speed: 1.0, sight: 16, time: 330 },
  { name: 'Reunion', victims: 12, speed: 1.05, sight: 18, time: 360 },
  { name: 'Massacre', victims: 16, speed: 1.1, sight: 20, time: 420 },
];

export const MAPS = [
  { id: 'hood', name: 'Maple Hollow', sub: 'Neighborhood' },
  { id: 'camp', name: 'Camp Cheetwater', sub: 'Campgrounds' },
];

// dmg: damage per hit. reach: desktop reach in metres. swing: seconds per desktop swing.
// decap: chance of taking a head or limb off. crush: smashes heads. saw: continuous damage. impale: pins victims.
export const WEAPONS = [
  { id: 'machete', name: 'Machete', dmg: 60, reach: 2.0, swing: 0.45, decap: 0.45, desc: 'Balanced and quick. Clean cuts.' },
  { id: 'axe', name: 'Fire Axe', dmg: 75, reach: 2.1, swing: 0.6, decap: 0.6, desc: 'Heavy chops. Heads come off.' },
  { id: 'cleaver', name: 'Cleaver', dmg: 40, reach: 1.7, swing: 0.3, decap: 0.3, desc: 'Short reach, very fast hacks.' },
  { id: 'sledge', name: 'Sledgehammer', dmg: 100, reach: 2.2, swing: 0.85, decap: 0, crush: true, desc: 'Slow. Kills in one hit. Pops skulls.' },
  { id: 'chainsaw', name: 'Chainsaw', dmg: 150, reach: 1.9, swing: 0, decap: 0.4, saw: true, desc: 'Hold to rev. Shreds limbs.' },
  { id: 'fork', name: 'Pitchfork', dmg: 55, reach: 2.7, swing: 0.55, decap: 0, impale: true, desc: 'Longest reach. Skewers victims.' },
];
export const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

export const VERBS = {
  machete: 'hacked up', axe: 'split open', cleaver: 'carved up',
  sledge: 'crushed', chainsaw: 'sawed apart', fork: 'impaled',
};

export const MASKS = [
  { id: 'sack', name: 'Burlap Sack' },
  { id: 'pig', name: 'Pig Face' },
  { id: 'skull', name: 'Bone Skull' },
  { id: 'grin', name: 'The Grin' },
  { id: 'doll', name: 'Porcelain Doll' },
  { id: 'gas', name: 'Gas Mask' },
];

export const OUTFITS = [
  { c: '#2a2a2c', n: 'Coal' }, { c: '#5a1813', n: 'Rust' }, { c: '#2e3b24', n: 'Moss' }, { c: '#1f2b45', n: 'Navy' },
  { c: '#6a5634', n: 'Tan' }, { c: '#463656', n: 'Plum' }, { c: '#7e7f82', n: 'Ash' }, { c: '#b8a27a', n: 'Sand' },
];
export const SKINS = ['#f0c8a4', '#d39f76', '#a26c46', '#674126'];
export const SHIRTS = ['#e04f5f', '#3fa7d6', '#f6c142', '#59cd90', '#ee6fa8', '#f08a4b', '#9b7bd4', '#f2f2f2', '#4be0c4', '#ff5c33'];
export const PANTS = ['#2f3e5c', '#3b3b3b', '#6d5d45', '#1e2a3a', '#5a4a6a'];
export const HAIRS = ['#2a1a0e', '#5a3a1a', '#d9b36b', '#a0401e', '#111111', '#7a6a58'];

export const CAMPER_NAMES = ['Tiffany', 'Chad', 'Brooke', 'Kyle', 'Megan', 'Tyler', 'Ashley', 'Derek', 'Brittany', 'Josh',
  'Kayla', 'Ryan', 'Stacy', 'Trent', 'Heather', 'Cody', 'Amber', 'Blake', 'Jenna', 'Dustin'];
export const NAME_A = ['Grim', 'Silent', 'Rusty', 'Hollow', 'Pale', 'Midnight', 'Crooked', 'Muddy', 'Lonely', 'Wicked'];
export const NAME_B = ['Butcher', 'Stalker', 'Camper', 'Hiker', 'Possum', 'Raven', 'Drifter', 'Scout', 'Lurker', 'Ranger'];
