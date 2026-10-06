/* The TV's check-in QR as one SVG path (TV only: phones never import it, so
   they never download the encoder). Medium error correction; every dark
   module is a unit square, so the code stays crisp at any size and takes
   its ink from the page's tokens. */
import qrcode from "qrcode-generator";

export function qrModules(text) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(String(text || ""));
    qr.make();
    const size = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++)
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { size, d };
  } catch { return null; }
}
