/**
 * render.js — RAID Sandbox: render + animate a placement grid (Phase 2b).
 *
 * Consumes the grid from layout.js (computePlacement) and draws disk columns,
 * then plays the "write" animation: cells light up in `seq` order, so you SEE
 * data land on the disks stripe by stripe — and parity light up *after* the
 * data it is computed from.
 *
 * Logic only: the host page supplies the CSS for .sb-grid / .sb-cell / .role-*.
 * This module is reused by the canvas (Phase 3); it does not own styling.
 *
 *   RaidRender.renderGrid(container, placement, { dim })  → grid element
 *   RaidRender.animate(container, placement, { stepMs })  → Promise<void>
 */

(function (root) {
  'use strict';

  function cellLabel(c) {
    if (c.role === 'P' || c.role === 'Q') return c.role;
    return String(c.seg);
  }

  /** Draw the disk-column grid. With { dim:true }, cells start hidden (for animation). */
  function renderGrid(container, placement, { dim = false } = {}) {
    container.innerHTML = '';
    if (placement.unsupported) {
      container.textContent = placement.reason;
      return null;
    }

    const grid = document.createElement('div');
    grid.className = 'sb-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${placement.columns}, 1fr)`;

    for (let d = 0; d < placement.columns; d++) {
      const head = document.createElement('div');
      head.className = 'sb-head';
      head.textContent = `D${d}`;
      grid.appendChild(head);
    }

    placement.stripes.forEach((row) => {
      row.forEach((c) => {
        const cell = document.createElement('div');
        cell.className = `sb-cell role-${c.role}` + (dim ? ' dim' : '');
        cell.dataset.seq = c.seq;
        cell.textContent = cellLabel(c);
        grid.appendChild(cell);
      });
    });

    container.appendChild(grid);
    return grid;
  }

  /** Render dimmed, then light cells group-by-group in ascending seq order. */
  async function animate(container, placement, { stepMs = 340 } = {}) {
    const grid = renderGrid(container, placement, { dim: true });
    if (!grid) return;

    const cells = Array.from(grid.querySelectorAll('.sb-cell'));
    const groups = new Map();
    cells.forEach((cell) => {
      const k = Number(cell.dataset.seq);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(cell);
    });

    const order = Array.from(groups.keys()).sort((a, b) => a - b);
    for (const k of order) {
      await wait(stepMs);
      groups.get(k).forEach((cell) => {
        cell.classList.remove('dim');
        cell.classList.add('flash');
        setTimeout(() => cell.classList.replace('flash', 'lit'), stepMs * 0.7);
      });
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const RaidRender = { renderGrid, animate };
  if (typeof module !== 'undefined' && module.exports) module.exports = RaidRender;
  else root.RaidRender = RaidRender;

})(typeof globalThis !== 'undefined' ? globalThis : this);
