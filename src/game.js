/**
 * 俄罗斯方块 — 游戏核心逻辑
 *
 * 职责：
 *   - 游戏状态机（idle / playing / paused / over）
 *   - requestAnimationFrame 主循环
 *   - 处理输入动作
 *   - 协调棋盘、方块、得分、渲染
 *   - Lock Delay（落地后短暂延迟再锁定，允许最后调整）
 */

import {
  createBoard, collides, mergePiece, clearLines,
  calcScore, calcLevel, calcDropInterval, calcGhostY,
  isGameOver, tryRotate, COLS,
} from './board.js';
import { TetrominoBag, createPiece } from './tetromino.js';
import { Renderer } from './renderer.js';
import { InputManager, ACTION } from './input.js';

// 游戏状态枚举
export const STATE = Object.freeze({
  IDLE:    'idle',
  PLAYING: 'playing',
  PAUSED:  'paused',
  OVER:    'over',
});

/** Lock Delay 时间（ms）：落地后允许操作的宽限期 */
const LOCK_DELAY = 500;
/** Lock Delay 内最大操作次数（防止无限拖延） */
const MAX_LOCK_MOVES = 15;

/** 消行闪烁动画时长（ms）*/
const FLASH_DURATION = 180;

export class Game {
  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.gameCanvas
   * @param {HTMLCanvasElement} options.nextCanvas
   * @param {HTMLCanvasElement} options.holdCanvas
   * @param {object} options.ui - DOM 元素引用 { score, highScore, level, lines, overlay, overlayTitle, overlaySubtitle, overlayBtn }
   * @param {object} options.mobileButtons - 移动端按钮 DOM 引用
   */
  constructor({ gameCanvas, nextCanvas, holdCanvas, ui, mobileButtons }) {
    this.renderer = new Renderer(gameCanvas, nextCanvas, holdCanvas);
    this.input    = new InputManager();
    this.ui       = ui;

    this._state    = STATE.IDLE;
    this._rafId    = null;

    // 持久化最高分
    this._highScore = parseInt(localStorage.getItem('tetris_highScore') ?? '0', 10);
    ui.highScore.textContent = this._highScore;

    this._bindInput(mobileButtons, gameCanvas);
    this._bindOverlayBtn();
  }

  // ===== 公开 API =====

  get state() { return this._state; }

  start() {
    this._reset();
    this._setState(STATE.PLAYING);
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  pause() {
    if (this._state !== STATE.PLAYING && this._state !== STATE.PAUSED) return;
    if (this._state === STATE.PLAYING) {
      this._setState(STATE.PAUSED);
      cancelAnimationFrame(this._rafId);
      this._showOverlay('PAUSED', '按 P 继续', '继续游戏');
    } else {
      this._setState(STATE.PLAYING);
      this._hideOverlay();
      this._lastTime = performance.now();
      this._loop(this._lastTime);
    }
  }

  // ===== 游戏循环 =====

  _loop(timestamp) {
    if (this._state !== STATE.PLAYING) return;

    const delta = timestamp - this._lastTime;
    this._lastTime = timestamp;

    this._update(delta);
    this._draw();

    this._rafId = requestAnimationFrame(ts => this._loop(ts));
  }

  _update(delta) {
    // 消行闪烁动画倒计时
    if (this._flashTimer > 0) {
      this._flashTimer -= delta;
      if (this._flashTimer <= 0) {
        this._flashTimer = 0;
        this._flashAlpha = 0;
        this._clearedRowsForFlash = [];
      } else {
        this._flashAlpha = this._flashTimer / FLASH_DURATION;
      }
    }

    // 方块自动下落
    this._dropTimer += delta;
    const interval = this._softDropping
      ? Math.min(this._dropInterval / 20, 50)
      : this._dropInterval;

    if (this._dropTimer >= interval) {
      this._dropTimer = 0;
      this._autoDropPiece();
    }

    // Lock Delay 倒计时
    if (this._lockTimer !== null) {
      this._lockTimer += delta;
      if (this._lockTimer >= LOCK_DELAY) {
        this._lockPiece();
      }
    }
  }

  _draw() {
    this.renderer.render({
      board:        this._board,
      currentPiece: this._current,
      ghostY:       this._current ? calcGhostY(this._board, this._current) : null,
      nextType:     this._bag.peek(1)[0],
      holdType:     this._hold,
      holdUsed:     this._holdUsed,
      clearedRows:  this._clearedRowsForFlash,
      flashAlpha:   this._flashAlpha,
    });
  }

  // ===== 方块控制 =====

  _autoDropPiece() {
    if (!this._current) return;
    if (!collides(this._board, this._current, 0, 1)) {
      this._current.y++;
      this._resetLockDelay();
    } else {
      // 已触地：启动 Lock Delay
      if (this._lockTimer === null) {
        this._lockTimer = 0;
      }
    }
  }

  _moveLeft() {
    if (this._state !== STATE.PLAYING || !this._current) return;
    if (!collides(this._board, this._current, -1, 0)) {
      this._current.x--;
      this._onMoveDuringLock();
    }
  }

  _moveRight() {
    if (this._state !== STATE.PLAYING || !this._current) return;
    if (!collides(this._board, this._current, 1, 0)) {
      this._current.x++;
      this._onMoveDuringLock();
    }
  }

  _softDrop(active) {
    this._softDropping = active;
  }

  _hardDrop() {
    if (this._state !== STATE.PLAYING || !this._current) return;
    const ghostY = calcGhostY(this._board, this._current);
    const dropped = ghostY - this._current.y;
    this._current.y = ghostY;
    this._score += dropped * 2; // 硬降加分
    this._updateScoreUI();
    this._lockPiece();
  }

  _rotate(dir = 1) {
    if (this._state !== STATE.PLAYING || !this._current) return;
    const result = tryRotate(this._board, this._current, dir);
    if (result.success) {
      this._current = result.piece;
      this._onMoveDuringLock();
    }
  }

  _holdPiece() {
    if (this._state !== STATE.PLAYING || !this._current) return;
    if (this._holdUsed) return; // 每次落地只能暂存一次

    const type = this._current.type;
    if (this._hold) {
      this._current = createPiece(this._hold, COLS);
    } else {
      this._current = null;
      this._spawnNext();
    }
    this._hold     = type;
    this._holdUsed = true;
    this._lockTimer = null;
  }

  // ===== 锁定 & 生成 =====

  _lockPiece() {
    if (!this._current) return;
    mergePiece(this._board, this._current);
    this._current  = null;
    this._lockTimer = null;
    this._lockMoves = 0;

    const { newBoard, clearedRows, count } = clearLines(this._board);
    this._board = newBoard;

    if (count > 0) {
      this._lines += count;
      const newLevel = calcLevel(this._lines);
      if (newLevel > this._level) {
        this._level = newLevel;
        this._dropInterval = calcDropInterval(this._level);
      }
      this._score += calcScore(count, this._level);
      this._updateAllUI();

      // 触发消行闪烁
      this._clearedRowsForFlash = clearedRows;
      this._flashTimer = FLASH_DURATION;
      this._flashAlpha = 1;
    }

    if (isGameOver(this._board)) {
      this._gameOver();
      return;
    }

    this._spawnNext();
  }

  _spawnNext() {
    if (this._current) return;
    const type   = this._bag.next();
    this._current = createPiece(type, COLS);
    this._holdUsed = false;
    this._dropTimer = 0;

    // 生成即碰撞 → 游戏结束
    if (collides(this._board, this._current, 0, 0)) {
      this._gameOver();
    }
  }

  // ===== Lock Delay 辅助 =====

  _onMoveDuringLock() {
    if (this._lockTimer !== null) {
      this._lockMoves++;
      if (this._lockMoves < MAX_LOCK_MOVES) {
        this._resetLockDelay();
      }
    }
  }

  _resetLockDelay() {
    if (this._lockTimer !== null) this._lockTimer = 0;
  }

  // ===== 游戏状态管理 =====

  _reset() {
    this._board        = createBoard();
    this._bag          = new TetrominoBag();
    this._current      = null;
    this._hold         = null;
    this._holdUsed     = false;
    this._score        = 0;
    this._lines        = 0;
    this._level        = 1;
    this._dropInterval = calcDropInterval(1);
    this._dropTimer    = 0;
    this._lockTimer    = null;
    this._lockMoves    = 0;
    this._softDropping = false;

    // 消行闪烁状态
    this._clearedRowsForFlash = [];
    this._flashTimer = 0;
    this._flashAlpha = 0;

    this._updateAllUI();
    this._spawnNext();
  }

  _setState(s) { this._state = s; }

  _gameOver() {
    this._setState(STATE.OVER);
    cancelAnimationFrame(this._rafId);

    if (this._score > this._highScore) {
      this._highScore = this._score;
      localStorage.setItem('tetris_highScore', this._highScore);
      this.ui.highScore.textContent = this._highScore;
    }

    this._draw();
    this._showOverlay('GAME OVER', `得分：${this._score}`, '再来一局');
  }

  // ===== UI 更新 =====

  _updateAllUI() {
    this._updateScoreUI();
    this.ui.level.textContent = this._level;
    this.ui.lines.textContent = this._lines;
  }

  _updateScoreUI() {
    this.ui.score.textContent = this._score;
    if (this._score > this._highScore) {
      this._highScore = this._score;
      this.ui.highScore.textContent = this._highScore;
    }
  }

  // ===== Overlay =====

  _showOverlay(title, subtitle, btnText) {
    this.ui.overlayTitle.textContent    = title;
    this.ui.overlaySubtitle.textContent = subtitle;
    this.ui.overlayBtn.textContent      = btnText;
    // 画布暗化遮罩
    this.ui.overlay.classList.remove('hidden');
    // 右侧面板状态卡片
    this.ui.gameStatus.classList.remove('hidden');
  }

  _hideOverlay() {
    this.ui.overlay.classList.add('hidden');
    this.ui.gameStatus.classList.add('hidden');
  }

  _bindOverlayBtn() {
    this.ui.overlayBtn.addEventListener('click', () => {
      if (this._state === STATE.PAUSED) {
        this.pause();
      } else {
        this.start();
      }
    });
  }

  // ===== 输入绑定 =====

  _bindInput(mobileButtons, gameCanvas) {
    this.input
      .on(ACTION.MOVE_LEFT,   () => this._moveLeft())
      .on(ACTION.MOVE_RIGHT,  () => this._moveRight())
      .on(ACTION.MOVE_DOWN,   () => { if (this._state === STATE.PLAYING) this._softDrop(true); })
      .on(ACTION.ROTATE_CW,   () => this._rotate(1))
      .on(ACTION.ROTATE_CCW,  () => this._rotate(-1))
      .on(ACTION.HARD_DROP,   () => this._hardDrop())
      .on(ACTION.HOLD,        () => this._holdPiece())
      .on(ACTION.PAUSE,       () => {
        if (this._state === STATE.PLAYING || this._state === STATE.PAUSED) this.pause();
      })
      .bindKeyboard();

    // 软降松开时停止
    window.addEventListener('keyup', e => {
      if (e.code === 'ArrowDown') this._softDrop(false);
    });

    // 移动端按钮
    if (mobileButtons) {
      this.input.bindButtons(mobileButtons);
    }

    // 触摸滑动（主画布）
    this.input.bindSwipe(gameCanvas);
  }
}
