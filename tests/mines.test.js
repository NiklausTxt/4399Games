import test from "node:test";
import assert from "node:assert/strict";
import { createBoard, getNeighbors, isWin, revealCell, toggleFlag } from "../dist/minesweeper/mines.js";

test("getNeighbors respects corners and edges", () => {
  assert.deepEqual(getNeighbors(0, 3, 3).sort((a, b) => a - b), [1, 3, 4]);
  assert.equal(getNeighbors(4, 3, 3).length, 8);
});

test("createBoard places the requested mines away from the first click", () => {
  const board = createBoard(9, 9, 10, 40, () => 0.42);
  assert.equal(board.filter((cell) => cell.mine).length, 10);
  assert.equal(board[40].mine, false);
  assert.equal(board[40].adjacent, 0);
  getNeighbors(40, 9, 9).forEach((index) => assert.equal(board[index].mine, false));
});

test("revealCell expands empty areas without revealing flags or mines", () => {
  const board = createBoard(4, 4, 1, 0, () => 0);
  const flaggedIndex = board.findIndex((cell, index) => !cell.mine && index !== 0);
  const flagged = toggleFlag(board, flaggedIndex);
  const result = revealCell(flagged, 0, 4, 4);
  assert.equal(result.exploded, false);
  assert.equal(result.board[flaggedIndex].revealed, false);
  assert.equal(result.board.filter((cell) => cell.mine && cell.revealed).length, 0);
});

test("mine explosions and win detection are reported", () => {
  const board = createBoard(3, 3, 1, 0, () => 0);
  const mineIndex = board.findIndex((cell) => cell.mine);
  const exploded = revealCell(board, mineIndex, 3, 3);
  assert.equal(exploded.exploded, true);
  assert.equal(exploded.board[mineIndex].exploded, true);

  const solved = board.map((cell) => ({ ...cell, revealed: !cell.mine }));
  assert.equal(isWin(solved), true);
});
