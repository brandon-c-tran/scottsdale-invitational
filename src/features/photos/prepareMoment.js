/* The phone's half of an upload: decode the chosen photo, draw it at most
   1600px on its longest side and re-encode it as JPEG, plus a 480px
   thumbnail for the grid. A canvas never writes EXIF, so the camera's
   location and device never leave the phone (the server strips any that
   arrive anyway). Decoding through an <img> honours the camera's rotation
   and reads HEIC on an iPhone, as the profile photo cropper does. */
import { PHOTO_PREP, fitSide } from "./photoModel.js";

function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (image.naturalWidth && image.naturalHeight) resolve(image);
      else reject(new Error("That photo could not be opened"));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo could not be opened")); };
    image.src = url;
  });
}

const toBlob = (canvas, quality) => new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));

function draw(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

/* the first quality that fits under the cap */
async function encode(canvas, qualities, maxBytes) {
  for (const quality of qualities) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= maxBytes) return blob;
  }
  return null;
}

/* iOS keeps canvas memory until the canvas is emptied */
const release = canvas => { canvas.width = 0; canvas.height = 0; };

export async function prepareMoment(file) {
  const image = await decode(file);
  const size = fitSide(image.naturalWidth, image.naturalHeight, PHOTO_PREP.side);
  const full = draw(image, size.width, size.height);
  const small = fitSide(size.width, size.height, PHOTO_PREP.thumbSide);
  /* the thumbnail is drawn from the resized photo: two steps look sharper */
  const thumbCanvas = draw(full, small.width, small.height);
  try {
    const [photo, thumb] = await Promise.all([
      encode(full, [PHOTO_PREP.quality, 0.7, 0.6, 0.5], PHOTO_PREP.maxBytes),
      encode(thumbCanvas, [PHOTO_PREP.thumbQuality, 0.6, 0.5], PHOTO_PREP.maxThumbBytes),
    ]);
    if (!photo || !thumb) throw new Error("That photo is too large");
    /* the file's own date when the picker gives one; the server clamps it */
    const takenAt = Number(file.lastModified) || null;
    return { photo, thumb, width:size.width, height:size.height, takenAt };
  } finally {
    release(full);
    release(thumbCanvas);
  }
}
