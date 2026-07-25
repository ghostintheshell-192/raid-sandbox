/**
 * highlight.js — RAID Sandbox: "what I am talking about is THAT one".
 *
 * One highlighting language for the whole app. A panel entry that refers to
 * things on the canvas — a §6 violation, the RAID-type line — lights those
 * things up while the player points at it. Hover on desktop; on touch, where
 * there is no hover, a tap pins the same highlight until the next tap.
 *
 * This module knows nothing about violations, badges or the domain. It is given
 * an element and a list of node ids and wires the interaction; deciding WHICH
 * ids an entry refers to belongs to the caller. It owns no styling either — the
 * host page supplies `.sbc-referenced`, the way render.js expects `.sb-cell`.
 *
 * The id lookup deliberately spans both canvases: a disk is one entity present
 * in the data view and the physical view (the shared-atom bridge, spec §2), so
 * a violation about a disk lights it wherever the player is looking.
 *
 *   RaidHighlight.attach(el, ids)   // wire an entry
 *   RaidHighlight.set(ids) / .clear()
 */

(function (root) {
  'use strict';

  const CLASS_LIT     = 'sbc-referenced';   // on the canvas nodes being pointed at
  const CLASS_REFERER = 'sbc-refs';         // on the panel entry that does the pointing

  // data-id  → data-layer canvas (arrays, disks)
  // data-node-id → physical-layer canvas (component nodes, disks)
  const selectorFor = (id) =>
    `[data-id="${id}"], [data-node-id="${id}"]`;

  let _lit      = [];
  let _pinned   = null;    // the entry whose highlight survives mouseleave
  let _wiredDoc = false;

  function clear() {
    _lit.forEach((el) => el.classList.remove(CLASS_LIT));
    _lit = [];
  }

  /** Light every canvas node in `ids`, in whichever view it appears. */
  function set(ids) {
    clear();
    for (const id of ids || []) {
      if (id == null) continue;
      document.querySelectorAll(selectorFor(id)).forEach((el) => {
        el.classList.add(CLASS_LIT);
        _lit.push(el);
      });
    }
  }

  function unpin() {
    if (_pinned) _pinned.classList.remove('is-pinned');
    _pinned = null;
    clear();
  }

  /**
   * Wire one panel entry to the nodes it talks about.
   *
   * Safe to call again on the SAME element: some entries are rebuilt on every
   * evaluation (violations) and others are reused (the RAID-type line), so the
   * listeners are registered once and read the current targets at event time.
   * Calling with no usable id detaches instead — an entry with nothing to point
   * at goes inert rather than pretending to point.
   */
  function attach(el, ids) {
    if (!el) return;
    const targets = (ids || []).filter((id) => id != null);

    el._refIds = targets;

    if (!targets.length) {
      el.classList.remove(CLASS_REFERER, 'is-pinned');
      if (_pinned === el) unpin();
      return;
    }
    el.classList.add(CLASS_REFERER);

    if (el._refWired) return;
    el._refWired = true;

    el.addEventListener('mouseenter', () => { if (!_pinned) set(el._refIds); });
    el.addEventListener('mouseleave', () => { if (!_pinned) clear(); });

    // Touch path: tap pins, tap again (or anywhere else) releases.
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_pinned === el) { unpin(); return; }
      unpin();
      _pinned = el;
      el.classList.add('is-pinned');
      set(el._refIds);
    });

    if (!_wiredDoc) {
      document.addEventListener('click', () => { if (_pinned) unpin(); });
      _wiredDoc = true;
    }
  }

  root.RaidHighlight = { attach, set, clear };

})(window);
