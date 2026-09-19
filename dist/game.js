const SIZE = 4;
const STORAGE_KEY = "dontpanic42-2048-state-v1";
const BEST_KEY = "dontpanic42-2048-best-v1";

export function createEmptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function slideLine(line) {
  const values = line.filter(Boolean);
  const result = [];
  let gained = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) {
      const merged = values[index] * 2;
      result.push(merged);
      gained += merged;
      index += 1;
    } else {
      result.push(values[index]);
    }
  }

  while (result.length < SIZE) result.push(0);
  return { line: result, gained };
}

function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

function gridsEqual(a, b) {
  return a.every((row, rowIndex) => row.every((value, colIndex) => value === b[rowIndex][colIndex]));
}

export function moveGrid(grid, direction) {
  const next = createEmptyGrid();
  let gained = 0;

  for (let outer = 0; outer < SIZE; outer += 1) {
    const source = [];
    for (let inner = 0; inner < SIZE; inner += 1) {
      if (direction === "left") source.push(grid[outer][inner]);
      if (direction === "right") source.push(grid[outer][SIZE - 1 - inner]);
      if (direction === "up") source.push(grid[inner][outer]);
      if (direction === "down") source.push(grid[SIZE - 1 - inner][outer]);
    }

    const moved = slideLine(source);
    gained += moved.gained;

    for (let inner = 0; inner < SIZE; inner += 1) {
      if (direction === "left") next[outer][inner] = moved.line[inner];
      if (direction === "right") next[outer][SIZE - 1 - inner] = moved.line[inner];
      if (direction === "up") next[inner][outer] = moved.line[inner];
      if (direction === "down") next[SIZE - 1 - inner][outer] = moved.line[inner];
    }
  }

  return { grid: next, gained, changed: !gridsEqual(grid, next) };
}

export function addRandomTile(grid, random = Math.random) {
  const empty = [];
  grid.forEach((row, rowIndex) => row.forEach((value, colIndex) => {
    if (value === 0) empty.push([rowIndex, colIndex]);
  }));

  if (!empty.length) return grid;
  const next = cloneGrid(grid);
  const [row, col] = empty[Math.floor(random() * empty.length)];
  next[row][col] = random() < 0.9 ? 2 : 4;
  return next;
}

export function canMove(grid) {
  if (grid.some((row) => row.includes(0))) return true;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (grid[row][col] === grid[row + 1]?.[col] || grid[row][col] === grid[row]?.[col + 1]) return true;
    }
  }
  return false;
}

function hasWon(grid) {
  return grid.some((row) => row.some((value) => value >= 2048));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      Array.isArray(saved?.grid) && saved.grid.length === SIZE &&
      saved.grid.every((row) => Array.isArray(row) && row.length === SIZE && row.every(Number.isFinite))
    ) {
      return { grid: saved.grid, score: Number(saved.score) || 0, wonShown: Boolean(saved.wonShown) };
    }
  } catch { /* Corrupt local state falls back to a fresh game. */ }
  return null;
}

function initialState() {
  let grid = createEmptyGrid();
  grid = addRandomTile(grid);
  grid = addRandomTile(grid);
  return { grid, score: 0, wonShown: false };
}

if (typeof document !== "undefined") {
  const board = document.querySelector("#board");
  const scoreNode = document.querySelector("#score");
  const bestNode = document.querySelector("#best");
  const scoreAdd = document.querySelector("#score-add");
  const message = document.querySelector("#game-message");
  const messageKicker = document.querySelector("#message-kicker");
  const messageTitle = document.querySelector("#message-title");
  const messageCopy = document.querySelector("#message-copy");
  const keepPlayingButton = document.querySelector("#keep-playing");

  let state = loadState() || initialState();
  let best = Math.max(Number(localStorage.getItem(BEST_KEY)) || 0, state.score);
  let touchStart = null;

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(BEST_KEY, String(best));
  }

  function render() {
    board.replaceChildren();
    state.grid.flat().forEach((value) => {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.value = String(value);
      if (value > 2048) tile.dataset.large = "true";
      tile.textContent = value || "";
      tile.setAttribute("aria-label", value ? String(value) : "空格");
      board.append(tile);
    });
    scoreNode.textContent = String(state.score);
    bestNode.textContent = String(best);
  }

  function showMessage(type) {
    const won = type === "won";
    messageKicker.textContent = won ? "目标达成" : "本局结束";
    messageTitle.textContent = won ? "合成 2048！" : "没有可移动方块";
    messageCopy.textContent = won ? "你可以继续冲击更大的数字。" : `最终得分 ${state.score}，再试一次吧。`;
    keepPlayingButton.hidden = !won;
    message.hidden = false;
  }

  function hideMessage() {
    message.hidden = true;
  }

  function startNewGame() {
    state = initialState();
    hideMessage();
    save();
    render();
  }

  function move(direction) {
    if (!message.hidden) return;
    const result = moveGrid(state.grid, direction);
    if (!result.changed) return;

    state.grid = addRandomTile(result.grid);
    state.score += result.gained;
    best = Math.max(best, state.score);

    if (result.gained) {
      scoreAdd.textContent = `+${result.gained}`;
      scoreAdd.classList.remove("pop");
      void scoreAdd.offsetWidth;
      scoreAdd.classList.add("pop");
    }

    render();

    if (hasWon(state.grid) && !state.wonShown) {
      state.wonShown = true;
      showMessage("won");
    } else if (!canMove(state.grid)) {
      showMessage("lost");
    }
    save();
  }

  const keyDirections = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };

  document.addEventListener("keydown", (event) => {
    const direction = keyDirections[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  });

  board.addEventListener("pointerdown", (event) => {
    touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    board.setPointerCapture?.(event.pointerId);
  });

  board.addEventListener("pointerup", (event) => {
    if (!touchStart || touchStart.id !== event.pointerId) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  });

  board.addEventListener("pointercancel", () => { touchStart = null; });
  document.querySelector("#new-game").addEventListener("click", startNewGame);
  document.querySelector("#try-again").addEventListener("click", startNewGame);
  keepPlayingButton.addEventListener("click", () => {
    state.wonShown = true;
    hideMessage();
    save();
  });

  render();
  if (!canMove(state.grid)) showMessage("lost");
}
