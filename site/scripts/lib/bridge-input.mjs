// Input for the macOS driver (bridge.mjs): functions it runs inside trace's page
// to stand in for a user's mouse and keyboard. Each is sent as source, so each is
// self-contained. The events are untrusted (WKWebView has no input protocol), but
// they carry what React, xterm and trace's shortcut handlers read; what they
// can't do is the browser's own default actions, so the ones that matter
// (focus, scrolling, a context menu) are done here as well.

/**
 * A mouse action at (x, y): "move", "down", "up", "click" or "wheel".
 * Hover state moves too: out/leave on what the pointer left, over/enter on what
 * it's over now, which is what React's onMouseEnter and onPointerEnter use.
 */
export function pointer(kind, x, y, opts = {}) {
  const { button = "left", clickCount = 1, deltaX = 0, deltaY = 0, modifiers = 0 } = opts;
  const state = (window.__traceRecPointer ??= { over: null });
  const target = document.elementFromPoint(x, y) ?? document.body;
  const btn = { left: 0, middle: 1, right: 2 }[button] ?? 0;
  const keys = {
    altKey: !!(modifiers & 1),
    ctrlKey: !!(modifiers & 2),
    metaKey: !!(modifiers & 4),
    shiftKey: !!(modifiers & 8),
  };
  const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, ...keys };
  const ptr = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };
  const fire = (el, type, init) => {
    const Ctor = type.startsWith("pointer") ? PointerEvent : type === "wheel" ? WheelEvent : MouseEvent;
    return el.dispatchEvent(new Ctor(type, init));
  };

  if (state.over !== target) {
    const prev = state.over?.isConnected ? state.over : null;
    const chain = (el) => {
      const up = [];
      for (let e = el; e; e = e.parentElement) up.push(e);
      return up;
    };
    const was = prev ? chain(prev) : [];
    const now = chain(target);
    if (prev) {
      fire(prev, "pointerout", { ...ptr, relatedTarget: target });
      fire(prev, "mouseout", { ...base, relatedTarget: target });
      for (const e of was.filter((e) => !now.includes(e))) {
        fire(e, "pointerleave", { ...ptr, bubbles: false, relatedTarget: target });
        fire(e, "mouseleave", { ...base, bubbles: false, relatedTarget: target });
      }
    }
    fire(target, "pointerover", { ...ptr, relatedTarget: prev });
    fire(target, "mouseover", { ...base, relatedTarget: prev });
    for (const e of now.filter((e) => !was.includes(e)).reverse()) {
      fire(e, "pointerenter", { ...ptr, bubbles: false, relatedTarget: prev });
      fire(e, "mouseenter", { ...base, bubbles: false, relatedTarget: prev });
    }
    state.over = target;
  }

  // Untrusted events don't set CSS :hover, so hover-revealed controls (a row's
  // actions, a message's hover bar, pane chrome) would never show. Mirror every
  // `:hover` rule as `[data-rec-hover]`, and mark what the pointer is over.
  if (state.sheets !== document.styleSheets.length) {
    state.sheets = document.styleSheets.length;
    const out = [];
    const walk = (rules, wrap) => {
      for (const r of rules) {
        if (r.selectorText?.includes(":hover")) {
          const sel = r.selectorText.replace(/:hover/g, "[data-rec-hover]");
          out.push(wrap(`${sel}{${r.style.cssText}}`));
        } else if (r.cssRules && (r.media || r.conditionText)) {
          const head = r.media ? `@media ${r.media.mediaText}` : `@supports ${r.conditionText}`;
          walk(r.cssRules, (t) => wrap(`${head}{${t}}`));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode?.id === "rec-hover") continue;
      try {
        walk(sheet.cssRules, (t) => t);
      } catch {}
    }
    let el = document.getElementById("rec-hover");
    if (!el) {
      el = document.createElement("style");
      el.id = "rec-hover";
      document.head.append(el);
    }
    el.textContent = out.join("\n");
    state.sheets = document.styleSheets.length;
  }
  for (const e of document.querySelectorAll("[data-rec-hover]")) {
    if (!e.contains(target)) e.removeAttribute("data-rec-hover");
  }
  for (let e = target; e && e !== document.documentElement; e = e.parentElement) {
    if (!e.hasAttribute("data-rec-hover")) e.setAttribute("data-rec-hover", "");
  }

  if (kind === "move") {
    fire(target, "pointermove", ptr);
    fire(target, "mousemove", base);
    return;
  }
  if (kind === "wheel") {
    if (!fire(target, "wheel", { ...base, deltaX, deltaY, deltaMode: 0 })) return;
    // A synthetic wheel event doesn't scroll: scroll what the browser would.
    for (let e = target; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const y = deltaY && /auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight;
      const xx = deltaX && /auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth;
      if (y || xx) return e.scrollBy({ left: deltaX, top: deltaY });
    }
    return document.scrollingElement?.scrollBy(deltaX, deltaY);
  }

  const press = { ...base, button: btn, detail: clickCount };
  const held = { ...press, buttons: [1, 4, 2][btn] };
  if (kind === "down" || kind === "click") {
    fire(target, "pointerdown", { ...ptr, ...held });
    const go = fire(target, "mousedown", held);
    // Focus as a mousedown would. A terminal takes keys through xterm's hidden
    // textarea; on macOS WebKit, buttons and links don't take focus from a click.
    const term = target.closest(".xterm")?.querySelector("textarea");
    const field = target.closest("input, textarea, select, [tabindex], [contenteditable=''], [contenteditable='true']");
    if (term) term.focus();
    else if (go && field) field.focus({ preventScroll: true });
    else if (go && document.activeElement !== document.body) document.activeElement?.blur?.();
    if (btn === 2) fire(target, "contextmenu", held);
  }
  if (kind === "up" || kind === "click") {
    fire(target, "pointerup", { ...ptr, ...press, buttons: 0 });
    fire(target, "mouseup", { ...press, buttons: 0 });
    if (kind === "click" && btn === 0) {
      fire(target, "click", press);
      if (clickCount === 2) fire(target, "dblclick", press);
    }
  }
}

/**
 * Type `text` into the focused element. execCommand fires beforeinput and input
 * as a keystroke would, so React's controlled inputs and xterm read it; the
 * value setter is the fallback where it does nothing.
 */
export function insertText(text) {
  const el = document.activeElement;
  if (!el || el === document.body) throw new Error("nothing is focused to type into");
  if (document.execCommand("insertText", false, text)) return;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = Object.getPrototypeOf(el);
    const { selectionStart: s, selectionEnd: e, value } = el;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value.slice(0, s) + text + value.slice(e));
    el.setSelectionRange(s + text.length, s + text.length);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
}

/** Press one key on the focused element, with modifiers: 1 Alt, 2 Ctrl, 4 Meta, 8 Shift. */
export function keyPress(key, modifiers = 0) {
  const named = {
    Enter: [13, "Enter"],
    Escape: [27, "Escape"],
    Tab: [9, "Tab"],
    Backspace: [8, "Backspace"],
    Delete: [46, "Delete"],
    ArrowDown: [40, "ArrowDown"],
    ArrowUp: [38, "ArrowUp"],
    ArrowLeft: [37, "ArrowLeft"],
    ArrowRight: [39, "ArrowRight"],
    " ": [32, "Space"],
  };
  const ch = key.toUpperCase();
  const [keyCode, code] = named[key] ?? [ch.charCodeAt(0), /^[A-Z]$/.test(ch) ? `Key${ch}` : /^\d$/.test(ch) ? `Digit${ch}` : key];
  const init = {
    key,
    code,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    altKey: !!(modifiers & 1),
    ctrlKey: !!(modifiers & 2),
    metaKey: !!(modifiers & 4),
    shiftKey: !!(modifiers & 8),
  };
  const target = document.activeElement ?? document.body;
  const make = (type) => {
    const ev = new KeyboardEvent(type, init);
    // keyCode isn't settable through the constructor; xterm still reads it.
    Object.defineProperty(ev, "keyCode", { get: () => keyCode });
    Object.defineProperty(ev, "which", { get: () => keyCode });
    return ev;
  };
  const go = target.dispatchEvent(make("keydown"));
  // The default actions that matter, when nothing handled the key.
  if (go && !modifiers && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    if (key === "Enter" && target instanceof HTMLTextAreaElement) document.execCommand("insertText", false, "\n");
    else if (key === "Enter") target.form?.requestSubmit();
    else if (key === "Backspace") document.execCommand("delete");
    else if (key === "Delete") document.execCommand("forwardDelete");
  }
  target.dispatchEvent(make("keyup"));
}

/** The CSS viewport and the device pixel ratio. */
export function metrics() {
  return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
}
