import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFocusShield,
  applyShieldState,
} from '../src/js/utils/exam-focus-shield.js';

class MockEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
  }

  removeEventListener(event, handler) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  dispatchEvent(event, eventObj = {}) {
    const set = this._listeners.get(event);
    if (set) {
      for (const handler of Array.from(set)) {
        handler(eventObj);
      }
    }
  }

  listenerCount(event) {
    return this._listeners.get(event)?.size || 0;
  }
}

class MockElement {
  constructor() {
    this.attributes = new Map();
    this.hidden = false;
    this.classList = {
      _classes: new Set(),
      add: (cls) => this.classList._classes.add(cls),
      remove: (cls) => this.classList._classes.delete(cls),
      contains: (cls) => this.classList._classes.has(cls),
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
}

function createHarness(options = {}) {
  const win = new MockEventTarget();
  const doc = new MockEventTarget();
  doc.visibilityState = options.visibilityState ?? 'visible';
  doc._hasFocus = options.hasFocus ?? true;
  doc.hasFocus = () => doc._hasFocus;
  doc.activeElement = options.activeElement ?? null;

  const changes = [];
  let active = options.isActive ?? true;
  const isActive = typeof active === 'function' ? active : () => active;

  const shield = createFocusShield({
    win,
    doc,
    isActive,
    onChange: (shielded) => changes.push(shielded),
  });

  return {
    win,
    doc,
    shield,
    changes,
    setActive: (val) => {
      active = val;
    },
  };
}

test('che khi window blur và mở khi window focus', () => {
  const h = createHarness();
  h.shield.attach();

  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, []);

  // Blur window
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), true);
  assert.deepEqual(h.changes, [true]);

  // Focus window
  h.win.dispatchEvent('focus');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false]);
});

test('che khi document hidden và mở khi document visible', () => {
  const h = createHarness();
  h.shield.attach();

  // Chuyển tab sang hidden
  h.doc.visibilityState = 'hidden';
  h.doc.dispatchEvent('visibilitychange');
  assert.equal(h.shield.isShielded(), true);
  assert.deepEqual(h.changes, [true]);

  // Quay lại tab visible (đã có focus)
  h.doc.visibilityState = 'visible';
  h.doc._hasFocus = true;
  h.doc.dispatchEvent('visibilitychange');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false]);
});

test('visible nhưng chưa có focus vẫn giữ màn che cho đến khi focus', () => {
  const h = createHarness();
  h.shield.attach();

  // Blur sau đó hidden
  h.win.dispatchEvent('blur');
  h.doc.visibilityState = 'hidden';
  h.doc.dispatchEvent('visibilitychange');
  assert.equal(h.shield.isShielded(), true);
  assert.deepEqual(h.changes, [true]);

  // Tab visible nhưng document.hasFocus() vẫn false
  h.doc.visibilityState = 'visible';
  h.doc._hasFocus = false;
  h.doc.dispatchEvent('visibilitychange');
  assert.equal(h.shield.isShielded(), true, 'vẫn che vì chưa focus');
  assert.deepEqual(h.changes, [true]);

  // Focus vào window -> mở che (trình duyệt thật: hasFocus() = true khi focus bắn)
  h.doc._hasFocus = true;
  h.win.dispatchEvent('focus');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false]);
});

test('mất focus TRƯỚC khi bài thi active vẫn bị che khi sync (review T6)', () => {
  const h = createHarness({ isActive: false });
  h.shield.attach();
  // Học sinh bấm sang cửa sổ khác trong lúc init phiên thi
  h.doc._hasFocus = false;
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), false, 'chưa active thì chưa che');
  // Init xong -> examStarted = true -> sync
  h.setActive(true);
  h.shield.sync();
  assert.equal(h.shield.isShielded(), true, 'cửa sổ không có focus phải bị che ngay khi active');
  h.doc._hasFocus = true;
  h.win.dispatchEvent('focus');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false]);
});

test('chạm/bấm phím trên trang mở che khi trình duyệt không bắn focus; hasFocus() chỉ hỏi lúc chuyển active', () => {
  const h = createHarness({ isActive: false, hasFocus: false });
  h.shield.attach();
  h.setActive(true);
  h.shield.sync();
  assert.equal(h.shield.isShielded(), true, 'active khi không có focus -> che');
  // Webview báo hasFocus() sai mãi: chạm vào trang phải mở che, không kẹt
  h.doc.dispatchEvent('pointerdown');
  assert.equal(h.shield.isShielded(), false);
  // sync lại không được hỏi hasFocus() nữa (đã active)
  h.shield.sync();
  assert.equal(h.shield.isShielded(), false, 'không che lại chỉ vì hasFocus() sai');
  // Rời trang thật -> che, bấm phím khi đã quay lại -> mở
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), true);
  h.doc.dispatchEvent('keydown');
  assert.equal(h.shield.isShielded(), false);
  // Đang hidden thì tương tác không mở được
  h.doc.visibilityState = 'hidden';
  h.doc.dispatchEvent('visibilitychange');
  h.doc.dispatchEvent('pointerdown');
  assert.equal(h.shield.isShielded(), true);
});

test('không che khi isActive là false', () => {
  const h = createHarness({ isActive: false });
  h.shield.attach();

  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, []);

  h.doc.visibilityState = 'hidden';
  h.doc.dispatchEvent('visibilitychange');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, []);
});

test('sync tính lại trạng thái khi isActive thay đổi', () => {
  const h = createHarness({ isActive: true });
  h.shield.attach();

  // Đang che
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), true);
  assert.deepEqual(h.changes, [true]);

  // Nộp bài -> isActive thành false -> gọi sync()
  h.setActive(false);
  h.shield.sync();
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false]);

  // Trong lúc isActive false, blur hoặc hidden không làm che
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false]);

  // Bắt đầu thi lại trong khi tab đang hidden -> isActive thành true -> sync()
  h.setActive(true);
  h.doc.visibilityState = 'hidden';
  h.shield.sync();
  assert.equal(h.shield.isShielded(), true);
  assert.deepEqual(h.changes, [true, false, true]);
});

test('idempotent: blur và hidden xảy ra cùng lúc chỉ gọi onChange 1 lần', () => {
  const h = createHarness();
  h.shield.attach();

  // Cả blur và hidden kích hoạt liên tiếp
  h.win.dispatchEvent('blur');
  h.doc.visibilityState = 'hidden';
  h.doc.dispatchEvent('visibilitychange');
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), true);
  assert.equal(h.changes.length, 1);
  assert.deepEqual(h.changes, [true]);

  // Visible và focus liên tiếp
  h.doc.visibilityState = 'visible';
  h.doc._hasFocus = true;
  h.doc.dispatchEvent('visibilitychange');
  h.win.dispatchEvent('focus');
  assert.equal(h.shield.isShielded(), false);
  assert.equal(h.changes.length, 2);
  assert.deepEqual(h.changes, [true, false]);
});

test('bỏ qua sự kiện blur khi activeElement là IFRAME', () => {
  const h = createHarness();
  h.shield.attach();

  // Focus chuyển vào iframe nội bộ
  h.doc.activeElement = { tagName: 'IFRAME' };
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, []);

  // TagName thường (ví dụ chữ thường iframe) cũng được bỏ qua an toàn
  h.doc.activeElement = { tagName: 'iframe' };
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, []);

  // Chuyển sang phần tử khác (không phải iframe) -> blur che bài
  h.doc.activeElement = { tagName: 'BODY' };
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), true);
  assert.deepEqual(h.changes, [true]);
});

test('attach idempotent và detach gỡ hết listener, reset trạng thái che', () => {
  const h = createHarness();

  h.shield.attach();
  h.shield.attach(); // Gọi lần 2 không gây trùng lặp
  assert.equal(h.win.listenerCount('blur'), 1);
  assert.equal(h.win.listenerCount('focus'), 1);
  assert.equal(h.doc.listenerCount('visibilitychange'), 1);

  // Kích hoạt che
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), true);
  assert.deepEqual(h.changes, [true]);

  // Detach
  h.shield.detach();
  assert.equal(h.win.listenerCount('blur'), 0);
  assert.equal(h.win.listenerCount('focus'), 0);
  assert.equal(h.doc.listenerCount('visibilitychange'), 0);
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false], 'detach gọi onChange(false) nếu đang che');

  // Detach lần 2 không gây lỗi
  h.shield.detach();
  assert.deepEqual(h.changes, [true, false]);

  // Các sự kiện sau khi detach không còn tác dụng
  h.win.dispatchEvent('blur');
  assert.equal(h.shield.isShielded(), false);
  assert.deepEqual(h.changes, [true, false]);
});

test('applyShieldState đặt và gỡ inert, aria-hidden, class và hidden', () => {
  const shieldEl = new MockElement();
  shieldEl.hidden = true;
  const contentEl1 = new MockElement();
  const contentEl2 = new MockElement();
  const rootEl = new MockElement();

  // Áp dụng trạng thái che
  applyShieldState({
    shielded: true,
    shieldEl,
    contentEls: [contentEl1, contentEl2],
    rootEl,
  });

  assert.equal(shieldEl.hidden, false);
  assert.equal(contentEl1.getAttribute('inert'), '');
  assert.equal(contentEl1.getAttribute('aria-hidden'), 'true');
  assert.equal(contentEl2.getAttribute('inert'), '');
  assert.equal(contentEl2.getAttribute('aria-hidden'), 'true');
  assert.equal(rootEl.classList.contains('exam-shielded'), true);

  // Gỡ trạng thái che
  applyShieldState({
    shielded: false,
    shieldEl,
    contentEls: [contentEl1, contentEl2],
    rootEl,
  });

  assert.equal(shieldEl.hidden, true);
  assert.equal(contentEl1.hasAttribute('inert'), false);
  assert.equal(contentEl1.hasAttribute('aria-hidden'), false);
  assert.equal(contentEl2.hasAttribute('inert'), false);
  assert.equal(contentEl2.hasAttribute('aria-hidden'), false);
  assert.equal(rootEl.classList.contains('exam-shielded'), false);
});

test('applyShieldState xử lý an toàn phần tử null/undefined', () => {
  const contentEl = new MockElement();

  // Không quăng ngoại lệ khi phần tử bị null/undefined
  assert.doesNotThrow(() => {
    applyShieldState({
      shielded: true,
      shieldEl: null,
      contentEls: [null, contentEl, undefined],
      rootEl: null,
    });
  });

  assert.equal(contentEl.getAttribute('inert'), '');
  assert.equal(contentEl.getAttribute('aria-hidden'), 'true');

  assert.doesNotThrow(() => {
    applyShieldState({
      shielded: false,
      shieldEl: null,
      contentEls: [null, contentEl],
      rootEl: null,
    });
  });

  assert.equal(contentEl.hasAttribute('inert'), false);
  assert.equal(contentEl.hasAttribute('aria-hidden'), false);

  // Gọi không truyền tham số
  assert.doesNotThrow(() => {
    applyShieldState();
  });
});
