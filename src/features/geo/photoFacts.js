/* What a photo already knows about itself: where it was taken (GPS) and
   when (the camera's own wall clock, DateTimeOriginal), read from the
   ORIGINAL file before the phone resizes it (a canvas writes no EXIF, and
   the server strips it anyway). The time is the photo's local wall clock,
   which is exactly how Where and When scores "when", so no time zone
   enters. Pure parsing of a JPEG's EXIF block; anything else (a HEIC a
   browser did not convert, a screenshot, a photo whose location was turned
   off when it was shared) simply knows nothing and the desk asks as before. */

const EXIF_READ_BYTES = 256 * 1024;

/* { lat, lng, when:"YYYY-MM-DDTHH" } with whatever the photo carries */
export async function readPhotoFacts(file) {
  try {
    const buffer = await file.slice(0, EXIF_READ_BYTES).arrayBuffer();
    return parseJpegFacts(new DataView(buffer));
  } catch {
    return {};
  }
}

export function parseJpegFacts(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00 || size < 2) return {};
    /* APP1 "Exif\0\0" */
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966)
      return parseTiff(view, offset + 10, Math.min(view.byteLength, offset + 2 + size));
    if (marker === 0xffda) return {};
    offset += 2 + size;
  }
  return {};
}

function parseTiff(view, start, end) {
  if (start + 8 > end) return {};
  const little = view.getUint16(start) === 0x4949;
  const u16 = at => at + 2 <= end ? view.getUint16(at, little) : 0;
  const u32 = at => at + 4 <= end ? view.getUint32(at, little) : 0;
  const entries = ifd => {
    const at = start + ifd;
    const count = u16(at);
    const out = new Map();
    for (let i = 0; i < count && at + 2 + i * 12 + 12 <= end; i++) {
      const entry = at + 2 + i * 12;
      out.set(u16(entry), { type:u16(entry + 2), count:u32(entry + 4), value:entry + 8 });
    }
    return out;
  };
  const ascii = tag => {
    if (!tag || tag.type !== 2) return "";
    const at = tag.count > 4 ? start + u32(tag.value) : tag.value;
    let text = "";
    for (let i = 0; i < tag.count - 1 && at + i < end; i++) text += String.fromCharCode(view.getUint8(at + i));
    return text;
  };
  const rationals = tag => {
    if (!tag || tag.type !== 5) return null;
    const at = start + u32(tag.value);
    const values = [];
    for (let i = 0; i < tag.count; i++) {
      const den = u32(at + i * 8 + 4);
      values.push(den ? u32(at + i * 8) / den : 0);
    }
    return values;
  };
  const ifd0 = entries(u32(start + 4));
  const facts = {};
  const exifPointer = ifd0.get(0x8769);
  if (exifPointer) {
    const exif = entries(u32(exifPointer.value));
    const stamp = ascii(exif.get(0x9003)) || ascii(exif.get(0x9004));
    const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2})/.exec(stamp);
    if (match && match[1] !== "0000") facts.when = `${match[1]}-${match[2]}-${match[3]}T${match[4]}`;
  }
  const gpsPointer = ifd0.get(0x8825);
  if (gpsPointer) {
    const gps = entries(u32(gpsPointer.value));
    const toDegrees = parts => parts && parts.length >= 3 ? parts[0] + parts[1] / 60 + parts[2] / 3600 : null;
    const lat = toDegrees(rationals(gps.get(2)));
    const lng = toDegrees(rationals(gps.get(4)));
    if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) {
      facts.lat = ascii(gps.get(1)) === "S" ? -lat : lat;
      facts.lng = ascii(gps.get(3)) === "W" ? -lng : lng;
    }
  }
  return facts;
}

/* the place's name from its coordinates (Photon reverse, the same free
   OpenStreetMap service the place search uses); "" when it cannot say */
export async function reversePlace(lat, lng, label) {
  try {
    const response = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en&limit=1`);
    if (!response.ok) return "";
    const feature = (await response.json())?.features?.[0];
    return feature ? label(feature.properties || {}) : "";
  } catch {
    return "";
  }
}
