/**
 * physical-controller.js — RAID Sandbox: physical layer (axis A) canvas controller.
 *
 * Manages the port-to-port drag-and-drop canvas for the control path.
 * Component nodes are draggable; connections are made by dragging from an
 * output port dot to an input port dot. SVG lines render the edges.
 *
 * Port directions:
 *   input  (left side of node)  — what the component consumes
 *   output (right side of node) — what the component provides
 *
 * createPhysicalController({ canvasEl, svgEl, state, onEvaluate }) → controller
 *   controller.setupSidebar(sidebarEl)
 *   controller.render()
 *
 * What this file does NOT own any more: the component definitions and the port
 * relation. Those are DATA (spec §5a) — data/components/index.yaml plus the
 * component files — indexed into a catalogue by engine/catalog.js and held on
 * the state (`state.catalog`). This controller only draws what the catalogue
 * says and asks the state whether a wire may form (CanvasState.cpCanConnect).
 *
 * Browser-only loader:
 *   PhysicalController.loadCatalog(basePath) → Promise<Catalog>
 *   Fetches index.yaml and every listed component file, builds the catalogue.
 *   Rejects on any failure — there is no hard-coded fallback: a physical layer
 *   drawn from a stale table would disagree with the engine that reads the data.
 *   Never called in Node (the headless suites use tests/fixtures/components.js).
 */

(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // BROWSER-ONLY CATALOGUE LOADER
  // ---------------------------------------------------------------------------

  function _loadYaml(path) {
    return fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
        return res.text();
      })
      .then((txt) => root.jsyaml.load(txt));
  }

  /**
   * Fetch the manifest and build the catalogue.
   * @param {string} basePath  Path to data/components/ (default 'data/components')
   * @returns {Promise<Catalog>}  rejects with a message naming the file at fault
   */
  function loadCatalog(basePath) {
    const base = (basePath || 'data/components').replace(/\/$/, '');
    // Fetch, then hand everything to the engine's own assembler: this file
    // decides nothing about the manifest's shape (see RaidCatalog.assemble).
    return _loadYaml(`${base}/index.yaml`).then((index) => {
      if (!index || !Array.isArray(index.components))
        throw new Error(`${base}/index.yaml: expected a "components" list`);
      return Promise.all(index.components.map((entry) =>
        _loadYaml(`${base}/${entry.file}`).then((def) => [entry.file, def])
      )).then((pairs) => {
        const files = {};
        for (const [name, def] of pairs) files[name] = def;
        return root.RaidCatalog.createCatalog(root.RaidCatalog.assemble(index, files));
      });
    });
  }

  const { setDrag, getDrag } = root.DragUtil;

  // ---------------------------------------------------------------------------
  // FACTORY
  // ---------------------------------------------------------------------------

  function createPhysicalController({ canvasEl, svgEl, state, onEvaluate }) {
    const CS = root.CanvasState;

    // Pending connection: started from an output port, follows the cursor.
    let _pendingFrom = null;   // { nodeId, portId, portType, el }
    let _pendingLine = null;   // SVG line element

    /**
     * What the canvas needs to draw a component, read off the catalogue:
     * the ui: block (label, icon, colour, badge) plus the model's ports. Null
     * until the catalogue has loaded, or for an id it does not know.
     */
    function _def(componentId) {
      const cat = state.catalog;
      const def = cat && cat.get(componentId);
      if (!def) return null;
      const ui = def.ui || {};
      return { label: ui.label || def.name || componentId, icon: ui.icon || '', color: ui.color || '',
               badge: ui.badge || null, ports: def.ports };
    }

    // ---- sidebar setup (called once) ----------------------------------------

    /**
     * Build the physical palette FROM the catalogue — one chip per component,
     * in catalogue order — then arm every chip for dragging. Adding a component
     * is adding a file (spec §5): no markup to edit. Safe to call twice: before
     * the catalogue has loaded it only arms whatever chips exist (none), after
     * it draws them; chips already armed are not armed again.
     */
    function setupSidebar(sidebarEl) {
      const host = sidebarEl.querySelector('[data-phys-chips]');
      if (host && state.catalog) {
        host.textContent = '';
        for (const id of state.catalog.ids()) {
          const def  = _def(id);
          const ui   = state.catalog.get(id).ui || {};
          const chip = document.createElement('div');
          chip.className = 'sbc-chip';
          chip.dataset.drag = 'phys-component';
          chip.dataset.component = id;
          chip.textContent = ui.chip || (def.badge ? `${def.label} (${def.badge})` : def.label);
          if (ui.tooltip) chip.title = ui.tooltip;
          host.appendChild(chip);
        }
      }
      sidebarEl.querySelectorAll('[data-drag="phys-component"]').forEach(chip => {
        if (chip.dataset.armed) return;
        chip.dataset.armed = '1';
        chip.setAttribute('draggable', 'true');
        chip.addEventListener('dragstart', e => {
          setDrag(e, { source: 'sidebar', type: 'phys-component',
                       componentId: chip.dataset.component });
        });
      });
    }

    // ---- canvas drop (new component from sidebar) ---------------------------

    function _setupCanvasDrop() {
      canvasEl.addEventListener('dragover', e => { e.preventDefault(); });
      canvasEl.addEventListener('drop', e => {
        e.preventDefault();
        const payload = getDrag(e);
        if (!payload || payload.source !== 'sidebar' || payload.type !== 'phys-component') return;
        if (!_def(payload.componentId)) {
          // No catalogue yet, or a chip naming a component the data does not
          // define: nothing to place. Said out loud rather than swallowed.
          console.warn(`physical layer: cannot place "${payload.componentId}" — not in the catalogue`);
          return;
        }
        const rect = canvasEl.getBoundingClientRect();
        const pos  = { x: e.clientX - rect.left - 40, y: e.clientY - rect.top - 20 };
        CS.cpAddNode(state, payload.componentId, pos);
        render();
        if (typeof onEvaluate === 'function') onEvaluate(root.CanvasState.evaluate(state));
      });
    }
    _setupCanvasDrop();

    // ---- render -------------------------------------------------------------

    function render() {
      // Keep SVG in sync but clear only the dynamic lines.
      _clearSvg();

      // Remove old node elements (keep only SVG).
      Array.from(canvasEl.querySelectorAll('.pln')).forEach(el => el.remove());

      // Bridge (Option 2): disks are the shared atom — render the SAME disks
      // that live in the data view, then auto-route them by protocol.
      //
      // Positions: a disk the user dragged keeps its manual position (stored in
      // cpDiskPositions); every other disk is auto-flowed into a clean grid FRESH
      // each render. The old approach STORED auto positions, so after add/remove
      // churn stale coordinates lingered and a new disk could land on top of an
      // existing one — that was the misalignment. Reflowing every render keeps
      // the auto column tidy and wraps into columns so many disks don't overflow.
      for (const id of [...state.cpDiskPositions.keys()]) {
        if (!state.nodes.has(id)) state.cpDiskPositions.delete(id);   // prune removed disks
      }
      const PER_COL = 4;
      const diskPos = new Map();
      let auto = 0;
      for (const node of state.nodes.values()) {
        if (node.kind !== 'disk') continue;
        if (state.cpDiskPositions.has(node.id)) {
          diskPos.set(node.id, state.cpDiskPositions.get(node.id));   // manual (dragged)
        } else {
          diskPos.set(node.id, { x: 12 + Math.floor(auto / PER_COL) * 120,
                                 y: 12 + (auto % PER_COL) * 46 });    // auto-flow grid
          auto++;
        }
      }
      CS.cpAutoRoute(state);

      for (const node of state.nodes.values()) {
        if (node.kind === 'disk') canvasEl.appendChild(_makeDiskNodeEl(node, diskPos.get(node.id)));
      }
      for (const node of state.cpNodes.values()) {
        canvasEl.appendChild(_makeNodeEl(node));
      }

      // Draw edges after browser layout so getBoundingClientRect() is accurate.
      requestAnimationFrame(() => {
        for (const edge of state.cpEdges.values()) {
          _drawEdge(edge);
        }
      });
    }

    // ---- disk node (shared atom from the data view) -------------------------

    function _makeDiskNodeEl(disk, pos) {
      const el = document.createElement('div');
      el.className = 'pln pln-node pln-disk';
      el.dataset.nodeId = disk.id;
      const p = pos || state.cpDiskPositions.get(disk.id) || { x: 12, y: 12 };
      el.style.left = p.x + 'px';
      el.style.top  = p.y + 'px';
      el.style.setProperty('--node-color', 'rgba(52,152,219,.7)');

      el.innerHTML =
        `<span class="pln-icon">💾</span>` +
        `<span class="pln-label">${disk.protocol} ${disk.sizeGB}TB</span>`;

      // Output-only port: a visual anchor for the auto-routed edge.
      // v1 has no manual disk-wiring, so this port does not start connections.
      const out = document.createElement('div');
      out.className = 'pln-port pln-port--out';
      out.dataset.nodeId = disk.id;
      out.dataset.portId = 'out';
      el.appendChild(out);

      // Drag to reposition within the physical view.
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', e => {
        e.stopPropagation();
        setDrag(e, { source: 'canvas-phys', type: 'move-disk', diskId: disk.id,
                     offX: e.offsetX, offY: e.offsetY });
      });

      return el;
    }

    // ---- node element -------------------------------------------------------

    function _makeNodeEl(node) {
      const def = _def(node.componentId);
      if (!def) return document.createElement('div');

      const el = document.createElement('div');
      el.className = 'pln pln-node';
      el.dataset.nodeId = node.id;
      el.style.left = node.pos.x + 'px';
      el.style.top  = node.pos.y + 'px';
      el.style.setProperty('--node-color', def.color);

      el.innerHTML =
        `<span class="pln-icon">${def.icon}</span>` +
        `<span class="pln-label">${def.label}</span>` +
        (def.badge ? `<span class="pln-badge">${def.badge}</span>` : '');

      // Input port (left).
      const inPorts = def.ports.filter(p => p.dir === 'in');
      const outPorts = def.ports.filter(p => p.dir === 'out');

      inPorts.forEach(p => el.appendChild(_makePort(node.id, p, 'in')));
      outPorts.forEach(p => el.appendChild(_makePort(node.id, p, 'out')));

      // Delete button.
      if (!def.fixed) {
        const del = document.createElement('button');
        del.className = 'pln-delete';
        del.textContent = '×';
        del.addEventListener('dragstart', e => e.preventDefault());
        del.addEventListener('click', e => {
          e.stopPropagation();
          CS.cpRemoveNode(state, node.id);
          render();
          if (typeof onEvaluate === 'function') onEvaluate(CS.evaluate(state));
        });
        el.appendChild(del);
      }

      // Drag to reposition.
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', e => {
        e.stopPropagation();
        setDrag(e, { source: 'canvas-phys', type: 'move-node', nodeId: node.id,
                     offX: e.offsetX, offY: e.offsetY });
      });

      return el;
    }

    // ---- port dot -----------------------------------------------------------

    function _makePort(nodeId, portDef, dir) {
      const dot = document.createElement('div');
      dot.className = `pln-port pln-port--${dir}`;
      dot.dataset.nodeId = nodeId;
      dot.dataset.portId = portDef.id;
      dot.dataset.portType = portDef.type;
      dot.setAttribute('draggable', 'true');

      // Start connection from output port.
      if (dir === 'out') {
        dot.addEventListener('dragstart', e => {
          e.stopPropagation();
          _pendingFrom = { nodeId, portId: portDef.id, portType: portDef.type };
          setDrag(e, { source: 'canvas-phys', type: 'port-connect',
                       fromNode: nodeId, fromPort: portDef.id, fromType: portDef.type });
          // Start a pending SVG line.
          _pendingLine = _createSvgLine('rgba(255,255,255,.4)', true);
          svgEl.appendChild(_pendingLine);
        });
        dot.addEventListener('drag', e => {
          if (!_pendingLine || !_pendingFrom) return;
          if (e.clientX === 0 && e.clientY === 0) return; // dragend fires 0,0 in some browsers
          const fromEl = canvasEl.querySelector(`[data-node-id="${_pendingFrom.nodeId}"] .pln-port--out`);
          if (!fromEl) return;
          const rect  = canvasEl.getBoundingClientRect();
          const fr    = fromEl.getBoundingClientRect();
          const fx    = fr.left + fr.width / 2 - rect.left;
          const fy    = fr.top  + fr.height / 2 - rect.top;
          const tx    = e.clientX - rect.left;
          const ty    = e.clientY - rect.top;
          _updateLine(_pendingLine, fx, fy, tx, ty);
        });
        dot.addEventListener('dragend', () => {
          if (_pendingLine) { _pendingLine.remove(); _pendingLine = null; }
          _pendingFrom = null;
        });
      }

      // Accept connection on input port.
      if (dir === 'in') {
        dot.addEventListener('dragover', e => { e.preventDefault(); dot.classList.add('pln-port--over'); });
        dot.addEventListener('dragleave', () => dot.classList.remove('pln-port--over'));
        dot.addEventListener('drop', e => {
          e.preventDefault(); e.stopPropagation();
          dot.classList.remove('pln-port--over');
          const payload = getDrag(e);
          if (!payload || payload.type !== 'port-connect') return;
          // The state decides whether the wire may form (port types, direction,
          // self-loops) from the catalogue; the canvas just declines to draw it.
          if (!CS.cpCanConnect(state, payload.fromNode, payload.fromPort, nodeId, portDef.id).ok) return;
          CS.cpConnect(state, payload.fromNode, payload.fromPort, nodeId, portDef.id);
          render();
          if (typeof onEvaluate === 'function') onEvaluate(CS.evaluate(state));
        });
      }

      return dot;
    }

    // ---- node repositioning -------------------------------------------------

    canvasEl.addEventListener('drop', e => {
      const payload = getDrag(e);
      if (!payload || payload.source !== 'canvas-phys') return;
      if (payload.type !== 'move-node' && payload.type !== 'move-disk') return;
      const rect = canvasEl.getBoundingClientRect();
      const pos  = {
        x: e.clientX - rect.left - (payload.offX || 0),
        y: e.clientY - rect.top  - (payload.offY || 0),
      };
      if (payload.type === 'move-disk') CS.cpSetDiskPos(state, payload.diskId, pos);
      else                              CS.cpMoveNode(state, payload.nodeId, pos);
      render();
    });

    // ---- SVG helpers --------------------------------------------------------

    function _clearSvg() {
      while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    }

    function _createSvgLine(stroke, dashed) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-width', '2');
      if (dashed) line.setAttribute('stroke-dasharray', '4 3');
      line.setAttribute('marker-end', 'url(#arrow)');
      return line;
    }

    function _updateLine(line, x1, y1, x2, y2) {
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    }

    function _drawEdge(edge) {
      const fromEl = canvasEl.querySelector(`[data-node-id="${edge.fromNode}"] .pln-port--out`);
      const toEl   = canvasEl.querySelector(`[data-node-id="${edge.toNode}"] .pln-port--in`);
      if (!fromEl || !toEl) return;

      const rect = canvasEl.getBoundingClientRect();
      const fr   = fromEl.getBoundingClientRect();
      const tr   = toEl.getBoundingClientRect();
      const x1   = fr.left + fr.width / 2  - rect.left;
      const y1   = fr.top  + fr.height / 2 - rect.top;
      const x2   = tr.left + tr.width / 2  - rect.left;
      const y2   = tr.top  + tr.height / 2 - rect.top;

      // Cubic bezier path for smoother arrows.
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const cx   = (x1 + x2) / 2;
      path.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
      path.setAttribute('stroke', 'rgba(255,255,255,.45)');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#arrow)');
      // Click to remove — hand-drawn wires only. A derived edge (disk → the
      // component that accepts its protocol) is domain truth, not a drawing:
      // the state refuses to drop it, so the canvas does not offer to.
      if (!edge.derived) {
        path.style.cursor = 'pointer';
        path.style.pointerEvents = 'stroke';
        path.addEventListener('click', () => {
          CS.cpDisconnect(state, edge.id);
          render();
          if (typeof onEvaluate === 'function') onEvaluate(CS.evaluate(state));
        });
      }
      svgEl.appendChild(path);
    }

    // Inject SVG arrow marker once.
    function _injectMarker() {
      const defs   = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'arrow');
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '8');
      marker.setAttribute('refX', '6');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', '0 0, 8 3, 0 6');
      poly.setAttribute('fill', 'rgba(255,255,255,.55)');
      marker.appendChild(poly);
      defs.appendChild(marker);
      svgEl.appendChild(defs);
    }
    _injectMarker();

    return { setupSidebar, render };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  const PhysicalController = { createPhysicalController, loadCatalog };
  if (typeof module !== 'undefined' && module.exports) module.exports = PhysicalController;
  else root.PhysicalController = PhysicalController;

})(typeof globalThis !== 'undefined' ? globalThis : this);
