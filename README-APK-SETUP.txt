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

## Current limits
- This is not a standalone native Unity/Unreal game; it packages the existing web game as a Quest PWA/APK.
- It has not been tested on a physical Quest in this environment.
- Test the hosted version in Quest Browser first. Meta says PWA uses the same rendering engine as Quest Browser, so any remaining rendering or frame-rate issue must be fixed in the web game before packaging.
