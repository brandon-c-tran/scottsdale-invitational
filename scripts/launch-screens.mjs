/* iPhone launch screens. iOS builds no launch screen from the manifest: an
   installed app with no apple-touch-startup-image for its screen opens on
   plain white until the page paints. Each image is one portrait screen,
   pixel for pixel: the glass ground with the FD mark centred, LAUNCH_MARK_PT
   points across on every phone. iOS keeps the image it found when the app
   was added to the Home Screen, so a new one reaches new installs only.

   One list for the files (scripts/icons.mjs draws them) and the link tags
   (vite.config.js stamps them into index.html, staging's set on staging). */
export const LAUNCH_GROUND = "#090b14";
export const LAUNCH_MARK_PT = 104;

/* CSS width and height in portrait, and the device pixel ratio */
export const LAUNCH_SCREENS = Object.freeze([
  { w:375, h:667, dpr:2 },  /* SE (2nd and 3rd gen), 8 */
  { w:414, h:736, dpr:3 },  /* 8 Plus */
  { w:375, h:812, dpr:3 },  /* X, XS, 11 Pro, 12 mini, 13 mini */
  { w:414, h:896, dpr:2 },  /* XR, 11 */
  { w:414, h:896, dpr:3 },  /* XS Max, 11 Pro Max */
  { w:390, h:844, dpr:3 },  /* 12, 12 Pro, 13, 13 Pro, 14, 16e */
  { w:428, h:926, dpr:3 },  /* 12 Pro Max, 13 Pro Max, 14 Plus */
  { w:393, h:852, dpr:3 },  /* 14 Pro, 15, 15 Pro, 16 */
  { w:430, h:932, dpr:3 },  /* 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus */
  { w:402, h:874, dpr:3 },  /* 16 Pro, 17, 17 Pro */
  { w:420, h:912, dpr:3 },  /* Air */
  { w:440, h:956, dpr:3 },  /* 16 Pro Max, 17 Pro Max */
].map(Object.freeze));

export const launchPixels = ({ w, h, dpr }) => ({ width:w * dpr, height:h * dpr });

/* served from public/launch; staging has its own set (its mark) */
export function launchPath(screen, staging = false) {
  const { width, height } = launchPixels(screen);
  return `/launch/${staging ? "staging-" : ""}${width}x${height}.png`;
}

export function launchMedia({ w, h, dpr }) {
  return `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`;
}

/* the head's link tags, one per screen */
export function launchLinks(staging = false) {
  return LAUNCH_SCREENS.map(screen =>
    `<link rel="apple-touch-startup-image" media="${launchMedia(screen)}" href="${launchPath(screen, staging)}" />`)
    .join("\n    ");
}
