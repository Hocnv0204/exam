/**
 * Exam Focus Shield logic module
 * Pure ES module, no global DOM references at top level, runnable in Node.
 */

export function createFocusShield({
  win,
  doc,
  isActive = () => true,
  onChange = () => {},
} = {}) {
  let isAttached = false;
  let hasLostFocus = false;
  let currentShielded = false;
  let wasActive = false;

  function computeShielded() {
    if (!isActive()) {
      hasLostFocus = false;
      wasActive = false;
      return false;
    }
    if (!wasActive) {
      wasActive = true;
      // Cửa sổ có thể đã mất focus trước khi bài thi active (vd. blur trong lúc init phiên).
      // Chỉ hỏi hasFocus() tại thời điểm chuyển sang active; không hỏi liên tục vì một số
      // webview báo sai và có thể làm học sinh kẹt màn che.
      if (typeof doc?.hasFocus === 'function' && doc.hasFocus() === false) hasLostFocus = true;
    }
    const isHidden = doc?.visibilityState === 'hidden';
    return Boolean(isHidden || hasLostFocus);
  }

  function updateState() {
    if (!isAttached) {
      if (currentShielded) {
        currentShielded = false;
        onChange(false);
      }
      return;
    }

    const nextShielded = computeShielded();
    if (nextShielded !== currentShielded) {
      currentShielded = nextShielded;
      onChange(currentShielded);
    }
  }

  function onBlur() {
    if (!isAttached) return;
    const tag = doc?.activeElement?.tagName;
    if (typeof tag === 'string' && tag.toUpperCase() === 'IFRAME') {
      return;
    }
    hasLostFocus = true;
    updateState();
  }

  function onFocus() {
    if (!isAttached) return;
    hasLostFocus = false;
    updateState();
  }

  // Học sinh chạm / bấm phím trên trang => chắc chắn đang ở trang: mở che (chống kẹt khi
  // trình duyệt không bắn 'focus').
  function onUserInteraction() {
    if (!isAttached) return;
    if (doc?.visibilityState === 'hidden') return;
    if (hasLostFocus) {
      hasLostFocus = false;
      updateState();
    }
  }

  function onVisibilityChange() {
    if (!isAttached) return;
    if (doc?.visibilityState === 'hidden') {
      updateState();
    } else {
      const hasFocus = typeof doc?.hasFocus === 'function' ? doc.hasFocus() : false;
      if (hasFocus) {
        hasLostFocus = false;
      }
      updateState();
    }
  }

  function attach() {
    if (isAttached) return;
    isAttached = true;
    win?.addEventListener?.('blur', onBlur);
    win?.addEventListener?.('focus', onFocus);
    doc?.addEventListener?.('visibilitychange', onVisibilityChange);
    doc?.addEventListener?.('pointerdown', onUserInteraction, true);
    doc?.addEventListener?.('keydown', onUserInteraction, true);
    updateState();
  }

  function detach() {
    if (!isAttached) return;
    isAttached = false;
    win?.removeEventListener?.('blur', onBlur);
    win?.removeEventListener?.('focus', onFocus);
    doc?.removeEventListener?.('visibilitychange', onVisibilityChange);
    doc?.removeEventListener?.('pointerdown', onUserInteraction, true);
    doc?.removeEventListener?.('keydown', onUserInteraction, true);
    hasLostFocus = false;
    wasActive = false;
    if (currentShielded) {
      currentShielded = false;
      onChange(false);
    }
  }

  function sync() {
    updateState();
  }

  function isShielded() {
    return currentShielded;
  }

  return {
    attach,
    detach,
    sync,
    isShielded,
  };
}

export function applyShieldState({
  shielded,
  shieldEl,
  contentEls = [],
  rootEl = null,
} = {}) {
  const isShielded = Boolean(shielded);

  if (shieldEl) {
    shieldEl.hidden = !isShielded;
  }

  const elements = Array.isArray(contentEls) ? contentEls : Array.from(contentEls || []);
  for (const el of elements) {
    if (!el) continue;
    if (isShielded) {
      el.setAttribute?.('inert', '');
      el.setAttribute?.('aria-hidden', 'true');
    } else {
      el.removeAttribute?.('inert');
      el.removeAttribute?.('aria-hidden');
    }
  }

  if (rootEl) {
    if (isShielded) {
      rootEl.classList?.add?.('exam-shielded');
    } else {
      rootEl.classList?.remove?.('exam-shielded');
    }
  }
}
