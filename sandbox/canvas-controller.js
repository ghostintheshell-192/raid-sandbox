/**
 * canvas-controller.js — RAID Sandbox: drag-and-drop controller (Phase 3).
 *
 *   createController({ canvasEl, state, onEvaluate }) → controller
 *
 *   controller.setupSidebar(sidebarEl)
 *   controller.render()
 *   controller.setStripes(n)      — change stripe count, re-evaluates
 *   controller.playAnimation(gridEl)
 */

(function (root) {
  'use strict';

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

  function createController({ canvasEl, state, onEvaluate }) {
    const CS     = root.CanvasState;
    const Render = root.RaidRender;

    let _animating = false;
    let _stripes   = 4;

    _setupCanvasDropTarget();

    // ---- sidebar ------------------------------------------------------------

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
          } else if (t === 'algorithm') {
            setDrag(e, { source: 'sidebar', type: 'algorithm', value: chip.dataset.value });
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
        if (!canvasEl.contains(e.relatedTarget)) canvasEl.classList.remove('sbc--over');
      });
      canvasEl.addEventListener('drop', (e) => {
        e.preventDefault();
        canvasEl.classList.remove('sbc--over');
        _handleDrop(e, 'canvas', null);
      });
    }

    // ---- helpers ------------------------------------------------------------

    /** Returns the id of the array that contains diskId, or null. */
    function _findParentArray(diskId) {
      for (const [id, node] of state.nodes) {
        if (node.kind === 'array' && node.members.includes(diskId)) return id;
      }
      return null;
    }

    /** True if nodeId is anywhere inside arrayId's subtree (cycle guard for nesting). */
    function _subtreeContains(arrayId, nodeId) {
      const node = state.nodes.get(arrayId);
      if (!node || node.kind !== 'array') return false;
      for (const mid of node.members) {
        if (mid === nodeId || _subtreeContains(mid, nodeId)) return true;
      }
      return false;
    }

    // ---- render -------------------------------------------------------------

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

    function _deleteBtn(onClickFn) {
      const btn = document.createElement('button');
      btn.className   = 'sbc-delete';
      btn.textContent = '×';
      btn.title       = 'Remove';
      btn.addEventListener('dragstart', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => { e.stopPropagation(); onClickFn(); });
      return btn;
    }

    function _makeDiskEl(id, node) {
      const el = document.createElement('div');
      el.className = 'sbc-disk';
      el.setAttribute('draggable', 'true');
      el.dataset.id   = id;
      el.dataset.kind = 'disk';

      const label = document.createElement('span');
      label.textContent = `${node.protocol} · ${node.sizeGB} TB`;
      el.appendChild(label);
      el.appendChild(_deleteBtn(() => { CS.remove(state, id); _evaluateAndRender(); }));

      el.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        setDrag(e, { source: 'canvas', type: 'disk', id });
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.add('sbc--over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('sbc--over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
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

      // Only top-level arrays are draggable — to nest them under a new parent.
      // (Nested member arrays stay put in v1; rebuild bottom-up.)
      if (state.roots.has(id)) {
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          setDrag(e, { source: 'canvas', type: 'array', id });
        });
      }

      el.appendChild(_makeSlots(id, node));

      const members = document.createElement('div');
      members.className = 'sbc-members';
      for (const mid of node.members) {
        const mNode = state.nodes.get(mid);
        if (!mNode) continue;
        // Members may be disks (leaf array) or arrays (nesting) — render recursively.
        members.appendChild(
          mNode.kind === 'disk' ? _makeDiskEl(mid, mNode) : _makeArrayEl(mid, mNode)
        );
      }
      el.appendChild(members);

      // Dissolve button: returns disks to canvas, removes array.
      el.appendChild(_deleteBtn(() => { CS.dissolve(state, id); _evaluateAndRender(); }));

      el.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.add('sbc--over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('sbc--over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
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
      // Placement-algorithm slot, shown with the default for the array's class:
      // parity → left-symmetric; flat RAID 10 (striped+mirror) → near.
      const isParity     = node.redundancy === 'parity1' || node.redundancy === 'parity2';
      const isFlatMirror = node.segmentation === 'striped' && node.redundancy === 'mirror';
      if (isParity || isFlatMirror) {
        const algoValue = node.algorithm ?? (isParity ? 'left-symmetric' : 'near');
        row.appendChild(_makeSlot('algorithm', arrayId, algoValue));
      }
      return row;
    }

    function _makeSlot(axis, arrayId, value) {
      const el = document.createElement('div');
      el.className = value ? 'sbc-slot sbc-slot--filled' : 'sbc-slot sbc-slot--empty';
      el.dataset.axis    = axis;
      el.dataset.arrayId = arrayId;

      if (value) {
        el.textContent = value;
        const x = document.createElement('button');
        x.className   = 'sbc-delete sbc-delete--inline';
        x.textContent = '×';
        x.title       = 'Clear';
        x.addEventListener('dragstart', (e) => e.preventDefault());
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          if (axis === 'segmentation')    CS.setSegmentation(state, arrayId, null);
          else if (axis === 'redundancy') CS.setRedundancy(state, arrayId, null);
          else if (axis === 'algorithm')  CS.setAlgorithm(state, arrayId, null);
          _evaluateAndRender();
        });
        el.appendChild(x);
      } else {
        const hint = document.createElement('span');
        hint.className   = 'sbc-slot-hint';
        hint.textContent = `drop ${axis}`;
        el.appendChild(hint);
      }

      el.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.add('sbc-slot--over');
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove('sbc-slot--over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.classList.remove('sbc-slot--over');
        const payload = getDrag(e);
        if (!payload || payload.source !== 'sidebar') return;
        if (payload.type === 'segmentation' && axis === 'segmentation') {
          CS.setSegmentation(state, arrayId, payload.value);
          _evaluateAndRender();
        } else if (payload.type === 'redundancy' && axis === 'redundancy') {
          CS.setRedundancy(state, arrayId, payload.value);
          _evaluateAndRender();
        } else if (payload.type === 'algorithm' && axis === 'algorithm') {
          CS.setAlgorithm(state, arrayId, payload.value);
          _evaluateAndRender();
        }
      });

      return el;
    }

    // ---- drop dispatch ------------------------------------------------------

    function _handleDrop(e, targetKind, targetId) {
      const payload = getDrag(e);
      if (!payload) return;

      // --- sidebar disk ---
      if (payload.source === 'sidebar' && payload.type === 'disk') {
        const newId = CS.addDisk(state, payload.sizeGB, payload.protocol);

        if (targetKind === 'disk') {
          // If target disk is already in an array, add there; else group the two.
          const parent = _findParentArray(targetId);
          if (parent) CS.addToArray(state, parent, newId);
          else        CS.group(state, [targetId, newId]);
        } else if (targetKind === 'array') {
          CS.addToArray(state, targetId, newId);
        }
        // else: dropped on empty canvas — disk stays loose.
        _evaluateAndRender();
        return;
      }

      // --- sidebar segmentation / redundancy ---
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

      if (payload.source === 'sidebar' && payload.type === 'algorithm') {
        if (targetKind === 'array') CS.setAlgorithm(state, targetId, payload.value);
        _evaluateAndRender();
        return;
      }

      // --- canvas disk ---
      if (payload.source === 'canvas' && payload.type === 'disk') {
        const srcId = payload.id;
        if (srcId === targetId) return; // dropped on itself

        if (targetKind === 'disk') {
          // Target disk already in an array → add source there.
          // Target disk loose → group the two (source must be loose too).
          const parent = _findParentArray(targetId);
          if (parent) {
            CS.addToArray(state, parent, srcId);
          } else {
            // Both must be loose for group(); if src is in an array, abort.
            const srcParent = _findParentArray(srcId);
            if (!srcParent) CS.group(state, [targetId, srcId]);
          }
          _evaluateAndRender();
        } else if (targetKind === 'array') {
          CS.addToArray(state, targetId, srcId);
          _evaluateAndRender();
        }
        // canvas → canvas (empty): no-op in Phase 3 (no free positioning)
      }

      // --- canvas array (nesting) ---
      if (payload.source === 'canvas' && payload.type === 'array') {
        const srcId = payload.id;
        if (srcId === targetId) return;                 // dropped on itself
        if (!state.roots.has(srcId)) return;            // only top-level arrays re-group (v1)
        if (_subtreeContains(srcId, targetId)) return;  // never drop into own descendant

        if (targetKind === 'array') {
          if (!state.roots.has(targetId)) return;       // group/extend at top level only (v1)
          const target = state.nodes.get(targetId);
          const targetIsNesting = target.members.some(
            (m) => state.nodes.get(m)?.kind === 'array'
          );
          // Two leaf spans → a new parent stripe (RAID 10/50/60);
          // a span onto an existing nest → extend it (e.g. a 3rd span).
          if (targetIsNesting) CS.addToArray(state, targetId, srcId);
          else                 CS.group(state, [targetId, srcId]);
          _evaluateAndRender();
        } else if (targetKind === 'disk') {
          // Onto a loose disk → group the two; onto a disk already in an array,
          // ignore (nest by dropping on the array itself, not its member).
          if (!_findParentArray(targetId)) {
            CS.group(state, [targetId, srcId]);
            _evaluateAndRender();
          }
        }
        // canvas (empty): no-op
      }
    }

    // ---- evaluate -----------------------------------------------------------

    function _evaluateAndRender() {
      render();
      const result = CS.evaluate(state, { stripes: _stripes });
      if (typeof onEvaluate === 'function') onEvaluate(result);
    }

    function setStripes(n) {
      _stripes = Math.max(1, Math.min(32, n));
      _evaluateAndRender();
    }

    // ---- animation ----------------------------------------------------------

    function playAnimation(gridEl) {
      if (_animating || !gridEl) return;
      const result = CS.evaluate(state, { stripes: _stripes });
      if (!result.placement || result.placement.unsupported) return;
      _animating = true;
      Render.animate(gridEl, result.placement, { stepMs: 320 })
        .then(() => { _animating = false; });
    }

    return { render, setupSidebar, setStripes, playAnimation };
  }

  // ---------------------------------------------------------------------------

  const CanvasController = { createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = CanvasController;
  else root.CanvasController = CanvasController;

})(typeof globalThis !== 'undefined' ? globalThis : this);
