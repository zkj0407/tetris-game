/**
 * 俄罗斯方块 — Canvas 渲染模块
 *
 * 职责：
 *   - 绘制棋盘网格
 *   - 绘制已落定方块
 *   - 绘制当前活动方块
 *   - 绘制幽灵方块（落点预览）
 *   - 绘制 Next / Hold 预览
 *   - 消行闪烁动画
 */

import { COLORS, getPieceShape } from './tetromino.js';
import { COLS, ROWS, calcGhostY } from './board.js';

const CELL = 30; // 单元格像素大小，与 CSS --cell-size 保持一致

// 颜色常量
const CLR_BG        = '#13132a';
const CLR_GRID      = 'rgba(255,255,255,0.04)';
const CLR_GHOST     = 'rgba(255,255,255,0.12)';
const CLR_GHOST_BD  = 'rgba(255,255,255,0.25)';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} gameCanvas
   * @param {HTMLCanvasElement} nextCanvas
   * @param {HTMLCanvasElement} holdCanvas
   */
  constructor(gameCanvas, nextCanvas, holdCanvas) {
    this.gc  = gameCanvas;
    this.nc  = nextCanvas;
    this.hc  = holdCanvas;
    this.ctx  = gameCanvas.getContext('2d');
    this.nCtx = nextCanvas.getContext('2d');
    this.hCtx = holdCanvas.getContext('2d');

    // 根据 canvas 实际宽度自适应 cell 大小
    this.cell = gameCanvas.width / COLS;
  }

  /** 清空并绘制整帧 */
  render(state) {
    const { board, currentPiece, ghostY, nextType, holdType, holdUsed, clearedRows, flashAlpha } = state;
    this._drawBoard(board, clearedRows, flashAlpha);
    if (currentPiece) {
      this._drawGhost(board, currentPiece, ghostY);
      this._drawPiece(currentPiece);
    }
    this._drawNext(nextType);
    this._drawHold(holdType, holdUsed);
  }

  // ===== 棋盘 =====
  _drawBoard(board, clearedRows = [], flashAlpha = 0) {
    const { ctx, cell } = this;
    const W = COLS * cell;
    const H = ROWS * cell;

    // 背景
    ctx.fillStyle = CLR_BG;
    ctx.fillRect(0, 0, W, H);

    // 网格线
    ctx.strokeStyle = CLR_GRID;
    ctx.lineWidth = 0.5;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cell, 0);
      ctx.lineTo(c * cell, H);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cell);
      ctx.lineTo(W, r * cell);
      ctx.stroke();
    }

    // 已落定方块
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          this._drawCell(ctx, c, r, COLORS[board[r][c]], cell);
        }
      }
    }

    // 消行高亮闪烁
    if (clearedRows.length > 0 && flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      for (const r of clearedRows) {
        ctx.fillRect(0, r * cell, W, cell);
      }
    }
  }

  // ===== 幽灵方块 =====
  _drawGhost(board, piece, ghostY) {
    if (ghostY === undefined) ghostY = calcGhostY(board, piece);
    if (ghostY === piece.y) return; // 与当前位置重合则不绘制
    const { ctx, cell } = this;
    const shape = getPieceShape(piece);

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const px = (piece.x + c) * cell;
        const py = (ghostY + r) * cell;
        ctx.fillStyle = CLR_GHOST;
        ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
        ctx.strokeStyle = CLR_GHOST_BD;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
      }
    }
  }

  // ===== 活动方块 =====
  _drawPiece(piece) {
    const shape = getPieceShape(piece);
    const color = COLORS[piece.type];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        this._drawCell(this.ctx, piece.x + c, piece.y + r, color, this.cell);
      }
    }
  }

  // ===== 单格绘制（带立体感）=====
  _drawCell(ctx, col, row, color, cell) {
    const x = col * cell;
    const y = row * cell;
    const padding = 1;
    const inner = cell - padding * 2;

    // 主色填充
    ctx.fillStyle = color;
    ctx.fillRect(x + padding, y + padding, inner, inner);

    // 高光（左上角）
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + padding, y + padding, inner, 3);
    ctx.fillRect(x + padding, y + padding, 3, inner);

    // 阴影（右下角）
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + padding, y + cell - padding - 3, inner, 3);
    ctx.fillRect(x + cell - padding - 3, y + padding, 3, inner);
  }

  // ===== Next 预览 =====
  _drawNext(type) {
    this._drawPreview(this.nCtx, this.nc, type, false);
  }

  // ===== Hold 预览 =====
  _drawHold(type, used) {
    this._drawPreview(this.hCtx, this.hc, type, used);
  }

  _drawPreview(ctx, canvas, type, dimmed) {
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = CLR_BG;
    ctx.fillRect(0, 0, W, H);

    if (!type) return;

    const shape = getPieceShape({ type, rotation: 0 });
    const color = dimmed ? '#4a4a6a' : COLORS[type];

    const cols = shape[0].length;
    const rows = shape.length;
    const previewCell = Math.min(Math.floor(W / (cols + 2)), Math.floor(H / (rows + 2)));
    const offsetX = Math.floor((W - cols * previewCell) / 2);
    const offsetY = Math.floor((H - rows * previewCell) / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!shape[r][c]) continue;
        const x = offsetX + c * previewCell;
        const y = offsetY + r * previewCell;
        const p = 1;
        const inner = previewCell - p * 2;

        ctx.fillStyle = color;
        ctx.fillRect(x + p, y + p, inner, inner);

        if (!dimmed) {
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(x + p, y + p, inner, 3);
          ctx.fillRect(x + p, y + p, 3, inner);
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.fillRect(x + p, y + previewCell - p - 3, inner, 3);
          ctx.fillRect(x + previewCell - p - 3, y + p, 3, inner);
        }
      }
    }
  }
}

