/**
 * canvas-controller.js — RAID Sandbox: drag-and-drop controller (Phase 3).
 *
 * Translates DOM drag events into CanvasState mutations, then calls evaluate()
 * and refreshes the output panels. The only module that touches the DOM outside
 * of render.js.
 *
 *   createController({ canvasEl, resultsEl, state }) → controller
 *   controller.render()   — rebuild canvas DOM from state (call after each mutation)
 */

(function (root) {
  'use strict';

  // Drag payload keys stored in dataTransfer as JSON.
  // source: 'sidebar' | 'canvas'
  // type:   'disk' | 'segmentation' | 'redundancy'
  // For sidebar disks: { source, type:'disk', protocol, sizeGB }
  // For sidebar props: { source, type:'segmentation'|'redundancy', value }
  // For canvas disks:  { source:'canvas', type:'disk', id }
  const DT_KEY = 'application/raid-sandbox';

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

  function createController({ canvasEl, resultsEl, state }) {
    const CS     = root.CanvasState;
    const Render = root.RaidRender;

    let _animating = false;

    // ---- sidebar chip setup (called once on init) ---------------------------

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

    // ---- canvas render ------------------------------------------------------

    function render() {
      canvasEl.innerHTML = '';

      // Render root nodes. In Phase 3 a root is either a loose disk or an array.
      for (const id of state.roots) {
        const node = state.nodes.get(id);
        if (!node) continue;
        canvasEl.appendChild(
          node.kind === 'disk' ? _makeDiskEl(id, node) : _makeArrayEl(id, node)
        );
      }

      // Canvas itself is a drop target for new disks and for disk→disk grouping.
      _setDropTarget(canvasEl, 'canvas');
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

      _setDropTarget(el, 'disk', id);
      return el;
    }

    function _makeArrayEl(id, node) {
      const el = document.createElement('div');
      el.className = 'sbc-array';
      el.dataset.id   = id;
      el.dataset.kind = 'array';

      // Slot row — two drop slots (segmentation and redundancy).
      const slots = document.createElement('div');
      slots.className = 'sbc-slots';
      slots.appendChild(_makeSlot('segmentation', id, node.segmentation));
      slots.appendChild(_makeSlot('redundancy',   id, node.redundancy));
      el.appendChild(slots);

      // Member disks inside the array.
      const members = document.createElement('div');
      members.className = 'sbc-members';
      for (const mid of node.members) {
        const mNode = state.nodes.get(mid);
        if (mNode) members.appendChild(_makeDiskEl(mid, mNode));
      }
      el.appendChild(members);

      // The array container accepts: canvas-disk drops + sidebar prop drops.
      _setDropTarget(el, 'array', id);
      return el;
    }

    function _makeSlot(axis, arrayId, value) {
      const el = document.createElement('div');
      el.className = value ? `sbc-slot sbc-slot--filled` : 'sbc-slot sbc-slot--empty';
      el.dataset.axis    = axis;
      el.dataset.arrayId = arrayId;

      if (value) {
        el.textContent = value;
      } else {
        el.innerHTML = `<span class="sbc-slot-hint">drop ${axis}</span>`;
      }

      // Slot is a drop target specifically for its axis.
      el.addEventListener('dragover',  (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('sbc-slot--over'); });
      el.addEventListener('dragleave', ()  => el.classList.remove('sbc-slot--over'));
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
        }
      });

      return el;
    }

    // ---- drop target wiring -------------------------------------------------

    function _setDropTarget(el, kind, id) {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('sbc--over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('sbc--over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('sbc--over');
        _handleDrop(e, kind, id);
      });
    }

    // ---- drop dispatch ------------------------------------------------------

    function _handleDrop(e, targetKind, targetId) {
      const payload = getDrag(e);
      if (!payload) return;

      if (payload.source === 'sidebar' && payload.type === 'disk') {
        // Sidebar disk dropped onto canvas / disk / array.
        const newId = CS.addDisk(state, payload.sizeGB, payload.protocol);

        if (targetKind === 'disk') {
          // disk → disk: group both.
          CS.group(state, [targetId, newId]);
        } else if (targetKind === 'array') {
          // disk → array: add to existing array.
          CS.addToArray(state, targetId, newId);
        }
        // else: dropped on empty canvas → disk just sits loose.
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
          // canvas disk → canvas disk: group.
          CS.group(state, [targetId, srcId]);
          _evaluateAndRender();
        } else if (targetKind === 'array') {
          // canvas disk → array: add to array.
          CS.addToArray(state, targetId, srcId);
          _evaluateAndRender();
        }
        // canvas → canvas (empty): no-op in Phase 3 (no free positioning yet).
      }
    }

    // ---- evaluate + results -------------------------------------------------

    function _evaluateAndRender() {
      render();
      const result = CS.evaluate(state);
      _updateResults(result);
    }

    function _updateResults(r) {
      if (!resultsEl) return;

      const q = (sel) => resultsEl.querySelector(sel);

      if (r.analysis) {
        const a = r.analysis;
        q('[data-result="level"]').textContent =
          a.level ?? `non-standard (${a.reason})`;
        q('[data-result="level"]').className =
          `sbc-level ${a.level ? '' : 'sbc-level--nonstd'}`;
        q('[data-result="capacity"]').textContent = `${a.capacityGB} TB usable`;
        q('[data-result="ft"]').textContent       =
          `±${a.faultTolerance} disk failure${a.faultTolerance !== 1 ? 's' : ''}`;
      } else {
        q('[data-result="level"]').textContent    = '—';
        q('[data-result="capacity"]').textContent = '—';
        q('[data-result="ft"]').textContent       = '—';
      }

      const issueEl = q('[data-result="issue"]');
      if (r.firstIssue) {
        issueEl.textContent = `⚠ ${r.firstIssue}`;
        issueEl.hidden = false;
      } else {
        issueEl.hidden = true;
      }

      const gridEl = q('[data-result="grid"]');
      if (r.placement && !_animating) {
        if (r.placement.unsupported) {
          gridEl.textContent = `No placement defined: ${r.placement.reason}`;
        } else {
          Render.renderGrid(gridEl, r.placement);
        }
      } else if (!r.placement) {
        gridEl.innerHTML = '';
      }
    }

    function playAnimation() {
      if (_animating) return;
      const result = CS.evaluate(state);
      if (!result.placement || result.placement.unsupported) return;
      const gridEl = resultsEl.querySelector('[data-result="grid"]');
      _animating = true;
      Render.animate(gridEl, result.placement, { stepMs: 320 })
        .then(() => { _animating = false; });
    }

    return { render, setupSidebar, playAnimation, _evaluateAndRender };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const CanvasController = { createController };

  if (typeof module !== 'undefined' && module.exports) module.exports = CanvasController;
  else root.CanvasController = CanvasController;

})(typeof globalThis !== 'undefined' ? globalThis : this);
