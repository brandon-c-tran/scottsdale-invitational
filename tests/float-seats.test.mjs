import test from "node:test";
import assert from "node:assert/strict";
import { seatsFor, seatWords, rowCounts } from "../float/shared/seats.js";

test("seats: the front row fills first, left to right, in entrant order", () => {
  const field = [12, 0, 3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11];
  const seats = seatsFor(field);
  assert.equal(seats.size, 13);
  assert.deepEqual(rowCounts(13), [4, 5, 4]);
  assert.deepEqual(seats.get(0), { row:0, rows:3, col:0, cols:4 });
  assert.deepEqual(seats.get(3), { row:0, rows:3, col:3, cols:4 });
  assert.deepEqual(seats.get(4), { row:1, rows:3, col:0, cols:5 });
  assert.deepEqual(seats.get(12), { row:2, rows:3, col:3, cols:4 });
});

test("seats: a cut closes gaps without swapping neighbours", () => {
  const before = seatsFor([0, 1, 2, 3, 4, 5, 6]);
  const after = seatsFor([0, 2, 3, 5, 6]);
  const order = m => [...m.entries()].sort((a, b) => a[1].row - b[1].row || a[1].col - b[1].col).map(([i]) => i);
  assert.deepEqual(order(after), order(before).filter(i => [0, 2, 3, 5, 6].includes(i)));
});

test("seats: words", () => {
  assert.equal(seatWords({ row:0, rows:3, col:2, cols:4 }), "Front row, 3rd from the left");
  assert.equal(seatWords({ row:2, rows:3, col:3, cols:4 }), "Back row, far right");
  assert.equal(seatWords({ row:0, rows:1, col:0, cols:3 }), "Far left");
  assert.equal(seatWords({ row:0, rows:3, col:0, cols:4 }), "Front row, far left");
  assert.equal(seatWords({ row:0, rows:1, col:0, cols:2 }), "1st from the left");
  assert.equal(seatWords({ row:1, rows:2, col:1, cols:5 }), "Back row, 2nd from the left");
});
