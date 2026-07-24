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

  const { setDrag, getDrag } = root.DragUtil;

  // ---------------------------------------------------------------------------

  function createController({ canvasEl, state, onEvaluate, onHint }) {
    const CS     = root.CanvasState;
    const Render = root.RaidRender;

    let _animating   = false;
    let _stripes     = 4;
    let _dragPayload = null;   // set on dragstart, read during dragover, cleared on dragend
    let _sidebarEl   = null;   // set by setupSidebar; the static option catalogue for the picker

    _setupCanvasDropTarget();

    // Cleanup for cancelled drags / drops outside any target (dragend always fires).
    document.addEventListener('dragend', () => { _dragPayload = null; _clearHint(); });

    // Inline picker dismissal: any click that reaches the document (i.e. outside an
    // anchor or an open picker — those stopPropagation) closes it, as does Escape.
    document.addEventListener('click', () => _closePickers());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _closePickers(); });

    // ---- sidebar ------------------------------------------------------------

    function setupSidebar(sidebarEl) {
      _sidebarEl = sidebarEl;   // the picker reads its option catalogue + labels from here
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
      // Persistent add-zone: always present, so a fresh loose disk — and thus a
      // separate RAID group — can be started by tap even when the canvas isn't
      // empty (mirrors dragging a disk onto blank canvas). `roots` is a Set, so
      // multiple independent groups are first-class state, not a workaround.
      canvasEl.appendChild(_makeAddZone(state.roots.size === 0));
    }

    // A tap-to-build zone that drops a fresh loose disk. When the canvas is empty
    // it fills the space as the "start here" affordance; otherwise it sits after
    // the groups as a quiet "+ add a disk" that can seed a new, separate group.
    function _makeAddZone(isEmpty) {
      const zone = document.createElement('div');
      zone.className   = isEmpty ? 'sbc-canvas-empty' : 'sbc-canvas-add';
      zone.textContent = isEmpty
        ? 'Tap to add a disk — or drag one from the palette'
        : '+ add a disk';
      zone.addEventListener('click', (e) => {
        e.stopPropagation();
        _openPicker(zone, _diskPickerOptions((sizeGB, protocol) => CS.addDisk(state, sizeGB, protocol)),
                    { kind: 'disk' });
      });
      return zone;
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
      // Tap-to-build: a disk offers disk chips. A loose disk forms a new array
      // with the chosen disk; a disk already in an array grows that array.
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const parent = _findParentArray(id);
        _openPicker(el, _diskPickerOptions((sizeGB, protocol) => {
          const newId = CS.addDisk(state, sizeGB, protocol);
          if (parent) CS.addToArray(state, parent, newId);
          else        CS.group(state, [id, newId]);
        }), { kind: 'disk' });
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

      // Tap-to-build: tapping the array body (outside slots/members/×) grows it.
      // The picker lands after the members, reading as "one more disk here".
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        _openPicker(el, _diskPickerOptions((sizeGB, protocol) => {
          CS.addToArray(state, id, CS.addDisk(state, sizeGB, protocol));
        }), { kind: 'disk', placeAfter: members });
      });

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

    // ---- inline picker (touch-first, additive to drag-and-drop) -------------
    // Every empty zone offers, in-flow, the things that can go into it: a slot
    // offers its axis values, an empty canvas / loose disk / array offers disk
    // chips. The chosen option carries its own action (opt.apply), so the same
    // picker widget drives both attribute-setting and building. Drag still works
    // for mouse users; this just frees touch from it.

    // Algorithm options depend on the array's class, exactly as _makeSlots
    // decides whether to show the slot at all (parity vs flat mirror).
    const _ALGOS_PARITY = ['left-symmetric', 'left-asymmetric', 'right-symmetric', 'right-asymmetric'];
    const _ALGOS_MIRROR = ['near', 'far', 'offset'];

    /** Valid option values for an axis on a given array, in catalogue order. */
    function _axisOptions(axis, arrayId) {
      if (axis === 'algorithm') {
        const node = state.nodes.get(arrayId);
        if (!node) return [];
        const isParity     = node.redundancy === 'parity1' || node.redundancy === 'parity2';
        const isFlatMirror = node.segmentation === 'striped' && node.redundancy === 'mirror';
        if (isParity)     return _ALGOS_PARITY.slice();
        if (isFlatMirror) return _ALGOS_MIRROR.slice();
        return [];
      }
      // segmentation / redundancy: read the static catalogue from the sidebar chips.
      if (!_sidebarEl) return [];
      return Array.from(_sidebarEl.querySelectorAll(`[data-drag="${axis}"]`))
                  .map((c) => c.dataset.value)
                  .filter(Boolean);
    }

    /** Human label for a value, reused from the sidebar chip; falls back to the raw value. */
    function _axisLabel(axis, value) {
      const chip = _sidebarEl &&
        _sidebarEl.querySelector(`[data-drag="${axis}"][data-value="${value}"]`);
      return chip ? chip.textContent.trim() : value;
    }

    /** Apply an axis value (shared by drop and picker), then re-evaluate + render. */
    function _applyAxis(axis, arrayId, value) {
      if (axis === 'segmentation')    CS.setSegmentation(state, arrayId, value);
      else if (axis === 'redundancy') CS.setRedundancy(state, arrayId, value);
      else if (axis === 'algorithm')  CS.setAlgorithm(state, arrayId, value);
      _evaluateAndRender();
    }

    // ---- picker option builders ({ label, apply }) --------------------------

    /** Axis values for a slot, each wired to set that value on the array. */
    function _axisPickerOptions(axis, arrayId) {
      return _axisOptions(axis, arrayId).map((value) => ({
        label: _axisLabel(axis, value),
        apply: () => _applyAxis(axis, arrayId, value),
      }));
    }

    /**
     * Disk chips from the sidebar catalogue, each wired to `place(sizeGB, protocol)`
     * — the caller decides whether the new disk lands loose, forms an array, or
     * joins one.
     */
    function _diskPickerOptions(place) {
      if (!_sidebarEl) return [];
      return Array.from(_sidebarEl.querySelectorAll('[data-drag="disk"]')).map((chip) => ({
        label: chip.textContent.trim(),
        apply: () => { place(Number(chip.dataset.size), chip.dataset.protocol); _evaluateAndRender(); },
      }));
    }

    // ---- picker widget ------------------------------------------------------

    /** Close every open picker and drop the active-zone glow. */
    function _closePickers() {
      canvasEl.querySelectorAll('.sbc-picker').forEach((p) => p.remove());
      canvasEl.querySelectorAll('.sbc-picking')
              .forEach((s) => s.classList.remove('sbc-picking'));
    }

    /**
     * Toggle an inline picker anchored to `anchorEl` (which gets the glow).
     * The panel is placed right after `placeAfter` (defaults to the anchor), so
     * a slot can drop it under its whole row rather than splitting the row.
     */
    function _openPicker(anchorEl, options, { kind, placeAfter } = {}) {
      const wasOpen = anchorEl.classList.contains('sbc-picking');
      _closePickers();
      if (wasOpen || !options.length) return;   // second click on the same zone closes it

      const panel = document.createElement('div');
      panel.className = 'sbc-picker';
      if (kind) panel.dataset.kind = kind;
      for (const opt of options) {
        const pick = document.createElement('button');
        pick.className   = 'sbc-pick';
        pick.textContent = opt.label;
        pick.addEventListener('dragstart', (e) => e.preventDefault());
        pick.addEventListener('click', (e) => {
          e.stopPropagation();   // opt.apply re-renders, which wipes the panel
          opt.apply();
        });
        panel.appendChild(pick);
      }

      anchorEl.classList.add('sbc-picking');
      const ref = placeAfter || anchorEl;
      ref.parentNode.insertBefore(panel, ref.nextSibling);
    }

    function _makeSlot(axis, arrayId, value) {
      const el = document.createElement('div');
      el.className = value ? 'sbc-slot sbc-slot--filled' : 'sbc-slot sbc-slot--empty';
      el.dataset.axis    = axis;
      el.dataset.arrayId = arrayId;

      if (value) {
        el.appendChild(document.createTextNode(_axisLabel(axis, value)));
        const x = document.createElement('button');
        x.className   = 'sbc-delete sbc-delete--inline';
        x.textContent = '×';
        x.title       = 'Clear';
        x.addEventListener('dragstart', (e) => e.preventDefault());
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          _applyAxis(axis, arrayId, null);
        });
        el.appendChild(x);
      } else {
        const hint = document.createElement('span');
        hint.className   = 'sbc-slot-hint';
        hint.textContent = `+ ${axis}`;
        el.appendChild(hint);
      }

      // Tap/click opens the inline picker (touch-first path, additive to DnD).
      // The panel lands under the whole slots row, not inside this one slot.
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        _openPicker(el, _axisPickerOptions(axis, arrayId), { kind: axis, placeAfter: el.parentNode });
      });

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
        if (payload.type === axis) _applyAxis(axis, arrayId, payload.value);
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
      // evaluate() reconciles state (roots/members) first, so render() draws the
      // cleaned-up tree — no phantom roots or duplicate nodes from a long history.
      const result = CS.evaluate(state, { stripes: _stripes });
      render();
      if (typeof onEvaluate === 'function') onEvaluate(result);
    }

    function setStripes(n) {
      _stripes = Math.max(1, Math.min(32, n));
      _evaluateAndRender();
    }

    // Master clear: wipe the build, repaint both views (onEvaluate re-renders the
    // physical view too) and re-evaluate. Mode/challenge selection is untouched.
    function clear() {
      CS.reset(state);
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

    return { render, setupSidebar, setStripes, playAnimation, clear };
  }

  // ---------------------------------------------------------------------------

  const CanvasController = { createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = CanvasController;
  else root.CanvasController = CanvasController;

})(typeof globalThis !== 'undefined' ? globalThis : this);
