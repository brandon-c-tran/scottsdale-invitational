/* Where and When's desk reads what a photo knows about itself: GPS and the
   camera's own wall clock, from the original JPEG's EXIF. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJpegFacts, readPhotoFacts } from "../src/features/geo/photoFacts.js";

/* a minimal big-endian EXIF JPEG: IFD0 -> Exif IFD (DateTimeOriginal) and GPS IFD */
function exifJpeg({ when = "2019:07:04 21:15:33", lat = [37, 49, 11.64], latRef = "N", lng = [122, 28, 41.88], lngRef = "W", gps = true } = {}) {
  const tiff = [];
  const u16 = v => tiff.push((v >> 8) & 255, v & 255);
  const u32 = v => tiff.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  const at = () => tiff.length;
  const patch32 = (pos, v) => { tiff[pos] = (v >>> 24) & 255; tiff[pos + 1] = (v >>> 16) & 255; tiff[pos + 2] = (v >>> 8) & 255; tiff[pos + 3] = v & 255; };
  /* header: MM, 42, IFD0 at 8 */
  tiff.push(0x4d, 0x4d); u16(42); u32(8);
  /* IFD0 */
  const entries0 = gps ? 2 : 1;
  u16(entries0);
  u16(0x8769); u16(4); u32(1); const exifPtr = at(); u32(0);
  let gpsPtr = null;
  if (gps) { u16(0x8825); u16(4); u32(1); gpsPtr = at(); u32(0); }
  u32(0);
  /* Exif IFD */
  patch32(exifPtr, at());
  u16(1); u16(0x9003); u16(2); u32(when.length + 1); const whenPtr = at(); u32(0); u32(0);
  patch32(whenPtr, at()); for (const c of when) tiff.push(c.charCodeAt(0)); tiff.push(0);
  if (gps) {
    patch32(gpsPtr, at());
    u16(4);
    u16(1); u16(2); u32(2); tiff.push(latRef.charCodeAt(0), 0, 0, 0);
    u16(2); u16(5); u32(3); const latPtr = at(); u32(0);
    u16(3); u16(2); u32(2); tiff.push(lngRef.charCodeAt(0), 0, 0, 0);
    u16(4); u16(5); u32(3); const lngPtr = at(); u32(0);
    u32(0);
    const rational = parts => parts.forEach(v => { u32(Math.round(v * 100)); u32(100); });
    patch32(latPtr, at()); rational(lat);
    patch32(lngPtr, at()); rational(lng);
  }
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (size >> 8) & 255, size & 255, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

const view = bytes => new DataView(bytes.buffer);

test("a photo's own GPS and wall clock are read from its EXIF", () => {
  const facts = parseJpegFacts(view(exifJpeg()));
  assert.equal(facts.when, "2019-07-04T21", "the camera's local wall clock, to the hour");
  assert.ok(Math.abs(facts.lat - 37.8199) < 0.001, `lat ${facts.lat}`);
  assert.ok(Math.abs(facts.lng + 122.4783) < 0.001, `west is negative: ${facts.lng}`);
});

test("southern and eastern hemispheres, a photo with no location, and non-photos", async () => {
  const sydney = parseJpegFacts(view(exifJpeg({ lat:[33, 51, 25], latRef:"S", lng:[151, 12, 55], lngRef:"E" })));
  assert.ok(sydney.lat < 0 && sydney.lng > 0);
  assert.deepEqual(parseJpegFacts(view(exifJpeg({ gps:false }))), { when:"2019-07-04T21" }, "location turned off: the time alone");
  assert.deepEqual(parseJpegFacts(view(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))), {}, "a PNG knows nothing");
  assert.deepEqual(parseJpegFacts(view(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))), {}, "a JPEG without EXIF knows nothing");
  const file = new Blob([exifJpeg()]);
  assert.equal((await readPhotoFacts(file)).when, "2019-07-04T21");
});

test("the desk prefills from the photo and adds several at once", () => {
  const desk = readFileSync(new URL("../src/features/geo/GeoDesk.jsx", import.meta.url), "utf8");
  assert.match(desk, /readPhotoFacts\(picked\)/, "read from the original before the resize");
  assert.match(desk, /accept="image\/\*" multiple/, "several photos in one pick");
  assert.match(desk, /aria-label="From the photo"/, "a field the photo filled is marked");
});
