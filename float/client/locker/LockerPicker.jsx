/* The look picker (float/PROTOCOL.md "Components"). STUB: plain selects with
   the real props, so Field Day's Profile and the standalone join can use it
   now. The controller build replaces the body, never the props.
   look: { critter, floatie, hat, shades, pose }; onChange(nextLook); groom: the crown shows. */
import React from "react";
import { CRITTERS, HATS, POSES, SHADES } from "../../shared/looks.js";
import { FLOATIES } from "../../shared/floaties.js";

export default function LockerPicker({ look = {}, onChange = () => {}, groom = false }) {
  const field = (key, list) => <label style={{ display:"block", margin:"6px 0" }}>{key}
    <select value={look[key] || ""} onChange={event => onChange({ ...look, [key]:event.target.value })}>
      {list.filter(item => !item.groom || groom).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>;
  return <div className="float-locker">
    {field("critter", CRITTERS)}{field("floatie", FLOATIES)}{field("hat", HATS)}{field("shades", SHADES)}{field("pose", POSES)}
  </div>;
}
