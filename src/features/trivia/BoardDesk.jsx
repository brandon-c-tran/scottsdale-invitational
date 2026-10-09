import React from "react";
import { BOARD_FORMAT } from "../../../shared/triviaBoard.js";
import { columnNameSize, deskBoard, fmtPoints } from "./boardModel.js";
import "./board.css";

/* Rounds | Board: the format the next game starts in (triviaSetFormat).
   Refused while a game runs, so it is still then. */
export function FormatSwitch({ format, onChange, disabled = false }) {
  return <div className="fd-trivia-formats fd-board-formats" role="radiogroup" aria-label="Format">
    {[["rounds", "Rounds"], [BOARD_FORMAT, "Board"]].map(([id, name]) => <button type="button" key={id} role="radio"
      aria-checked={format === id} disabled={disabled && format !== id} onClick={() => format !== id && onChange?.(id)}>{name}</button>)}
  </div>;
}

/* The set list as the board it will deal (deskBoard: dealBoard's own
   rules over the rounds): a column a round, its values lit. Under a
   column, a dim pip for each question that will not be on the board (past
   five, or a closest number a buzzer cannot answer); a round past six, or
   with nothing a buzzer can answer, stands dim beside the board. A column's
   name opens its round. */
export function BoardPreview({ rounds, bank, onEdit, width = 358 }) {
  const board = deskBoard(rounds, bank || []);
  const n = Math.max(1, board.columns.length);
  const colW = Math.floor(width / n) - 6;
  /* one size for every column's name, the longest word's */
  const nameSize = Math.min(...board.columns.map(column => columnNameSize(column.name, colW)));
  const rows = Math.max(0, ...board.columns.map(column => column.cells.length));
  return <div className="fd-board-desk">
    {board.columns.length > 0 ? <div className="fd-board-gridwrap">
      <div className="fd-board-grid is-desk" style={{ "--cols":n }}>
        {board.columns.map(column => <button type="button" key={column.round.id} className="fd-board-colname is-edit"
          style={{ fontSize:nameSize }} onClick={() => onEdit?.(column.round)}
          aria-label={`Edit ${column.name}`}>{column.name || "Round"}</button>)}
        {Array.from({ length:rows }, (_, row) => board.columns.map(column => {
          const cell = column.cells[row];
          return cell ? <span key={`${column.round.id}:${row}`} className="fd-board-cell">{fmtPoints(cell.value)}</span>
            : <span key={`${column.round.id}:${row}`} className="fd-board-cell is-empty" aria-hidden="true" />;
        }))}
        {board.columns.map(column => {
          const off = column.extra.length + column.unusable.length;
          return <span key={`${column.round.id}:off`} className="fd-board-pips" aria-label={off ? `${off} not on the board` : undefined}>
            {Array.from({ length:Math.min(6, off) }, (_, i) => <i key={i} />)}</span>;
        })}
      </div>
    </div> : <div className="fd-board-gridwrap is-blank" aria-hidden="true" />}
    {board.out.length > 0 && <ul className="fd-board-out">
      {board.out.map(column => <li key={column.round.id}><button type="button" onClick={() => onEdit?.(column.round)}>
        {column.name || "Round"}</button></li>)}
    </ul>}
  </div>;
}
