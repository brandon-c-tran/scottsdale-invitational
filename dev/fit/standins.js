/* Stand-in images for rehearsals with no photo server: a face-shaped
   silhouette on a hue drawn from the player's id (so every run and every
   page agrees), and a plain landscape for a Where and When or Trivia photo.
   The fit audit serves them at /api/photo/... (scripts/fit-audit.mjs); the
   bits reel inlines them as data URIs (dev/bits-reel.jsx). Pure. */

export const standInPhoto = (seed, label) => {
  const hue = [...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="hsl(${hue} 35% 42%)"/>`
    + `<circle cx="120" cy="96" r="52" fill="hsl(${hue} 30% 78%)"/><rect x="40" y="160" width="160" height="110" rx="70" fill="hsl(${hue} 30% 78%)"/>`
    + (label ? `<text x="120" y="230" font-size="20" text-anchor="middle" fill="#fff">${label}</text>` : "") + `</svg>`;
};

export const standInGeo = id => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200"><rect width="1600" height="1200" fill="#5b7fa3"/>`
  + `<rect y="700" width="1600" height="500" fill="#7a6a4f"/><circle cx="${300 + (String(id).length * 97) % 900}" cy="300" r="140" fill="#f1d27a"/></svg>`;

/* as an image source */
export const svgDataUri = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
