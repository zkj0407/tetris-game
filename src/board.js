/**
 * 俄罗斯方块 — 棋盘模块
 *
 * 职责：
 *   - 维护棋盘二维矩阵（每格存储方块类型或 null）
 *   - 碰撞检测（与边界、已落定方块）
 *   - 方块落定（merge）
 *   - 消行 & 计算得分
 *   - 幽灵方块（Ghost Piece）计算
 */

import { getPieceShape, WALL_KICKS } from './tetromino.js';

export const COLS = 10;
export const ROWS = 20;
/** 隐藏区域（顶部不可见行数），方块从此处生成 */
export const HIDDEN_ROWS = 2;

/**
 * 创建空棋盘
 * @returns {(string|null)[][]} ROWS 行 × COLS 列，初始全为 null
 */
export function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

/**
 * 深拷贝棋盘
 */
export function cloneBoard(board) {
  return board.map(row => [...row]);
}

/**
 * 碰撞检测
 * @param {(string|null)[][]} board
 * @param {{ type, x, y, rotation }} piece
 * @param {number} dx - 水平偏移
 * @param {number} dy - 垂直偏移
 * @param {number} rotation - 旋转状态（可选，默认使用 piece.rotation）
 * @returns {boolean} true = 有碰撞
 */
export function collides(board, piece, dx = 0, dy = 0, rotation = piece.rotation) {
  const shape = getPieceShape({ ...piece, rotation });
  const nx = piece.x + dx;
  const ny = piece.y + dy;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const boardRow = ny + r;
      const boardCol = nx + c;

      if (boardCol < 0 || boardCol >= COLS) return true;
      if (boardRow >= ROWS) return true;
      // 在隐藏区域上方不检测已落定方块
      if (boardRow < 0) continue;
      if (board[boardRow][boardCol]) return true;
    }
  }
  return false;
}

/**
 * 将当前方块合并到棋盘
 * @param {(string|null)[][]} board
 * @param {{ type, x, y, rotation }} piece
 */
export function mergePiece(board, piece) {
  const shape = getPieceShape(piece);
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const boardRow = piece.y + r;
      const boardCol = piece.x + c;
      if (boardRow >= 0 && boardRow < ROWS) {
        board[boardRow][boardCol] = piece.type;
      }
    }
  }
}

/**
 * 消行逻辑
 * @param {(string|null)[][]} board
 * @returns {{ newBoard: (string|null)[][], clearedRows: number[], count: number }}
 */
export function clearLines(board) {
  const clearedRows = [];
  const remaining = [];

  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(cell => cell !== null)) {
      clearedRows.push(r);
    } else {
      remaining.push([...board[r]]);
    }
  }

  const count = clearedRows.length;
  if (count === 0) return { newBoard: board, clearedRows, count };

  // 在顶部补充空行
  const emptyRows = Array.from({ length: count }, () => new Array(COLS).fill(null));
  const newBoard = [...emptyRows, ...remaining];

  return { newBoard, clearedRows, count };
}

/**
 * 根据消行数计算得分（Tetris Guideline）
 * @param {number} lines - 本次消行数
 * @param {number} level - 当前等级
 * @returns {number}
 */
export function calcScore(lines, level) {
  const base = [0, 100, 300, 500, 800];
  return (base[lines] ?? 0) * level;
}

/**
 * 根据总消行数计算等级
 * @param {number} totalLines
 * @returns {number}
 */
export function calcLevel(totalLines) {
  return Math.floor(totalLines / 10) + 1;
}

/**
 * 根据等级计算方块下落间隔（ms）
 * 公式参考 Tetris Guideline：(0.8 - (level-1)*0.007)^(level-1) 秒
 * @param {number} level
 * @returns {number}
 */
export function calcDropInterval(level) {
  const seconds = Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  return Math.max(Math.round(seconds * 1000), 100);
}

/**
 * 计算幽灵方块的 Y 坐标（方块自由落体的最终位置）
 * @param {(string|null)[][]} board
 * @param {{ type, x, y, rotation }} piece
 * @returns {number} ghostY
 */
export function calcGhostY(board, piece) {
  let dy = 0;
  while (!collides(board, piece, 0, dy + 1)) {
    dy++;
  }
  return piece.y + dy;
}

/**
 * SRS 旋转：尝试旋转并应用 Wall Kick
 * @param {(string|null)[][]} board
 * @param {{ type, x, y, rotation }} piece
 * @param {number} dir - 1 = 顺时针，-1 = 逆时针
 * @returns {{ success: boolean, piece?: object }}
 */
export function tryRotate(board, piece, dir = 1) {
  const newRotation = ((piece.rotation + dir) % 4 + 4) % 4;
  const key = `${piece.rotation}->${newRotation}`;
  const kicks = WALL_KICKS[piece.type][key] ?? [[0, 0]];

  for (const [dx, dy] of kicks) {
    if (!collides(board, piece, dx, dy, newRotation)) {
      return {
        success: true,
        piece: { ...piece, rotation: newRotation, x: piece.x + dx, y: piece.y + dy },
      };
    }
  }
  return { success: false };
}

/**
 * 检查游戏是否结束（有方块超出棋盘顶部可见区域）
 * @param {(string|null)[][]} board
 * @returns {boolean}
 */
export function isGameOver(board) {
  return board[0].some(cell => cell !== null) || board[1].some(cell => cell !== null);
}
