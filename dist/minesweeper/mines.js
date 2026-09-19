export const DIFFICULTIES = Object.freeze({
  beginner: { label: "初级", rows: 9, cols: 9, mines: 10 },
  intermediate: { label: "中级", rows: 16, cols: 16, mines: 40 },
  expert: { label: "高级", rows: 16, cols: 30, mines: 99 },
});

export function getNeighbors(index, rows, cols) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const neighbors = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
        neighbors.push(nextRow * cols + nextCol);
      }
    }
  }
  return neighbors;
}

export function createBoard(rows, cols, mineCount, safeIndex, random = Math.random) {
  const size = rows * cols;
  if (mineCount < 1 || mineCount >= size) throw new RangeError("Invalid mine count");
  const safe = new Set([safeIndex, ...getNeighbors(safeIndex, rows, cols)]);
  let candidates = Array.from({ length: size }, (_, index) => index).filter((index) => !safe.has(index));
  if (candidates.length < mineCount) {
    candidates = Array.from({ length: size }, (_, index) => index).filter((index) => index !== safeIndex);
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }
  const mines = new Set(candidates.slice(0, mineCount));

  return Array.from({ length: size }, (_, index) => ({
    mine: mines.has(index),
    adjacent: mines.has(index)
      ? 0
      : getNeighbors(index, rows, cols).filter((neighbor) => mines.has(neighbor)).length,
    revealed: false,
    flagged: false,
    exploded: false,
  }));
}

export function revealCell(board, startIndex, rows, cols) {
  if (board[startIndex]?.flagged || board[startIndex]?.revealed) {
    return { board, exploded: false, revealedCount: 0 };
  }
  const next = board.map((cell) => ({ ...cell }));
  if (next[startIndex].mine) {
    next[startIndex].revealed = true;
    next[startIndex].exploded = true;
    return { board: next, exploded: true, revealedCount: 1 };
  }

  const queue = [startIndex];
  const visited = new Set();
  let revealedCount = 0;
  while (queue.length) {
    const index = queue.shift();
    if (visited.has(index)) continue;
    visited.add(index);
    const cell = next[index];
    if (cell.flagged || cell.mine || cell.revealed) continue;
    cell.revealed = true;
    revealedCount += 1;
    if (cell.adjacent === 0) {
      getNeighbors(index, rows, cols).forEach((neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
  }
  return { board: next, exploded: false, revealedCount };
}

export function toggleFlag(board, index) {
  if (!board[index] || board[index].revealed) return board;
  return board.map((cell, cellIndex) => cellIndex === index ? { ...cell, flagged: !cell.flagged } : cell);
}

export function chordCell(board, index, rows, cols) {
  const cell = board[index];
  if (!cell?.revealed || cell.mine || cell.adjacent === 0) {
    return { board, matched: false, exploded: false, revealedCount: 0 };
  }
  const neighbors = getNeighbors(index, rows, cols);
  const flagCount = neighbors.filter((neighbor) => board[neighbor].flagged).length;
  if (flagCount !== cell.adjacent) {
    return { board, matched: false, exploded: false, revealedCount: 0 };
  }

  let next = board;
  let revealedCount = 0;
  for (const neighbor of neighbors) {
    if (next[neighbor].flagged || next[neighbor].revealed) continue;
    const result = revealCell(next, neighbor, rows, cols);
    next = result.board;
    revealedCount += result.revealedCount;
    if (result.exploded) {
      return { board: next, matched: true, exploded: true, revealedCount };
    }
  }
  return { board: next, matched: true, exploded: false, revealedCount };
}

export function isWin(board) {
  return board.every((cell) => cell.mine || cell.revealed);
}

function blankBoard(rows, cols) {
  return Array.from({ length: rows * cols }, () => ({
    mine: false,
    adjacent: 0,
    revealed: false,
    flagged: false,
    exploded: false,
  }));
}

if (typeof document !== "undefined") {
  const boardNode = document.querySelector("#mine-board");
  const mineCountNode = document.querySelector("#mine-count");
  const timerNode = document.querySelector("#timer");
  const bestNode = document.querySelector("#mine-best");
  const statusNode = document.querySelector("#game-status");
  const resetButton = document.querySelector("#reset-game");
  const flagModeButton = document.querySelector("#flag-mode");
  const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];

  let difficultyKey = "beginner";
  let config = DIFFICULTIES[difficultyKey];
  let board = blankBoard(config.rows, config.cols);
  let started = false;
  let finished = false;
  let flagMode = false;
  let seconds = 0;
  let timer = null;
  let longPressTimer = null;
  let longPressed = false;
  let lastNumberClick = { index: -1, time: 0 };

  function bestKey() { return `dontpanic42-mines-best-${difficultyKey}`; }
  function getBest() { return Number(localStorage.getItem(bestKey())) || 0; }
  function formatTime(value) { return String(Math.min(value, 999)).padStart(3, "0"); }

  function startTimer() {
    if (timer) return;
    timer = setInterval(() => {
      seconds += 1;
      timerNode.textContent = formatTime(seconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  function render() {
    boardNode.style.setProperty("--rows", config.rows);
    boardNode.style.setProperty("--cols", config.cols);
    boardNode.dataset.difficulty = difficultyKey;
    boardNode.replaceChildren();
    board.forEach((cell, index) => {
      const button = document.createElement("button");
      button.className = "mine-cell";
      button.type = "button";
      button.dataset.index = String(index);
      if (cell.revealed) button.dataset.revealed = "true";
      if (cell.exploded) button.dataset.exploded = "true";
      if (cell.revealed && cell.mine) {
        button.textContent = "✹";
        button.setAttribute("aria-label", "地雷");
      } else if (cell.flagged) {
        button.textContent = "⚑";
        button.setAttribute("aria-label", "已插旗");
      } else if (cell.revealed && cell.adjacent) {
        button.textContent = String(cell.adjacent);
        button.dataset.number = String(cell.adjacent);
        button.setAttribute("aria-label", `周围有 ${cell.adjacent} 个地雷`);
      } else {
        button.setAttribute("aria-label", cell.revealed ? "空白" : "未翻开");
      }
      button.disabled = finished;
      boardNode.append(button);
    });
    const flags = board.filter((cell) => cell.flagged).length;
    mineCountNode.textContent = String(config.mines - flags).padStart(3, "0");
    timerNode.textContent = formatTime(seconds);
    const best = getBest();
    bestNode.textContent = best ? `${best} 秒` : "暂无";
    flagModeButton.classList.toggle("active", flagMode);
    flagModeButton.setAttribute("aria-pressed", String(flagMode));
  }

  function resetGame() {
    stopTimer();
    board = blankBoard(config.rows, config.cols);
    started = false;
    finished = false;
    seconds = 0;
    statusNode.textContent = "首次点击安全；双击数字可快速展开";
    resetButton.textContent = "🙂";
    render();
  }

  function finishGame(won) {
    finished = true;
    stopTimer();
    if (won) {
      board = board.map((cell) => cell.mine ? { ...cell, flagged: true } : cell);
      const previous = getBest();
      if (!previous || seconds < previous) localStorage.setItem(bestKey(), String(seconds));
      statusNode.textContent = `排雷成功，用时 ${seconds} 秒！`;
      resetButton.textContent = "😎";
    } else {
      board = board.map((cell) => cell.mine ? { ...cell, revealed: true } : cell);
      statusNode.textContent = "踩到地雷了，再试一次吧";
      resetButton.textContent = "😵";
    }
    render();
  }

  function reveal(index) {
    if (finished || board[index]?.flagged) return;
    if (!started) {
      board = createBoard(config.rows, config.cols, config.mines, index);
      started = true;
      startTimer();
    }
    const result = revealCell(board, index, config.rows, config.cols);
    board = result.board;
    if (result.exploded) finishGame(false);
    else if (isWin(board)) finishGame(true);
    else render();
  }

  function flag(index) {
    if (finished) return;
    board = toggleFlag(board, index);
    render();
  }

  function chord(index) {
    if (finished || !started) return;
    const result = chordCell(board, index, config.rows, config.cols);
    if (!result.matched) {
      if (board[index]?.revealed && board[index]?.adjacent) {
        statusNode.textContent = `周围需插 ${board[index].adjacent} 面旗，才能快速展开`;
      }
      return;
    }
    board = result.board;
    if (result.exploded) finishGame(false);
    else if (isWin(board)) finishGame(true);
    else {
      statusNode.textContent = "已展开确定安全的相邻格";
      render();
    }
  }

  boardNode.addEventListener("click", (event) => {
    const cell = event.target.closest(".mine-cell");
    if (!cell || longPressed) {
      longPressed = false;
      return;
    }
    const index = Number(cell.dataset.index);
    if (flagMode) {
      flag(index);
      return;
    }
    if (board[index]?.revealed && board[index]?.adjacent) {
      const now = Date.now();
      if (lastNumberClick.index === index && now - lastNumberClick.time <= 360) {
        chord(index);
        lastNumberClick = { index: -1, time: 0 };
      } else {
        lastNumberClick = { index, time: now };
      }
      return;
    }
    reveal(index);
  });

  boardNode.addEventListener("dblclick", (event) => {
    const cell = event.target.closest(".mine-cell");
    if (!cell) return;
    event.preventDefault();
  });

  boardNode.addEventListener("contextmenu", (event) => {
    const cell = event.target.closest(".mine-cell");
    if (!cell) return;
    event.preventDefault();
    flag(Number(cell.dataset.index));
  });

  boardNode.addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".mine-cell");
    if (!cell || event.pointerType === "mouse") return;
    longPressed = false;
    longPressTimer = setTimeout(() => {
      longPressed = true;
      flag(Number(cell.dataset.index));
      navigator.vibrate?.(25);
    }, 480);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    boardNode.addEventListener(eventName, () => clearTimeout(longPressTimer));
  });

  resetButton.addEventListener("click", resetGame);
  flagModeButton.addEventListener("click", () => {
    flagMode = !flagMode;
    render();
  });
  difficultyButtons.forEach((button) => button.addEventListener("click", () => {
    difficultyKey = button.dataset.difficulty;
    config = DIFFICULTIES[difficultyKey];
    difficultyButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    resetGame();
  }));

  resetGame();
}
