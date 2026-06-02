/**
 * canvas-controller.js — RAID Sandbox: drag-and-drop controller (Phase 3).
 *
 * Translates DOM drag events into CanvasState mutations, then calls evaluate()
 * and invokes the onEvaluate callback so the host page can update its panels.
 *
 *   createController({ canvasEl, state, onEvaluate }) → controller
 *
 *   controller.setupSidebar(sidebarEl)  — call once: makes sidebar chips draggable
 *   controller.render()                 — rebuild canvas DOM from state
 *   controller.playAnimation(gridEl)    — animate the current placement into gridEl
 *
 * onEvaluate(result) is called after each mutation with the EvalResult from
 * CanvasState.evaluate(). The host page owns all panels outside canvasEl.
 *
 * IMPORTANT: the canvas drop target is wired ONCE in createController.
 * render() only wires per-node listeners (on freshly created elements).
 * Never call _setDropTarget(canvasEl) from render() — it accumulates listeners.
 */

(function (root) {
  'use strict';

  // Use text/plain for broad webview compatibility (custom MIME types are
  // sometimes blocked in Electron / VSCode webview environments).
  const DT_KEY = 'text/plain';

  function setDrag(e, payload) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DT_KEY, JSON.stringify(payload));
  }

  function getDrag(e) {
    try { return JSON.parse(e.dataTransfer.getData(DT_KEY)); }
    catch { return null; }
  }

  // ---------------------------------------------------------------------------
  // FACTORY
  // ---------------------------------------------------------------------------

  function createController({ canvasEl, state, onEvaluate }) {
    const CS     = root.CanvasState;
    const Render = root.RaidRender;

    let _animating = false;

    // Wire the canvas drop target ONCE here — never inside render().
    _setupCanvasDropTarget();

    // ---- sidebar chip setup (call once on init) -----------------------------

    function setupSidebar(sidebarEl) {
      sidebarEl.querySelectorAll('[data-drag]').forEach((chip) => {
        chip.setAttribute('draggable', 'true');
        chip.addEventListener('dragstart', (e) => {
          const t = chip.dataset.drag;
          if (t === 'disk') {
            setDrag(e, { source: 'sidebar', type: 'disk',
                         protocol: chip.dataset.protocol,
                         sizeGB:   Number(chip.dataset.size) });
          } else if (t === 'segmentation') {
            setDrag(e, { source: 'sidebar', type: 'segmentation', value: chip.dataset.value });
          } else if (t === 'redundancy') {
            setDrag(e, { source: 'sidebar', type: 'redundancy', value: chip.dataset.value });
          }
        });
      });
    }

    // ---- canvas drop target (wired once) ------------------------------------

    function _setupCanvasDropTarget() {
      canvasEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        canvasEl.classList.add('sbc--over');
      });
      canvasEl.addEventListener('dragleave', (e) => {
        // Only remove highlight when leaving the canvas entirely, not its children.
        if (!canvasEl.contains(e.relatedTarget)) canvasEl.classList.remove('sbc--over');
      });
      canvasEl.addEventListener('drop', (e) => {
        e.preventDefault();
        canvasEl.classList.remove('sbc--over');
        _handleDrop(e, 'canvas', null);
      });
    }

    // ---- canvas render ------------------------------------------------------

    function render() {
      canvasEl.innerHTML = '';
      for (const id of state.roots) {
        const node = state.nodes.get(id);
        if (!node) continue;
        canvasEl.appendChild(
          node.kind === 'disk' ? _makeDiskEl(id, node) : _makeArrayEl(id, node)
        );
      }
    }

    // ---- element builders ---------------------------------------------------

    function _makeDiskEl(id, node) {
      const el = document.createElement('div');
      el.className = 'sbc-disk';
      el.setAttribute('draggable', 'true');
      el.dataset.id   = id;
      el.dataset.kind = 'disk';
      el.textContent  = `${node.protocol} · ${node.sizeGB} TB`;

      el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        setDrag(e, { source: 'canvas', type: 'disk', id });
      });

      // Disk is a drop target so another disk can be dropped onto it to group them.
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('sbc--over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('sbc--over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('sbc--over');
        _handleDrop(e, 'disk', id);
      });

      return el;
    }

    function _makeArrayEl(id, node) {
      const el = document.createElement('div');
      el.className = 'sbc-array';
      el.dataset.id   = id;
      el.dataset.kind = 'array';

      el.appendChild(_makeSlots(id, node));

      const members = document.createElement('div');
      members.className = 'sbc-members';
      for (const mid of node.members) {
        const mNode = state.nodes.get(mid);
        if (mNode) members.appendChild(_makeDiskEl(mid, mNode));
      }
      el.appendChild(members);

      // Array accepts canvas-disk drops (add to array) and sidebar prop drops
      // that miss the slots (fall back to setting them here too).
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('sbc--over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('sbc--over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('sbc--over');
        _handleDrop(e, 'array', id);
      });

      return el;
    }

    function _makeSlots(arrayId, node) {
      const row = document.createElement('div');
      row.className = 'sbc-slots';
      row.appendChild(_makeSlot('segmentation', arrayId, node.segmentation));
      row.appendChild(_makeSlot('redundancy',   arrayId, node.redundancy));
      return row;
    }

    function _makeSlot(axis, arrayId, value) {
      const el = document.createElement('div');
      el.className = value ? 'sbc-slot sbc-slot--filled' : 'sbc-slot sbc-slot--empty';
      el.dataset.axis    = axis;
      el.dataset.arrayId = arrayId;
      el.textContent = value ?? '';
      if (!value) {
        const hint = document.createElement('span');
        hint.className   = 'sbc-slot-hint';
        hint.textContent = `drop ${axis}`;
        el.appendChild(hint);
      }

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('sbc-slot--over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('sbc-slot--over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('sbc-slot--over');
        const payload = getDrag(e);
        if (!payload || payload.source !== 'sidebar') return;
        if (payload.type === 'segmentation' && axis === 'segmentation') {
          CS.setSegmentation(state, arrayId, payload.value);
          _evaluateAndRender();
        } else if (payload.type === 'redundancy' && axis === 'redundancy') {
          CS.setRedundancy(state, arrayId, payload.value);
          _evaluateAndRender();
        }
      });

      return el;
    }

    // ---- drop dispatch ------------------------------------------------------

    function _handleDrop(e, targetKind, targetId) {
      const payload = getDrag(e);
      if (!payload) return;

      if (payload.source === 'sidebar' && payload.type === 'disk') {
        const newId = CS.addDisk(state, payload.sizeGB, payload.protocol);
        if (targetKind === 'disk')  CS.group(state, [targetId, newId]);
        if (targetKind === 'array') CS.addToArray(state, targetId, newId);
        _evaluateAndRender();
        return;
      }

      if (payload.source === 'sidebar' && payload.type === 'segmentation') {
        if (targetKind === 'array') CS.setSegmentation(state, targetId, payload.value);
        _evaluateAndRender();
        return;
      }

      if (payload.source === 'sidebar' && payload.type === 'redundancy') {
        if (targetKind === 'array') CS.setRedundancy(state, targetId, payload.value);
        _evaluateAndRender();
        return;
      }

      if (payload.source === 'canvas' && payload.type === 'disk') {
        const srcId = payload.id;
        if (targetKind === 'disk' && targetId !== srcId) {
          CS.group(state, [targetId, srcId]);
          _evaluateAndRender();
        } else if (targetKind === 'array') {
          CS.addToArray(state, targetId, srcId);
          _evaluateAndRender();
        }
      }
    }

    // ---- evaluate -----------------------------------------------------------

    function _evaluateAndRender() {
      render();
      const result = CS.evaluate(state);
      if (typeof onEvaluate === 'function') onEvaluate(result);
    }

    // ---- animation ----------------------------------------------------------

    function playAnimation(gridEl) {
      if (_animating || !gridEl) return;
      const result = CS.evaluate(state);
      if (!result.placement || result.placement.unsupported) return;
      _animating = true;
      Render.animate(gridEl, result.placement, { stepMs: 320 })
        .then(() => { _animating = false; });
    }

    return { render, setupSidebar, playAnimation };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const CanvasController = { createController };

  if (typeof module !== 'undefined' && module.exports) module.exports = CanvasController;
  else root.CanvasController = CanvasController;

})(typeof globalThis !== 'undefined' ? globalThis : this);
