/**
 * 俄罗斯方块 — 方块定义模块
 *
 * 遵循 Tetris Guideline（TG）标准：
 *   - 7 种方块（I / O / T / S / Z / J / L）
 *   - 标准颜色
 *   - SRS（Super Rotation System）旋转，含 Wall Kick 偏移表
 */

// ===== 方块形状（0°旋转，以矩阵表示）=====
// 每个形状均以"最小包围盒"存储，1 代表实体，0 代表空格
export const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

// ===== 方块标准颜色 =====
export const COLORS = {
  I: '#06b6d4',
  O: '#eab308',
  T: '#a855f7',
  S: '#22c55e',
  Z: '#ef4444',
  J: '#3b82f6',
  L: '#f97316',
};

// ===== SRS Wall Kick 偏移表 =====
// 格式：[旋转前状态 -> 旋转后状态] => 尝试的 (dx, dy) 列表
// 参考：https://tetris.wiki/Super_Rotation_System
const WALL_KICK_JLSTZ = {
  '0->1': [[ 0, 0], [-1, 0], [-1,  1], [0, -2], [-1, -2]],
  '1->0': [[ 0, 0], [ 1, 0], [ 1, -1], [0,  2], [ 1,  2]],
  '1->2': [[ 0, 0], [ 1, 0], [ 1, -1], [0,  2], [ 1,  2]],
  '2->1': [[ 0, 0], [-1, 0], [-1,  1], [0, -2], [-1, -2]],
  '2->3': [[ 0, 0], [ 1, 0], [ 1,  1], [0, -2], [ 1, -2]],
  '3->2': [[ 0, 0], [-1, 0], [-1, -1], [0,  2], [-1,  2]],
  '3->0': [[ 0, 0], [-1, 0], [-1, -1], [0,  2], [-1,  2]],
  '0->3': [[ 0, 0], [ 1, 0], [ 1,  1], [0, -2], [ 1, -2]],
};

const WALL_KICK_I = {
  '0->1': [[ 0, 0], [-2, 0], [ 1, 0], [-2, -1], [ 1,  2]],
  '1->0': [[ 0, 0], [ 2, 0], [-1, 0], [ 2,  1], [-1, -2]],
  '1->2': [[ 0, 0], [-1, 0], [ 2, 0], [-1,  2], [ 2, -1]],
  '2->1': [[ 0, 0], [ 1, 0], [-2, 0], [ 1, -2], [-2,  1]],
  '2->3': [[ 0, 0], [ 2, 0], [-1, 0], [ 2,  1], [-1, -2]],
  '3->2': [[ 0, 0], [-2, 0], [ 1, 0], [-2, -1], [ 1,  2]],
  '3->0': [[ 0, 0], [ 1, 0], [-2, 0], [ 1, -2], [-2,  1]],
  '0->3': [[ 0, 0], [-1, 0], [ 2, 0], [-1,  2], [ 2, -1]],
};

// O 型无旋转偏移
const WALL_KICK_O = {
  '0->1': [[0, 0]], '1->0': [[0, 0]],
  '1->2': [[0, 0]], '2->1': [[0, 0]],
  '2->3': [[0, 0]], '3->2': [[0, 0]],
  '3->0': [[0, 0]], '0->3': [[0, 0]],
};

export const WALL_KICKS = { I: WALL_KICK_I, O: WALL_KICK_O };
// JLSTZ 共用同一套 kick 表
['J', 'L', 'S', 'T', 'Z'].forEach(t => { WALL_KICKS[t] = WALL_KICK_JLSTZ; });

// ===== 方块类型列表（用于 7-bag 随机器）=====
export const TETROMINO_TYPES = Object.keys(SHAPES);

/**
 * 将矩阵顺时针旋转 90°
 * @param {number[][]} matrix
 * @returns {number[][]}
 */
export function rotateMatrix(matrix) {
  const N = matrix.length;
  const M = matrix[0].length;
  const result = Array.from({ length: M }, () => new Array(N).fill(0));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < M; c++) {
      result[c][N - 1 - r] = matrix[r][c];
    }
  }
  return result;
}

/**
 * 预先计算所有方块所有旋转状态的形状
 * @returns {Object} { type: [shape0, shape1, shape2, shape3] }
 */
function buildRotations() {
  const rotations = {};
  for (const type of TETROMINO_TYPES) {
    const states = [SHAPES[type]];
    for (let i = 1; i < 4; i++) {
      states.push(rotateMatrix(states[i - 1]));
    }
    rotations[type] = states;
  }
  return rotations;
}

export const ROTATIONS = buildRotations();

/**
 * 7-bag 随机器：确保每轮 7 种方块各出现一次
 */
export class TetrominoBag {
  constructor() {
    this._bag = [];
  }

  /** 取下一个方块类型 */
  next() {
    if (this._bag.length === 0) this._refill();
    return this._bag.pop();
  }

  /** 预览接下来 n 个方块（不消耗） */
  peek(n = 1) {
    while (this._bag.length < n) this._refill();
    return this._bag.slice(this._bag.length - n).reverse();
  }

  _refill() {
    const bag = [...TETROMINO_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this._bag.push(...bag);
  }
}

/**
 * 创建一个 Tetromino 实例
 * @param {string} type
 * @param {number} boardCols
 * @returns {{ type, x, y, rotation, shape }}
 */
export function createPiece(type, boardCols = 10) {
  const shape = ROTATIONS[type][0];
  const x = Math.floor((boardCols - shape[0].length) / 2);
  const y = type === 'I' ? -1 : 0;
  return { type, x, y, rotation: 0 };
}

/**
 * 获取方块当前形状
 */
export function getPieceShape(piece) {
  return ROTATIONS[piece.type][piece.rotation];
}
