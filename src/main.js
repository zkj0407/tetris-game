/**
 * 俄罗斯方块 — 入口模块
 *
 * 职责：
 *   - 获取 DOM 引用
 *   - 实例化 Game
 *   - 绑定页面级事件（可见性变化、窗口失焦自动暂停）
 */

import { Game, STATE } from './game.js';

/**
 * 根据视口大小动态设置 canvas 尺寸，让游戏在任何设备上都能最佳填满屏幕。
 * 与 style.css 中的 --panel-width / --layout-gap 断点保持一致。
 */
function resizeCanvases(gameCanvas, nextCanvas, holdCanvas) {
  const COLS = 10, ROWS = 20;
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;

  // 与 CSS 断点对应的布局参数
  const isMobile = vw <= 600;
  const isTiny   = vw <= 400;
  const panelW   = isTiny ? 64 : (isMobile ? 80 : 130);
  const gap      = isTiny ? 8  : (isMobile ? 10 : 16);

  // 水平方向：两侧面板 + 两个 gap + app 左右 padding(32px)
  const reservedW = panelW * 2 + gap * 2 + 32;

  // 垂直方向：标题 + app 上下 padding + gap + 移动端按钮区
  const headerH      = isMobile ? 48 : 56;
  const appPadV      = isMobile ? 24 : 24;
  const mobileCtrlH  = isMobile ? 146 : 0;
  const reservedH    = headerH + appPadV + gap + mobileCtrlH;

  const cellByW = Math.floor((vw - reservedW) / COLS);
  const cellByH = Math.floor((vh - reservedH) / ROWS);
  const cell    = Math.max(14, Math.min(cellByW, cellByH, 40));

  gameCanvas.width  = cell * COLS;
  gameCanvas.height = cell * ROWS;

  const preview     = Math.round(cell * 4);
  nextCanvas.width  = preview;
  nextCanvas.height = preview;
  holdCanvas.width  = preview;
  holdCanvas.height = preview;
}

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

  // ===== 初始化 canvas 尺寸（在实例化 Game 之前） =====
  resizeCanvases(gameCanvas, nextCanvas, holdCanvas);

  // ===== 实例化游戏 =====
  const game = new Game({ gameCanvas, nextCanvas, holdCanvas, ui, mobileButtons });

  // ===== 窗口 resize：重新计算 canvas 尺寸并刷新画面 =====
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvases(gameCanvas, nextCanvas, holdCanvas);
      game.forceRender();
    }, 80);
  };
  window.addEventListener('resize', onResize);
  // 移动端旋转屏幕时也触发
  screen.orientation?.addEventListener('change', onResize);

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
