/* Fixed seats (float/GROOVE.md v3 "Who you are: fixed seats"): every rider
   keeps one place in the flotilla for the whole Cup, so a player finds
   themself once and never loses track. The field in entrant order fills the
   FRONT row first, left to right, then the rows behind it. Pure: the screen
   lays the flotilla out from it and the phone says it in words. */

/* How many ride in each row, back to front: 1 to 4 one row, 5 to 10 two
   (the front one takes the odd rider: 9 -> 4, 5), 11 to 16 three. Rows next
   to each other differ by an odd count where they can (13 -> 4, 5, 4), so
   their riders sit in each other's gaps. */
const THREE_ROWS = Object.freeze({ 11:[4, 3, 4], 12:[5, 4, 3], 13:[4, 5, 4], 14:[5, 4, 5], 15:[6, 5, 4], 16:[5, 6, 5] });
export function rowCounts(n) {
  const riders = Math.max(0, Math.floor(Number(n) || 0));
  if (!riders) return [];
  if (riders <= 4) return [riders];
  if (riders <= 10) return [Math.floor(riders / 2), Math.ceil(riders / 2)];
  return [...(THREE_ROWS[Math.min(16, riders)] || THREE_ROWS[16])];
}

/* field: entrant indices. Returns Map(i -> { row, rows, col, cols }): row 0
   is the FRONT, col 0 the LEFT. The field is taken in entrant order, so a
   cut closes the gaps without anyone swapping past a neighbour. */
export function seatsFor(field = []) {
  const order = [...new Set(field.filter(i => Number.isInteger(i)))].sort((a, b) => a - b);
  const frontFirst = rowCounts(order.length).reverse();
  const seats = new Map();
  let k = 0;
  frontFirst.forEach((cols, row) => {
    for (let col = 0; col < cols; col += 1) seats.set(order[k++], { row, rows:frontFirst.length, col, cols });
  });
  return seats;
}

const ordinal = n => {
  const tens = n % 100, ones = n % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${n}${suffix}`;
};
const ROW_WORDS = { 1:["Front row"], 2:["Front row", "Back row"], 3:["Front row", "Middle row", "Back row"] };

/* a seat in words: "Front row, 3rd from the left"; one row: "3rd from the left" */
export function seatWords(seat) {
  if (!seat) return "";
  const from = seat.cols > 1 && seat.col === seat.cols - 1 && seat.cols > 2 ? "Far right" : `${ordinal(seat.col + 1)} from the left`;
  if (seat.rows <= 1) return from;
  return `${ROW_WORDS[seat.rows]?.[seat.row] || `Row ${seat.row + 1}`}, ${from === "Far right" ? "far right" : from}`;
}
