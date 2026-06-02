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
 */

(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // COMPONENT DEFINITIONS  (derived from data/components/*.yaml)
  // ---------------------------------------------------------------------------

  // ports: array of { id, dir:'in'|'out', type, label }
  // raidEnginePosition: from YAML — used by the recognizer
  const COMPONENTS = {
    'backplane':     { label: 'Backplane',      icon: '📋', color: 'rgba(149,165,166,.7)',
                       ports: [{ id:'in',  dir:'in',  type:'block-storage' },
                               { id:'out', dir:'out', type:'routing' }] },
    'hba':           { label: 'HBA',            icon: '🔌', color: 'rgba(149,165,166,.7)',
                       ports: [{ id:'in',  dir:'in',  type:'routing' },
                               { id:'out', dir:'out', type:'pcie' }] },
    'controller-hw': { label: 'Controller HW',  icon: '🖥', color: 'rgba(52,152,219,.7)',
                       ports: [{ id:'in',  dir:'in',  type:'routing' },
                               { id:'out', dir:'out', type:'virtual-drive' }],
                       badge: 'RAID Engine' },
    'raid-engine':   { label: 'RAID Engine',    icon: '⚙', color: 'rgba(231,76,60,.7)',
                       // 'any' type: the engine connects anywhere in the chain.
                       // Its position (before CPU = fake; after CPU = software)
                       // is determined by the recognizer, not port validation.
                       ports: [{ id:'in',  dir:'in',  type:'any' },
                               { id:'out', dir:'out', type:'any' }],
                       badge: 'Engine' },
    'os-linux':      { label: 'Linux',          icon: '🐧', color: 'rgba(46,204,113,.7)',
                       ports: [{ id:'in',  dir:'in',  type:'cpu' }] },
    'os-windows':    { label: 'Windows',        icon: '🪟', color: 'rgba(46,204,113,.7)',
                       ports: [{ id:'in',  dir:'in',  type:'cpu' }] },
    'pcie':          { label: 'PCIe bus',       icon: '🔷', color: 'rgba(241,196,15,.5)',
                       ports: [{ id:'in',  dir:'in',  type:'pcie' },
                               { id:'out', dir:'out', type:'pcie' }] },
    'cpu':           { label: 'CPU',            icon: '⚡', color: 'rgba(241,196,15,.7)',
                       ports: [{ id:'in',  dir:'in',  type:'pcie' },
                               { id:'out', dir:'out', type:'cpu'  }] },
  };

  // Port compatibility: which output types can connect to which input types.
  const COMPATIBLE = {
    'block-storage': ['block-storage'],
    'routing':       ['routing'],
    'pcie':          ['pcie', 'pcie-raid'],
    'pcie-raid':     ['pcie'],
    'virtual-drive': ['pcie'],   // controller-hw → pcie bus → cpu
    'cpu':           ['cpu'],
  };

  function portsCompatible(outType, inType) {
    if (outType === 'any' || inType === 'any') return true;
    return (COMPATIBLE[outType] || []).includes(inType) ||
           (COMPATIBLE[inType]  || []).includes(outType);
  }

  const DT_KEY = 'text/plain';
  function setDrag(e, payload) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(DT_KEY, JSON.stringify(payload));
  }
  function getDrag(e) {
    try { return JSON.parse(e.dataTransfer.getData(DT_KEY)); } catch { return null; }
  }

  // ---------------------------------------------------------------------------
  // FACTORY
  // ---------------------------------------------------------------------------

  function createPhysicalController({ canvasEl, svgEl, state, onEvaluate }) {
    const CS = root.CanvasState;

    // Pending connection: started from an output port, follows the cursor.
    let _pendingFrom = null;   // { nodeId, portId, portType, el }
    let _pendingLine = null;   // SVG line element

    // ---- sidebar setup (called once) ----------------------------------------

    function setupSidebar(sidebarEl) {
      sidebarEl.querySelectorAll('[data-drag="phys-component"]').forEach(chip => {
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
        if (!COMPONENTS[payload.componentId]) return; // unknown component — ignore silently
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
      // that live in the data view. Give any new disk a default position
      // (stacked on the left), then auto-route them by protocol.
      let i = 0;
      for (const node of state.nodes.values()) {
        if (node.kind !== 'disk') continue;
        if (!state.cpDiskPositions.has(node.id)) {
          CS.cpSetDiskPos(state, node.id, { x: 12, y: 12 + i * 46 });
        }
        i++;
      }
      CS.cpAutoRoute(state);

      for (const node of state.nodes.values()) {
        if (node.kind === 'disk') canvasEl.appendChild(_makeDiskNodeEl(node));
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

    function _makeDiskNodeEl(disk) {
      const el = document.createElement('div');
      el.className = 'pln pln-node pln-disk';
      el.dataset.nodeId = disk.id;
      const pos = state.cpDiskPositions.get(disk.id) || { x: 12, y: 12 };
      el.style.left = pos.x + 'px';
      el.style.top  = pos.y + 'px';
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
      const def = COMPONENTS[node.componentId];
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
          if (payload.fromNode === nodeId) return; // no self-loop
          if (!portsCompatible(payload.fromType, portDef.type)) return;
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
      // Click to remove.
      path.style.cursor = 'pointer';
      path.style.pointerEvents = 'stroke';
      path.addEventListener('click', () => {
        CS.cpDisconnect(state, edge.id);
        render();
        if (typeof onEvaluate === 'function') onEvaluate(CS.evaluate(state));
      });
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

  const PhysicalController = { createPhysicalController, COMPONENTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = PhysicalController;
  else root.PhysicalController = PhysicalController;

})(typeof globalThis !== 'undefined' ? globalThis : this);
