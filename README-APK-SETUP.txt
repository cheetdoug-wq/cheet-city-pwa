# Cheet City — Quest APK starter

This is the first packaging stage: a Meta Quest-ready Progressive Web App (PWA) project. It is not yet a signed APK because Meta's Quest PWA packager requires the app to be hosted at a public HTTPS URL first.

## What's included
- `index.html`: Cheet City, set up as the PWA entry page.
- `manifest.webmanifest`: app name, landscape orientation, and launcher icons.
- `sw.js`: caches the app shell for quicker repeat launches.
- `icons/`: 192px and 512px launcher icons.
- startup retry/fallback for the Three.js and Cannon.js CDN scripts, so one failed CDN does not immediately kill startup.
- a lower pixel-ratio profile when the browser exposes WebXR, plus shadows disabled during immersive VR to reduce GPU load.

## Important
The app still loads Three.js and Cannon.js from HTTPS CDNs, with alternate CDN fallbacks. A connection is needed on first load. The service worker caches the app shell and the exact Three.js/Cannon.js files after they have downloaded successfully once. The PWA wrapper uses the Quest browser's web rendering engine, so packaging alone does not make the city faster; the lower Quest profile is an initial performance measure, and further scene profiling is still needed.

## Host it
Upload the **contents** of this folder to a static HTTPS host. The hosted files must be at the site root so `manifest.webmanifest`, `sw.js`, and `icons/` resolve at the paths used here. Open the deployed `index.html` in Meta Quest Browser and test it before packaging.

## Build the Quest APK
Use Node.js 18+ on your Linux environment. Then, from an empty working folder:

```bash
npm install --global @meta-quest/bubblewrap-cli
bubblewrap --version
bubblewrap init --manifest=https://YOUR-DOMAIN/manifest.webmanifest --metaquest
```

During setup, choose:
- app mode: **2D** for this first package (it opens as a panel, then the existing **Enter VR** button starts WebXR);
- orientation: **landscape**;
- a unique package ID, such as `com.yourname.cheetcity`;
- create and securely keep a signing key.

Then publish the generated `assetlinks.json` at:

`https://YOUR-DOMAIN/.well-known/assetlinks.json`

After the domain verification file is live, run:

```bash
bubblewrap build
```

The signed output is `app-release-signed.apk`. Keep the signing key safe; updates need the same key. For Quest compatibility, Meta's current guide says to set the generated Android app module's `targetSdk` to 32 before building.

Meta's current official packaging guide: https://developers.meta.com/vr/documentation/web/pwa-packaging/

## What's new in this version
- Bigger map: North St with two new rows of buildings, and a harbour promenade with a pier and a lighthouse.
- Guns: pistol, SMG, rifle and shotgun. On a computer: click to fire (hold for automatic), right-click to aim down the sights, T reloads (takes time), X holsters. Crosshair, ammo counter, recoil, spread, shell casings and smoke. People take damage (head shots count more).
- Helicopter: on the airport helipad. Space climbs, Shift descends, W/S fly, A/D turn, Q/Z slide sideways, V switches camera, E gets out once landed on the ground. In VR: left stick flies, right stick turns and climbs, B gets out.
- Airport: jets land, turn round and take off again; airliners cruise overhead; a news helicopter and a police helicopter (searchlight at night) circle the city.
- Cutscenes: an intro flyover on first launch, a pre-flight shot the first time you board the helicopter, and an arrivals shot the first time you visit the viewing deck. Skip with the button, Esc, Space or a click. They never play in VR.
- Settings (button or O key): look sensitivity, field of view, invert look, mouse lock, and VR calibration (gun grip angle, snap-turn angle, smooth-turn speed, height adjust, seated play). The VR menu (left Y) has the same calibration plus "Recalibrate body height".

## Performance (why it ran at ~1 frame per second)
- The game was drawing about 9 million triangles every frame: every building detail in the whole city, including everything behind you, because instanced meshes in this Three.js version have off-screen culling turned off by default. That is now switched on, and building details are grouped so distant ones really are skipped.
- About 24,000 shop items were drawn everywhere at high detail, and again for shadows. Now only items in shops near you are drawn, with simpler shapes and no shadows.
- Quest, Android and other phones/tablets automatically get a lighter mode: no real-time shadows, simpler lighting, no extra point lights, simpler windows and railings, shorter detail distance and closer fog. The start view went from 9.2 million to about 0.9 million triangles, and from about 2,800 to about 370 draw calls.
- Add ?quality=high or ?quality=low to the page address to force a mode.

## Bugs fixed in this version
- Shop items west of x=-220 or east of x=220 snapped back to the shelf as soon as they were touched.
- CHEETMART and its car park were built on top of West Ave; people walked through its walls.
- Tower Ave ran straight across the runway; it now ends at the airport with a turnaround.
- Cars on the avenues vanished at the map edge and reappeared at the other end; they now turn around.
- On a computer, bullets flew parallel to the gun instead of to the centre of the screen, so they never hit what you aimed at.
- Automatic fire depended on keyboard repeat (a half-second pause after the first shot); reloading was instant and could waste a full magazine.
- E, F, G and Q acted on your walk position while in Orbit mode.
- The CHEETMART pylon sign's collision box was placed far outside the map.

## Current limits
- This is not a standalone native Unity/Unreal game; it packages the existing web game as a Quest PWA/APK.
- It has not been tested on a physical Quest in this environment. The VR helicopter controls and the calibration options in particular need trying on a headset.
- Test the hosted version in Quest Browser first. Meta says PWA uses the same rendering engine as Quest Browser, so any remaining rendering or frame-rate issue must be fixed in the web game before packaging.
