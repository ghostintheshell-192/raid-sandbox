/**
 * drag-util.js — shared drag-and-drop helpers for canvas-controller and physical-controller.
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

  root.DragUtil = { setDrag, getDrag };
})(typeof window !== 'undefined' ? window : global);
