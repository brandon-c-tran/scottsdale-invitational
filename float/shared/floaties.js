/* The floaties (float/PROTOCOL.md "Floaties"). Every floatie spends the same
   12 points across four stats, 1 to 5, so none is strictly better; each has
   one twist. tuning.js turns the stats into physics; this file is the ids,
   names and numbers everyone shows. */

export const STATS = Object.freeze([
  { id:"speed", name:"Speed" },   // paddle thrust and top speed
  { id:"turn", name:"Turn" },     // how sharply a stroke turns you
  { id:"weight", name:"Weight" }, // who wins a bump, and how hard the current pushes you
  { id:"grip", name:"Grip" },     // flip resistance in rapids and the Drop
]);

export const FLOATIES = Object.freeze([
  { id:"classic", name:"Classic Tube", speed:3, turn:3, weight:3, grip:3, twist:"Balanced" },
  { id:"donut", name:"Donut", speed:4, turn:3, weight:2, grip:3, twist:"Quick off the start" },
  { id:"unicorn", name:"Unicorn", speed:5, turn:3, weight:2, grip:2, twist:"Fastest, tippy" },
  { id:"flamingo", name:"Flamingo", speed:3, turn:5, weight:2, grip:2, twist:"Tight turns" },
  { id:"shark", name:"Shark", speed:3, turn:2, weight:5, grip:2, twist:"Bumps send riders flying" },
  { id:"pizza", name:"Pizza Raft", speed:2, turn:2, weight:4, grip:4, twist:"Hard to flip" },
  { id:"lounge", name:"Lounger", speed:2, turn:2, weight:3, grip:5, twist:"Never flips" },
  { id:"cooler", name:"Cooler Raft", speed:2, turn:3, weight:4, grip:3, twist:"Holds its line while you drink" },
]);

export const FLOATIE_IDS = Object.freeze(FLOATIES.map(item => item.id));
export const floatieOf = id => FLOATIES.find(item => item.id === id) || FLOATIES[0];
