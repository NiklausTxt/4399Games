import test from "node:test";
import assert from "node:assert/strict";
import { addRandomTile, canMove, createEmptyGrid, moveGrid, slideLine } from "../dist/game.js";
import { validateCredentials } from "../worker/index.js";

test("slideLine merges each pair once", () => {
  assert.deepEqual(slideLine([2, 2, 2, 2]), { line: [4, 4, 0, 0], gained: 8 });
  assert.deepEqual(slideLine([4, 4, 8, 0]), { line: [8, 8, 0, 0], gained: 8 });
});

test("moveGrid handles all directions without mutating source", () => {
  const grid = [
    [2, 0, 2, 0],
    [0, 4, 0, 4],
    [2, 0, 0, 0],
    [2, 0, 0, 0],
  ];
  const snapshot = structuredClone(grid);
  const left = moveGrid(grid, "left");
  assert.deepEqual(left.grid[0], [4, 0, 0, 0]);
  assert.deepEqual(left.grid[1], [8, 0, 0, 0]);
  assert.equal(left.gained, 12);
  assert.deepEqual(grid, snapshot);

  const up = moveGrid(grid, "up");
  assert.deepEqual(up.grid.map((row) => row[0]), [4, 2, 0, 0]);
});

test("addRandomTile adds one deterministic tile", () => {
  const grid = createEmptyGrid();
  const values = [0, 0.5];
  const next = addRandomTile(grid, () => values.shift());
  assert.equal(next.flat().filter(Boolean).length, 1);
  assert.equal(next[0][0], 2);
  assert.equal(grid[0][0], 0);
});

test("canMove detects full terminal boards", () => {
  assert.equal(canMove([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]), false);
  assert.equal(canMove([
    [2, 4, 2, 4],
    [4, 4, 8, 2],
    [2, 8, 2, 4],
    [4, 2, 4, 2],
  ]), true);
});

test("validateCredentials accepts supported usernames and rejects weak input", () => {
  assert.deepEqual(validateCredentials(" 玩家_42 ", "correct-horse"), {
    username: "玩家_42",
    password: "correct-horse",
  });
  assert.match(validateCredentials("ab", "correct-horse").error, /3–24/);
  assert.match(validateCredentials("valid_name", "short").error, /8–72/);
  assert.match(validateCredentials("bad name", "correct-horse").error, /只能包含/);
});
