/**
 * 俄罗斯方块 — 输入处理模块
 *
 * 支持：
 *   - 键盘（桌面端）
 *   - 移动端虚拟按钮
 *   - 触摸滑动手势
 *
 * 设计：发布订阅模式，通过 on(action, handler) 注册动作回调
 */

/** 支持的游戏动作 */
export const ACTION = Object.freeze({
  MOVE_LEFT:  'moveLeft',
  MOVE_RIGHT: 'moveRight',
  MOVE_DOWN:  'moveDown',
  ROTATE_CW:  'rotateCW',
  ROTATE_CCW: 'rotateCCW',
  HARD_DROP:  'hardDrop',
  HOLD:       'hold',
  PAUSE:      'pause',
});

// 键盘按键 -> 动作映射
const KEY_MAP = {
  ArrowLeft:  ACTION.MOVE_LEFT,
  ArrowRight: ACTION.MOVE_RIGHT,
  ArrowDown:  ACTION.MOVE_DOWN,
  ArrowUp:    ACTION.ROTATE_CW,
  KeyZ:       ACTION.ROTATE_CCW,
  Space:      ACTION.HARD_DROP,
  KeyC:       ACTION.HOLD,
  KeyP:       ACTION.PAUSE,
  Escape:     ACTION.PAUSE,
};

// 需要支持长按重复的动作
const REPEAT_ACTIONS = new Set([ACTION.MOVE_LEFT, ACTION.MOVE_RIGHT, ACTION.MOVE_DOWN]);

/** 初始重复延迟（ms）：DAS - Delayed Auto Shift */
const DAS_DELAY = 180;
/** 重复间隔（ms）：ARR - Auto Repeat Rate */
const ARR_INTERVAL = 50;

export class InputManager {
  constructor() {
    this._handlers = {};
    this._dasTimers = {};
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp   = this._onKeyUp.bind(this);
    this._pressedKeys  = new Set();
  }

  /** 注册动作回调 */
  on(action, handler) {
    this._handlers[action] = handler;
    return this;
  }

  /** 绑定键盘事件 */
  bindKeyboard() {
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup',   this._boundKeyUp);
    return this;
  }

  /** 绑定移动端虚拟按钮 */
  bindButtons({ left, right, down, rotate, hardDrop, hold }) {
    const map = [
      [left,     ACTION.MOVE_LEFT],
      [right,    ACTION.MOVE_RIGHT],
      [down,     ACTION.MOVE_DOWN],
      [rotate,   ACTION.ROTATE_CW],
      [hardDrop, ACTION.HARD_DROP],
      [hold,     ACTION.HOLD],
    ];

    for (const [el, action] of map) {
      if (!el) continue;
      if (REPEAT_ACTIONS.has(action)) {
        this._bindRepeatButton(el, action);
      } else {
        el.addEventListener('touchstart', e => { e.preventDefault(); this._emit(action); }, { passive: false });
        el.addEventListener('mousedown',  () => this._emit(action));
      }
    }
    return this;
  }

  /** 绑定触摸滑动手势 */
  bindSwipe(element) {
    let startX = 0, startY = 0, startTime = 0;
    const SWIPE_THRESHOLD = 30; // px
    const TAP_THRESHOLD   = 10; // px
    const TAP_TIME        = 250; // ms

    element.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
    }, { passive: true });

    element.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startTime;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD && dt < TAP_TIME) {
        this._emit(ACTION.ROTATE_CW);
        return;
      }

      if (absDx > absDy && absDx > SWIPE_THRESHOLD) {
        this._emit(dx > 0 ? ACTION.MOVE_RIGHT : ACTION.MOVE_LEFT);
      } else if (absDy > absDx && absDy > SWIPE_THRESHOLD) {
        if (dy > 0) {
          // 快速下滑 = 硬降，慢速 = 软降
          dt < 300 ? this._emit(ACTION.HARD_DROP) : this._emit(ACTION.MOVE_DOWN);
        }
      }
    }, { passive: true });

    return this;
  }

  /** 销毁所有事件监听 */
  destroy() {
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup',   this._boundKeyUp);
    for (const t of Object.values(this._dasTimers)) clearTimeout(t);
  }

  // ===== 内部方法 =====

  _emit(action) {
    this._handlers[action]?.();
  }

  _onKeyDown(e) {
    const action = KEY_MAP[e.code];
    if (!action) return;

    // 阻止空格键滚动页面等默认行为
    if (e.code === 'Space' || e.code === 'ArrowDown') e.preventDefault();

    if (this._pressedKeys.has(e.code)) return; // 已按住，忽略重复触发
    this._pressedKeys.add(e.code);

    this._emit(action);

    // DAS / ARR 重复
    if (REPEAT_ACTIONS.has(action)) {
      this._dasTimers[e.code] = setTimeout(() => {
        this._dasTimers[e.code] = setInterval(() => {
          if (this._pressedKeys.has(e.code)) this._emit(action);
        }, ARR_INTERVAL);
      }, DAS_DELAY);
    }
  }

  _onKeyUp(e) {
    this._pressedKeys.delete(e.code);
    const timer = this._dasTimers[e.code];
    if (timer !== undefined) {
      clearTimeout(timer);
      clearInterval(timer);
      delete this._dasTimers[e.code];
    }
  }

  _bindRepeatButton(el, action) {
    let timer = null;
    const start = (e) => {
      e.preventDefault();
      this._emit(action);
      timer = setTimeout(() => {
        timer = setInterval(() => this._emit(action), ARR_INTERVAL);
      }, DAS_DELAY);
    };
    const stop = () => {
      clearTimeout(timer);
      clearInterval(timer);
      timer = null;
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend',   stop,  { passive: true });
    el.addEventListener('touchcancel',stop,  { passive: true });
    el.addEventListener('mousedown',  start);
    el.addEventListener('mouseup',    stop);
    el.addEventListener('mouseleave', stop);
  }
}
