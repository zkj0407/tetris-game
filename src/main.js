/**
 * 俄罗斯方块 — 入口模块
 *
 * 职责：
 *   - 获取 DOM 引用
 *   - 实例化 Game
 *   - 绑定页面级事件（可见性变化、窗口失焦自动暂停）
 */

import { Game, STATE } from './game.js';

function main() {
  // ===== DOM 引用 =====
  const gameCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('gameCanvas'));
  const nextCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('nextCanvas'));
  const holdCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('holdCanvas'));

  const ui = {
    score:          document.getElementById('score'),
    highScore:      document.getElementById('highScore'),
    level:          document.getElementById('level'),
    lines:          document.getElementById('lines'),
    overlay:        document.getElementById('overlay'),
    overlayTitle:   document.getElementById('overlayTitle'),
    overlaySubtitle:document.getElementById('overlaySubtitle'),
    overlayBtn:     document.getElementById('overlayBtn'),
    gameStatus:     document.getElementById('gameStatus'),
  };

  const mobileButtons = {
    left:     document.getElementById('btnLeft'),
    right:    document.getElementById('btnRight'),
    down:     document.getElementById('btnDown'),
    rotate:   document.getElementById('btnRotate'),
    hardDrop: document.getElementById('btnHardDrop'),
    hold:     document.getElementById('btnHold'),
  };

  // ===== 实例化游戏 =====
  const game = new Game({ gameCanvas, nextCanvas, holdCanvas, ui, mobileButtons });

  // ===== 页面可见性变化：切换标签页时自动暂停 =====
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === STATE.PLAYING) {
      game.pause();
    }
  });

  // ===== 窗口失焦时自动暂停 =====
  window.addEventListener('blur', () => {
    if (game.state === STATE.PLAYING) game.pause();
  });

  // ===== 防止触摸时页面滚动 =====
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
}

// DOM 就绪后执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
