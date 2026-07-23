/**
 * kb.js — Knowledge Base page for the RAID guide.
 *
 * The interactive game is the site's front page (index.html); this page
 * is the static reference, built from data/intro.yaml. Extracted from the retired
 * engine.js, which also drove the old Visualize gallery and the linear Build quiz
 * (both removed in the move to the composition-based sandbox).
 */
(function () {
  'use strict';

  // ---- YAML loader ----------------------------------------------------------
  const Cache = { intro: null };

  async function loadYaml(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return jsyaml.load(await res.text());
  }
  const getIntro = () => Cache.intro ?? (Cache.intro = loadYaml('data/intro.yaml'));

  const setLoading = (c, msg) => { c.innerHTML = `<p class="state-msg loading">${msg}</p>`; };
  const setError   = (c, msg) => { c.innerHTML = `<p class="state-msg error">${msg}</p>`; };

  // ---- render ---------------------------------------------------------------
  async function loadKbView() {
    const container = document.getElementById('kb-content');
    setLoading(container, 'Loading…');
    try {
      const intro = await getIntro();
      container.innerHTML = '';
      container.appendChild(buildKbContent(intro));
    } catch (err) {
      setError(container, 'Could not load content. Try refreshing.');
      console.error(err);
    }
  }

  function buildKbContent(intro) {
    const section = document.createElement('section');
    section.className = 'kb-section';

    section.innerHTML = `
      <h2 class="intro-headline">${intro.headline}</h2>
      <p class="intro-summary">${intro.summary}</p>
    `;

    // Storage layers accordion (physical → logical)
    section.appendChild(buildAccordionGroup(intro.storageLayers));

    // Concept cards: striping + redundancy
    const concepts = document.createElement('div');
    concepts.className = 'intro-concepts';
    Object.values(intro.concepts).forEach((concept) => {
      const block = document.createElement('div');
      block.className = 'concept-block';
      block.innerHTML = `
        <h3 class="concept-title">${concept.title}</h3>
        <p class="concept-body">${concept.body}</p>
      `;
      concepts.appendChild(block);
    });
    section.appendChild(concepts);

    // Key parameters accordion
    section.appendChild(buildAccordionGroup(intro.parameters));
    return section;
  }

  // Labelled accordion group from { label, items: [{term, short, detail}] }
  function buildAccordionGroup(group) {
    const wrapper = document.createElement('div');
    wrapper.className = 'accordion-group';

    const label = document.createElement('p');
    label.className = 'accordion-label';
    label.textContent = group.label;
    wrapper.appendChild(label);

    const accordion = document.createElement('div');
    accordion.className = 'accordion';
    group.items.forEach((item) => {
      const details = document.createElement('details');
      details.className = 'accordion-item';
      details.innerHTML = `
        <summary class="accordion-header">
          <span class="accordion-term">${item.term}</span>
          <span class="accordion-short">${item.short}</span>
          <span class="accordion-arrow">▸</span>
        </summary>
        <div class="accordion-body">${item.detail}</div>
      `;
      accordion.appendChild(details);
    });
    wrapper.appendChild(accordion);
    return wrapper;
  }

  document.addEventListener('DOMContentLoaded', loadKbView);
})();
