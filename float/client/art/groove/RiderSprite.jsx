/* A rider's painted sprite (float/GROOVE.md "The art manifest and the 2D
   art module"): the white critter in its tube in the rider's colour, in one
   of the eight poses, drawn as a square of `size` px (the manifest's 512 box
   scaled; place it with spriteAnchor). Until the painted sprites are in, the
   same picture is composed in CSS (the grey sprite with the tube mask
   filled and multiplied over it), so nothing pops when they land.

   <RiderSprite critter="capybara" color="#e53935" pose="idle" groom={false} size={256} /> */
import React, { useEffect, useState } from "react";
import { loadGrooveArt, grooveArtNow, onGrooveArt, riderSprites, riderSpritesNow, poseArt, propOf, normalColor, spriteSize, CROWN_SHARE } from "./index.js";
import "./groove.css";

/* the manifest, once loaded (null until then; a failed load stays null) */
export function useGrooveArt() {
  const [m, setM] = useState(grooveArtNow);
  useEffect(() => {
    let live = true;
    const off = onGrooveArt(next => { if (live) setM(next); });
    loadGrooveArt().then(next => { if (live) setM(next); }, () => {});
    return () => { live = false; off(); };
  }, []);
  return m;
}

/* the painted sprites of a look, once painted (size: the painted bucket, spriteSize) */
export function useRiderSprites({ critter, color, groom, size }) {
  const m = useGrooveArt();
  const look = { critter, color:normalColor(color), groom:!!groom, size };
  const [urls, setUrls] = useState(() => riderSpritesNow(look));
  useEffect(() => {
    let live = true;
    setUrls(riderSpritesNow(look));
    riderSprites(look).then(next => { if (live) setUrls(next); }, () => {});
    return () => { live = false; };
  }, [m, look.critter, look.color, look.groom, look.size]);
  return urls;
}
const dpr = () => (typeof window !== "undefined" && window.devicePixelRatio) || 1;

export default function RiderSprite({ critter = "capybara", color, pose = "idle", groom = false, size = 256, className = "", style, ...rest }) {
  const urls = useRiderSprites({ critter, color, groom, size:spriteSize(size, dpr()) });
  const box = { width:size, height:size, ...style };
  const cls = `fg-rider ${className}`.trim();
  const url = urls?.[pose] || urls?.idle;
  if (url) return <img src={url} width={size} height={size} alt="" draggable={false} className={cls} style={box} data-pose={pose} {...rest} />;
  const art = poseArt(critter, pose);
  if (!art) return <span className={`${cls} fg-rider--wait`} style={box} data-pose={pose} {...rest} />;
  const mask = art.tube ? `url("${art.tube}")` : null;
  const crown = groom ? propOf("crown") : null;
  const head = art.anchor?.head;
  const k = size / (art.box?.[0] || 512);
  return (
    <span className={`${cls} fg-rider--css`} style={box} data-pose={pose} {...rest}>
      <img src={art.src} alt="" draggable={false} className="fg-rider-src" />
      {mask ? <span className="fg-rider-tube" style={{ backgroundColor:normalColor(color), WebkitMaskImage:mask, maskImage:mask }} /> : null}
      {crown && head ? (
        <img src={crown.src} alt="" draggable={false} className="fg-rider-crown"
          style={{
            width:(art.box?.[0] || 512) * CROWN_SHARE * k,
            left:head[0] * k - (art.box?.[0] || 512) * CROWN_SHARE * k * (crown.anchor[0] / crown.w),
            top:head[1] * k - (art.box?.[0] || 512) * CROWN_SHARE * k * (crown.h / crown.w) * (crown.anchor[1] / crown.h),
          }} />
      ) : null}
    </span>
  );
}
