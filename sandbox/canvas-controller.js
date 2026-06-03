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

  function createController({ canvasEl, state, onEvaluate, onHint }) {
    const CS     = root.CanvasState;
    const Render = root.RaidRender;

    let _animating   = false;
    let _stripes     = 4;
    let _dragPayload = null;   // set on dragstart, read during dragover, cleared on dragend

    _setupCanvasDropTarget();

    // Cleanup for cancelled drags / drops outside any target (dragend always fires).
    document.addEventListener('dragend', () => { _dragPayload = null; _clearHint(); });

    // ---- sidebar ------------------------------------------------------------

    function setupSidebar(sidebarEl) {
      sidebarEl.querySelectorAll('[data-drag]').forEach((chip) => {
        chip.setAttribute('draggable', 'true');
        chip.addEventListener('dragstart', (e) => {
          const t = chip.dataset.drag;
          let payload = null;
          if (t === 'disk') {
            payload = { source: 'sidebar', type: 'disk',
                        protocol: chip.dataset.protocol,
                        sizeGB:   Number(chip.dataset.size) };
          } else if (t === 'segmentation' || t === 'redundancy' || t === 'algorithm') {
            payload = { source: 'sidebar', type: t, value: chip.dataset.value };
          }
          if (!payload) return;   // e.g. phys-component chips are owned by the physical controller
          _dragPayload = payload;
          setDrag(e, payload);
        });
      });
    }

    // ---- canvas drop target (wired once) ------------------------------------

    function _setupCanvasDropTarget() {
      canvasEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        _previewDrop(canvasEl, 'canvas', null);
      });
      canvasEl.addEventListener('dragleave', (e) => {
        if (!canvasEl.contains(e.relatedTarget)) _clearPreview(canvasEl);
      });
      canvasEl.addEventListener('drop', (e) => {
        e.preventDefault();
        _clearPreview(canvasEl);
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

    // ---- drop resolution (single source of truth) ---------------------------
    // Resolve what dropping `payload` on (targetKind,targetId) WOULD do, without
    // doing it. Returns { ok, label, run }: dragover reads ok/label to colour the
    // target honestly; drop calls run(). Border preview and drop share this one
    // function, so they can never disagree.

    const _NO = { ok: false, label: null, run: null };

    function _resolveDropAction(payload, targetKind, targetId) {
      if (!payload) return _NO;

      // --- sidebar: a brand-new disk ---
      if (payload.source === 'sidebar' && payload.type === 'disk') {
        const make = () => CS.addDisk(state, payload.sizeGB, payload.protocol);
        if (targetKind === 'disk') {
          const parent = _findParentArray(targetId);
          return parent
            ? { ok: true, label: '+ disk to array',       run: () => CS.addToArray(state, parent, make()) }
            : { ok: true, label: 'group into a new array', run: () => CS.group(state, [targetId, make()]) };
        }
        if (targetKind === 'array')
          return { ok: true, label: '+ disk to array', run: () => CS.addToArray(state, targetId, make()) };
        return { ok: true, label: 'add a loose disk', run: () => { make(); } };   // empty canvas
      }

      // --- sidebar: segmentation / redundancy / algorithm onto an array body ---
      if (payload.source === 'sidebar' &&
          (payload.type === 'segmentation' || payload.type === 'redundancy' || payload.type === 'algorithm')) {
        if (targetKind !== 'array') return _NO;
        const setter = payload.type === 'segmentation' ? CS.setSegmentation
                     : payload.type === 'redundancy'   ? CS.setRedundancy
                     :                                    CS.setAlgorithm;
        return { ok: true, label: `${payload.type}: ${payload.value}`,
                 run: () => setter(state, targetId, payload.value) };
      }

      // --- canvas: an existing disk being re-homed ---
      if (payload.source === 'canvas' && payload.type === 'disk') {
        const srcId = payload.id;
        if (srcId === targetId) return _NO;
        if (targetKind === 'disk') {
          const parent = _findParentArray(targetId);
          if (parent)
            return { ok: true, label: '+ disk to array', run: () => CS.addToArray(state, parent, srcId) };
          if (_findParentArray(srcId)) return _NO;   // both must be loose to form a new array
          return { ok: true, label: 'group into a new array', run: () => CS.group(state, [targetId, srcId]) };
        }
        if (targetKind === 'array')
          return { ok: true, label: '+ disk to array', run: () => CS.addToArray(state, targetId, srcId) };
        return _NO;   // empty canvas
      }

      // --- canvas: an existing array (span) being nested ---
      if (payload.source === 'canvas' && payload.type === 'array') {
        const srcId = payload.id;
        if (srcId === targetId) return _NO;
        if (!state.roots.has(srcId)) return _NO;            // only top-level spans re-group (v1)
        if (_subtreeContains(srcId, targetId)) return _NO;  // never into its own descendant
        if (targetKind === 'array') {
          if (!state.roots.has(targetId)) return _NO;       // must land on a top-level array
          const target  = state.nodes.get(targetId);
          const nesting = target.members.some((m) => state.nodes.get(m)?.kind === 'array');
          return nesting
            ? { ok: true, label: '+ span',                      run: () => CS.addToArray(state, targetId, srcId) }
            : { ok: true, label: 'stripe over spans (nested RAID)', run: () => CS.group(state, [targetId, srcId]) };
        }
        if (targetKind === 'disk') {
          if (_findParentArray(targetId)) return _NO;       // its parent array is the real target
          return { ok: true, label: 'group span + disk', run: () => CS.group(state, [targetId, srcId]) };
        }
        return _NO;
      }

      return _NO;
    }

    // ---- drag preview (border colour + status-bar label) --------------------

    function _previewDrop(el, targetKind, targetId) {
      const { ok, label } = _resolveDropAction(_dragPayload, targetKind, targetId);
      el.classList.toggle('sbc--drop-ok', ok);
      el.classList.toggle('sbc--drop-bad', !ok);
      _showHint(ok && label ? `→ ${label}` : null);
    }

    function _clearPreview(el) {
      el.classList.remove('sbc--drop-ok', 'sbc--drop-bad');
    }

    function _showHint(text) { if (typeof onHint === 'function') onHint(text); }
    function _clearHint()    { if (typeof onHint === 'function') onHint(null); }

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
        _dragPayload = { source: 'canvas', type: 'disk', id };
        setDrag(e, _dragPayload);
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        _previewDrop(el, 'disk', id);
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) _clearPreview(el);
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        _clearPreview(el);
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
          _dragPayload = { source: 'canvas', type: 'array', id };
          setDrag(e, _dragPayload);
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
        _previewDrop(el, 'array', id);
      });
      el.addEventListener('dragleave', (e) => {
        if (!el.contains(e.relatedTarget)) _clearPreview(el);
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation();
        _clearPreview(el);
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
      const { ok, run } = _resolveDropAction(payload, targetKind, targetId);
      _dragPayload = null;
      if (ok && typeof run === 'function') {
        run();
        _evaluateAndRender();
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
