/**
 * touch-dnd.js — touch shim for the HTML5 drag-and-drop API.
 *
 * The sandbox controllers (canvas-controller, physical-controller) are written
 * against native DnD events (dragstart/dragover/dragleave/drop/dragend +
 * e.dataTransfer), which never fire on touch devices. This shim listens for
 * touch gestures on [draggable="true"] elements and re-dispatches the same
 * synthetic event flow, so the controllers work unchanged on both inputs.
 *
 * Gesture model (conservative, scroll-friendly):
 *   - touch a draggable and HOLD still for HOLD_MS  → drag begins
 *   - move more than SLOP_PX before the hold elapses → treated as a scroll,
 *     the shim backs off and the browser scrolls normally
 *   - while dragging, touchmove is preventDefault-ed (no page scroll) and a
 *     semi-transparent ghost of the source element follows the finger
 *   - the element under the finger (document.elementFromPoint) receives
 *     dragover/dragleave/drop, exactly like the native mouse flow
 *
 * Zero dependencies; never loaded in headless node tests.
 */

(function (root) {
  'use strict';

  if (typeof document === 'undefined') return;   // browser-only

  const HOLD_MS = 180;   // press-and-hold delay before a drag begins
  const SLOP_PX = 10;    // finger drift allowed during the hold

  // ---- minimal DataTransfer stand-in ---------------------------------------
  // Only what DragUtil + the controllers use: set/getData('text/plain'),
  // effectAllowed, dropEffect, setDragImage (no-op).

  function makeDataTransfer() {
    const store = {};
    return {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData(type, value) { store[type] = String(value); },
      getData(type) { return store[type] ?? ''; },
      clearData(type) { if (type) delete store[type]; else for (const k in store) delete store[k]; },
      setDragImage() { /* ghost handled by the shim */ },
      get types() { return Object.keys(store); },
    };
  }

  // ---- synthetic event dispatch ---------------------------------------------

  function fireDragEvent(type, target, { x, y, dataTransfer, relatedTarget }) {
    if (!target) return null;
    let ev;
    const init = {
      bubbles: true, cancelable: true, view: root,
      clientX: x, clientY: y, relatedTarget: relatedTarget || null,
    };
    try { ev = new DragEvent(type, init); }
    catch { ev = new MouseEvent(type, init); }   // older engines: DragEvent ctor missing
    // Real synthesized DragEvents carry a null dataTransfer — shadow it.
    Object.defineProperty(ev, 'dataTransfer', { value: dataTransfer });
    // offsetX/Y relative to the dispatch target (physical-controller stores the
    // grab offset on dragstart so nodes don't jump when repositioned).
    const r = target.getBoundingClientRect();
    Object.defineProperty(ev, 'offsetX', { value: Math.round(x - r.left) });
    Object.defineProperty(ev, 'offsetY', { value: Math.round(y - r.top) });
    target.dispatchEvent(ev);
    return ev;
  }

  // ---- drag ghost ------------------------------------------------------------

  function makeGhost(source, x, y) {
    const ghost = source.cloneNode(true);
    const r = source.getBoundingClientRect();
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0', top: '0',
      width: r.width + 'px',
      height: r.height + 'px',
      margin: '0',
      opacity: '.7',
      pointerEvents: 'none',     // keep elementFromPoint seeing through it
      zIndex: '9999',
      transition: 'none',
    });
    moveGhost(ghost, x, y);
    document.body.appendChild(ghost);
    return ghost;
  }

  function moveGhost(ghost, x, y) {
    // Slightly above the finger so the drop target stays visible.
    ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -80%)`;
  }

  // ---- gesture state machine --------------------------------------------------

  let gs = null;   // { source, dt, x, y, holdTimer, dragging, lastTarget, ghost }

  function cleanup() {
    if (!gs) return;
    clearTimeout(gs.holdTimer);
    if (gs.ghost) gs.ghost.remove();
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchCancel);
    gs = null;
  }

  function onTouchStart(e) {
    if (gs || e.touches.length !== 1) return;
    const source = e.target.closest && e.target.closest('[draggable="true"]');
    if (!source) return;
    const t = e.touches[0];
    gs = {
      source, dt: null, dragging: false, lastTarget: null, ghost: null,
      x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY,
      holdTimer: setTimeout(startDrag, HOLD_MS),
    };
    // Non-passive: once the drag starts we must be able to cancel scrolling.
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchCancel);
  }

  function startDrag() {
    if (!gs || gs.dragging) return;
    gs.dt = makeDataTransfer();
    const ev = fireDragEvent('dragstart', gs.source, { x: gs.x, y: gs.y, dataTransfer: gs.dt });
    // Handlers veto drags with preventDefault (e.g. delete buttons) — back off.
    if (!ev || ev.defaultPrevented) { cleanup(); return; }
    gs.dragging = true;
    gs.ghost = makeGhost(gs.source, gs.x, gs.y);
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function targetUnderFinger() {
    const el = document.elementFromPoint(gs.x, gs.y);
    return el && el !== gs.ghost ? el : null;
  }

  function onTouchMove(e) {
    if (!gs) return;
    const t = e.touches[0];
    gs.x = t.clientX;
    gs.y = t.clientY;

    if (!gs.dragging) {
      // Finger moved before the hold elapsed → it's a scroll, not a drag.
      if (Math.hypot(gs.x - gs.x0, gs.y - gs.y0) > SLOP_PX) cleanup();
      return;
    }

    e.preventDefault();   // drag owns the gesture: no page scroll
    moveGhost(gs.ghost, gs.x, gs.y);

    // 'drag' on the source keeps the physical layer's pending wire following
    // the finger (it reads clientX/clientY and skips 0,0).
    fireDragEvent('drag', gs.source, { x: gs.x, y: gs.y, dataTransfer: gs.dt });

    const target = targetUnderFinger();
    if (target !== gs.lastTarget) {
      if (gs.lastTarget) {
        fireDragEvent('dragleave', gs.lastTarget,
          { x: gs.x, y: gs.y, dataTransfer: gs.dt, relatedTarget: target });
      }
      gs.lastTarget = target;
    }
    if (target) fireDragEvent('dragover', target, { x: gs.x, y: gs.y, dataTransfer: gs.dt });
  }

  function onTouchEnd() {
    if (!gs) return;
    if (gs.dragging) {
      const target = targetUnderFinger();
      if (target) fireDragEvent('drop', target, { x: gs.x, y: gs.y, dataTransfer: gs.dt });
      // dragend bubbles to document — controllers rely on it for cleanup.
      fireDragEvent('dragend', gs.source, { x: gs.x, y: gs.y, dataTransfer: gs.dt });
    }
    cleanup();   // plain tap: do nothing, the native click still fires
  }

  function onTouchCancel() {
    if (gs && gs.dragging) {
      fireDragEvent('dragend', gs.source, { x: gs.x, y: gs.y, dataTransfer: gs.dt });
    }
    cleanup();
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });

  root.TouchDnD = { _internal: { HOLD_MS, SLOP_PX } };   // exposed for debugging
})(typeof window !== 'undefined' ? window : globalThis);
