/**
 * sidebar-accordion.js — collapse the palette into an accordion on narrow screens.
 *
 * The sidebar groups (Disks, Segmentation, …) are drag sources, so they can't
 * live in a <select> (you can't drag an option out of one). Instead each group's
 * <h3> becomes a toggle that shows/hides its chips. The behaviour is gated to
 * <=900px — the matching CSS keeps every group open on wider screens, so desktop
 * is untouched. On narrow screens exactly one section is open at a time (Disks
 * first), which bounds the palette height and keeps the canvas close.
 *
 * Zero dependencies; browser-only, never loaded in headless node tests.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;   // browser-only

  const NARROW = '(max-width: 900px)';

  function init() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const sections = Array.from(sidebar.querySelectorAll(':scope > div'));
    if (!sections.length) return;
    const mql = window.matchMedia(NARROW);

    // Refresh the ARIA contract to match the current breakpoint + open state.
    function refreshAria() {
      const narrow = mql.matches;
      for (const section of sections) {
        const h3 = section.querySelector('h3');
        if (!h3) continue;
        if (narrow) {
          h3.setAttribute('role', 'button');
          h3.setAttribute('tabindex', '0');
          h3.setAttribute('aria-expanded', String(section.classList.contains('is-open')));
        } else {
          // Wide screens show everything; the heading is just a heading again.
          h3.removeAttribute('role');
          h3.removeAttribute('tabindex');
          h3.removeAttribute('aria-expanded');
        }
      }
    }

    function openOnly(section) {
      for (const s of sections) s.classList.toggle('is-open', s === section);
    }

    sections.forEach((section, i) => {
      const h3 = section.querySelector('h3');
      if (!h3) return;

      const toggle = () => {
        if (!mql.matches) return;   // accordion only on narrow screens
        if (section.classList.contains('is-open')) {
          section.classList.remove('is-open');   // allow closing the open one
        } else {
          openOnly(section);                      // one-at-a-time
        }
        refreshAria();
      };

      h3.addEventListener('click', toggle);
      h3.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });

    // Keep state coherent: on narrow screens guarantee exactly one open section.
    function sync() {
      if (mql.matches) {
        const open = sections.filter((s) => s.classList.contains('is-open'));
        if (open.length !== 1) openOnly(sections[0]);
      }
      refreshAria();
    }

    sync();
    if (mql.addEventListener) mql.addEventListener('change', sync);
    else if (mql.addListener) mql.addListener(sync);   // older Safari/WebKit
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
