/**
 * engine.js — RAID Learning Game: rendering, interaction, drag-and-drop.
 *
 * All content is loaded lazily from YAML files in data/ via fetch + js-yaml.
 *
 * Loading sequence:
 *   Page load           → data/intro.yaml + data/raid-types.yaml + data/element-popups.yaml
 *   Tab "Build" opened  → data/challenges/index.yaml
 *   Challenge N reached → data/challenges/<id>.yaml
 */

// ---------------------------------------------------------------------------
// LAYOUT FUNCTIONS
// Visual block distribution per RAID type.
// Keys must match the 'id' fields in raid-types.yaml.
// Each function returns: Array<Array<Block>>  (rows of columns)
// Block: { label, type, stripeGroup, popupStat }
//   popupStat: which stat popup to open on click ('fault-tolerance' | 'read-perf' | etc.)
//   — here we use it to identify block type for contextual popups
// ---------------------------------------------------------------------------

const RAID_LAYOUTS = {

  raid0: (diskCount) => {
    const stripes = ['A', 'B', 'C', 'D'];
    return stripes.map((s) =>
      Array.from({ length: diskCount }, (_, d) => ({
        label: `${s}${d + 1}`,
        type: 'data',
        stripeGroup: s,
        animOrder: d,   // within-row order for animation
      }))
    );
  },

  raid1: (diskCount) => {
    const stripes = ['A', 'B', 'C', 'D'];
    return stripes.map((s) =>
      Array.from({ length: diskCount }, () => ({
        label: s,
        type: 'mirror',
        stripeGroup: s,
        animOrder: 0,   // all light up together
      }))
    );
  },

  raid5: (diskCount) => {
    const stripes = ['A', 'B', 'C'];
    return stripes.map((s, i) => {
      const parityDisk = (diskCount - 1 - i + diskCount) % diskCount;
      return Array.from({ length: diskCount }, (_, d) => {
        if (d === parityDisk) {
          return { label: `P(${s})`, type: 'parity', stripeGroup: s, animOrder: diskCount };
        }
        const dataIndex = d < parityDisk ? d + 1 : d;
        return { label: `${s}${dataIndex}`, type: 'data', stripeGroup: s, animOrder: d < parityDisk ? d : d - 1 };
      });
    });
  },

  raid6: (diskCount) => {
    const stripes = ['A', 'B', 'C'];
    return stripes.map((s, i) => {
      const parity1Disk = (diskCount - 1 - i + diskCount) % diskCount;
      const parity2Disk = (diskCount - 2 - i + diskCount) % diskCount;
      let dataCounter = 0;
      return Array.from({ length: diskCount }, (_, d) => {
        if (d === parity1Disk) return { label: 'P', type: 'parity',  stripeGroup: s, animOrder: diskCount - 1 };
        if (d === parity2Disk) return { label: 'Q', type: 'parity2', stripeGroup: s, animOrder: diskCount };
        return { label: `${s}${++dataCounter}`, type: 'data', stripeGroup: s, animOrder: dataCounter - 1 };
      });
    });
  },

  raid10: (diskCount) => {
    const mirrorPairs = diskCount / 2;
    const stripes = ['A', 'B', 'C', 'D'].slice(0, mirrorPairs);
    return stripes.map((s) =>
      Array.from({ length: diskCount }, (_, d) => {
        const pairStripe = stripes[Math.floor(d / 2)];
        return {
          label: pairStripe,
          type: d % 2 === 0 ? 'data' : 'mirror',
          stripeGroup: pairStripe,
          animOrder: Math.floor(d / 2),  // pair 0 lights before pair 1
        };
      })
    );
  },

};

// ---------------------------------------------------------------------------
// DATA LOADER — fetch + parse YAML, with in-memory cache
// ---------------------------------------------------------------------------

const Cache = {
  intro:          null,
  raidTypes:      null,
  elementPopups:  null,
  challengeIndex: null,
  challenges:     {},
};

async function loadYaml(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return jsyaml.load(await res.text());
}

const getIntro          = () => Cache.intro          ?? (Cache.intro          = loadYaml('data/intro.yaml'));
const getRaidTypes      = () => Cache.raidTypes      ?? (Cache.raidTypes      = loadYaml('data/raid-types.yaml'));
const getElementPopups  = () => Cache.elementPopups  ?? (Cache.elementPopups  = loadYaml('data/element-popups.yaml'));
const getChallengeIndex = () => Cache.challengeIndex ?? (Cache.challengeIndex = loadYaml('data/challenges/index.yaml'));

async function getChallenge(id) {
  if (!Cache.challenges[id]) Cache.challenges[id] = await loadYaml(`data/challenges/${id}.yaml`);
  return Cache.challenges[id];
}

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

const State = {
  activeTab:            'visualize',
  kbLoaded:             false,
  challengeList:        [],
  challengeIndex:       0,
  currentChallenge:     null,
  selectedRaidForBuild: null,
  placedDisks:          0,
};

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-visualize').addEventListener('click', () => switchTab('visualize'));
  document.getElementById('tab-kb').addEventListener('click',        () => switchTab('kb'));
  document.getElementById('tab-build').addEventListener('click',     () => switchTab('build'));
  setupPopupDismiss();
  loadVisualizeView();   // default tab
});

// ---------------------------------------------------------------------------
// TABS
// ---------------------------------------------------------------------------

function switchTab(tab) {
  State.activeTab = tab;
  ['visualize', 'kb', 'build'].forEach((t) => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`view-${t}`).classList.toggle('hidden', t !== tab);
  });
  if (tab === 'kb'    && !State.kbLoaded)                loadKbView();
  if (tab === 'build' && State.challengeList.length === 0) loadBuildView();
}

// ---------------------------------------------------------------------------
// VISUALIZE VIEW
// ---------------------------------------------------------------------------

// Knowledge Base tab — loads intro.yaml content
async function loadKbView() {
  const container = document.getElementById('kb-content');
  setLoading(container, 'Loading…');
  try {
    const intro = await getIntro();
    container.innerHTML = '';
    container.appendChild(buildKbContent(intro));
    State.kbLoaded = true;
  } catch (err) {
    setError(container, 'Could not load content. Try refreshing.');
    console.error(err);
  }
}

// Visualize tab — loads RAID cards only
async function loadVisualizeView() {
  const container = document.getElementById('visualize-content');
  setLoading(container, 'Loading…');
  try {
    const [raidTypes, elementPopups] = await Promise.all([
      getRaidTypes(), getElementPopups(),
    ]);
    container.innerHTML = '';

    // Colour legend above cards
    const legend = document.createElement('div');
    legend.className = 'block-legend';
    legend.innerHTML = `
      <span class="legend-item"><span class="legend-swatch swatch-data"></span>data stripe</span>
      <span class="legend-item"><span class="legend-swatch swatch-mirror"></span>mirror copy</span>
      <span class="legend-item"><span class="legend-swatch swatch-parity"></span>parity (P)</span>
      <span class="legend-item"><span class="legend-swatch swatch-parity2"></span>parity (Q)</span>
    `;
    container.appendChild(legend);

    const cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'raid-cards';
    Object.values(raidTypes).forEach((raid) => {
      cardsWrapper.appendChild(buildRaidCard(raid, elementPopups));
    });
    container.appendChild(cardsWrapper);

  } catch (err) {
    setError(container, 'Could not load content. Try refreshing.');
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// INTRO SECTION
// ---------------------------------------------------------------------------

function buildKbContent(intro) {
  const section = document.createElement('section');
  section.className = 'kb-section';

  // 1. Headline + summary
  section.innerHTML = `
    <h2 class="intro-headline">${intro.headline}</h2>
    <p class="intro-summary">${intro.summary}</p>
  `;

  // 2. Storage layers accordion (physical → logical)
  section.appendChild(buildAccordionGroup(intro.storageLayers));

  // 3. Concept cards: striping + redundancy
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

  // 4. Key parameters accordion
  section.appendChild(buildAccordionGroup(intro.parameters));

  return section;
}

// Builds a labelled accordion group from { label, items: [{term, short, detail}] }
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

// ---------------------------------------------------------------------------
// RAID CARD
// ---------------------------------------------------------------------------

function buildRaidCard(raid, elementPopups) {
  const card = document.createElement('article');
  card.className = 'raid-card';
  card.dataset.raidId = raid.id;

  // Header — name + min-disks badge + tagline; click opens general RAID popup
  const header = document.createElement('div');
  header.className = 'raid-card-header';
  header.innerHTML = `
    <div class="raid-name-row">
      <h3 class="raid-name">${raid.name}</h3>
      <span class="min-disks-badge">min ${raid.diskCount.min} disk${raid.diskCount.min > 1 ? 's' : ''}</span>
    </div>
    <span class="raid-tagline">${raid.tagline}</span>
  `;
  header.addEventListener('click', () => openPopup(raid.popup));

  // Card body: disk columns (left) + stats column (right)
  const body = document.createElement('div');
  body.className = 'raid-card-body';

  // Disk columns
  const diskCount = raid.diskCount.display;
  const layoutFn  = RAID_LAYOUTS[raid.id];
  const rows      = layoutFn ? layoutFn(diskCount) : [];
  body.appendChild(buildDiskColumns(raid, diskCount, rows, elementPopups));

  // Stats column — contextualPopups when available, elementPopups as fallback
  const stats = document.createElement('div');
  stats.className = 'raid-stats';
  [
    { key: 'fault-tolerance', label: 'fault tolerance',
      value: `${raid.faultTolerance} disk${raid.faultTolerance !== 1 ? 's' : ''}`,
      cls: raid.faultTolerance === 0 ? 'danger' : 'ok' },
    { key: 'capacity',   label: 'capacity', value: raid.capacityFormula },
    { key: 'read-perf',  label: 'read',     value: stars(raid.readPerf)  },
    { key: 'write-perf', label: 'write',    value: stars(raid.writePerf) },
  ].forEach(({ key, label, value, cls }) => {
    const span = document.createElement('span');
    span.className = 'stat clickable';
    span.innerHTML = `
      <span class="stat-label">${label}</span>
      <span class="stat-value ${cls ?? ''}">${value}</span>
    `;
    const popupData = raid.contextualPopups?.[key] ?? elementPopups[key];
    span.addEventListener('click', (e) => { e.stopPropagation(); openPopup(popupData); });
    stats.appendChild(span);
  });
  body.appendChild(stats);

  // Animate button
  const animBtn = document.createElement('button');
  animBtn.className = 'btn-animate';
  animBtn.innerHTML = '▶ simulate write';
  animBtn.addEventListener('click', () => animateWrite(card, rows));

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(animBtn);
  return card;
}

function buildDiskColumns(raid, diskCount, rows, elementPopups) {
  const popupKeyMap = {
    data:    'block-data-stripe',
    mirror:  'block-mirror',
    parity:  'block-parity',
    parity2: 'block-parity2',
  };

  const wrapper = document.createElement('div');
  wrapper.className = 'disk-columns-wrapper';

  for (let d = 0; d < diskCount; d++) {
    // Disk label
    let label = `Disk ${d}`;
    if (raid.id === 'raid10') {
      label = d < 2 ? `Mirror A · ${d}` : `Mirror B · ${d - 2}`;
    }

    // Build blocks for this column
    const blocksDiv = document.createElement('div');
    blocksDiv.className = 'disk-blocks';

    rows.forEach((row, rowIdx) => {
      const block = row[d];
      const cell  = document.createElement('div');
      cell.className           = `block block-${block.type}`;
      cell.textContent         = block.label;
      cell.dataset.row         = rowIdx;
      cell.dataset.col         = d;
      cell.dataset.animOrder   = block.animOrder;
      cell.dataset.stripeGroup = block.stripeGroup;
      cell.title = 'Click for explanation';
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        openPopup(elementPopups[popupKeyMap[block.type]]);
      });
      blocksDiv.appendChild(cell);
    });

    // Assemble disk column: icon + label header + blocks
    const diskHeader = document.createElement('div');
    diskHeader.className = 'disk-header-col';
    diskHeader.innerHTML = `
      <div class="disk-icon-visual"></div>
      <span class="disk-label">${label}</span>
    `;

    const diskBody = document.createElement('div');
    diskBody.className = 'disk-body';
    diskBody.appendChild(diskHeader);
    diskBody.appendChild(blocksDiv);

    const col = document.createElement('div');
    col.className       = 'disk-column';
    col.dataset.diskIdx = d;
    col.appendChild(diskBody);
    wrapper.appendChild(col);
  }

  return wrapper;
}

// ---------------------------------------------------------------------------
// WRITE ANIMATION
// ---------------------------------------------------------------------------

const ANIM_STEP_MS  = 320;   // delay between animation steps
const ANIM_FLASH_MS = 280;   // duration of the flash keyframe

function animateWrite(card, rows) {
  const btn    = card.querySelector('.btn-animate');
  const blocks = card.querySelectorAll('.block');

  // Lock button for the duration of the animation
  btn.disabled = true;

  // Dim all blocks
  blocks.forEach((b) => {
    b.classList.remove('lit', 'lighting');
    b.classList.add('dim');
  });

  // Build steps: each step is the set of blocks that light up together.
  // Group by (row, animOrder) — blocks with the same animOrder in the same row
  // light up simultaneously.
  const steps = [];
  rows.forEach((row, rowIdx) => {
    const maxOrder = Math.max(...row.map((b) => b.animOrder));
    for (let order = 0; order <= maxOrder; order++) {
      const group = card.querySelectorAll(
        `.block[data-row="${rowIdx}"][data-anim-order="${order}"]`
      );
      if (group.length > 0) steps.push(group);
    }
  });

  // Fire each step with delay
  steps.forEach((group, stepIdx) => {
    setTimeout(() => {
      group.forEach((b) => {
        b.classList.remove('dim');
        b.classList.add('lighting');
        // After flash, settle into 'lit'
        setTimeout(() => {
          b.classList.remove('lighting');
          b.classList.add('lit');
        }, ANIM_FLASH_MS);
      });
    }, stepIdx * ANIM_STEP_MS);
  });

  // After full animation, clean up and re-enable button
  const totalDuration = steps.length * ANIM_STEP_MS + ANIM_FLASH_MS + 400;
  setTimeout(() => {
    blocks.forEach((b) => b.classList.remove('dim', 'lit', 'lighting'));
    btn.disabled = false;
  }, totalDuration);
}

// ---------------------------------------------------------------------------
// BUILD VIEW
// ---------------------------------------------------------------------------

async function loadBuildView() {
  const container = document.getElementById('build-content');
  setLoading(container, 'Loading challenges…');
  try {
    State.challengeList = await getChallengeIndex();
    await renderChallenge(0);
  } catch (err) {
    setError(container, 'Could not load challenges. Try refreshing.');
    console.error(err);
  }
}

async function renderChallenge(index) {
  State.challengeIndex       = index;
  State.selectedRaidForBuild = null;
  State.placedDisks          = 0;

  const container = document.getElementById('build-content');
  const entry     = State.challengeList[index];
  setLoading(container, `Loading: ${entry.title}…`);

  try {
    State.currentChallenge = await getChallenge(entry.id);
    const raidTypes = await getRaidTypes();
    renderBuildUI(State.currentChallenge, raidTypes);
  } catch (err) {
    setError(container, `Could not load challenge "${entry.title}". Try refreshing.`);
    console.error(err);
  }
}

function renderBuildUI(ch, raidTypes) {
  const container = document.getElementById('build-content');
  const total     = State.challengeList.length;
  const idx       = State.challengeIndex;

  container.innerHTML = `
    <div class="challenge-header">
      <span class="challenge-progress">${idx + 1} / ${total}</span>
      <h3 class="challenge-title">${ch.title}</h3>
    </div>
    <p class="challenge-prompt">${ch.prompt}</p>
    <div class="build-area">
      <div class="disk-pool">
        <p class="pool-label">available disks — drag to configure</p>
        <div class="pool-disks" id="pool-disks"></div>
      </div>
      <div class="build-zone" id="build-zone">
        <p class="zone-label">drop disks here</p>
        <div class="zone-disks" id="zone-disks"></div>
      </div>
    </div>
    <div class="raid-selector">
      <p class="selector-label">choose RAID level:</p>
      <div class="raid-buttons" id="raid-buttons"></div>
    </div>
    <div class="build-actions">
      <button class="btn btn-secondary" id="btn-hint">show hint</button>
      <button class="btn btn-primary"   id="btn-validate">validate</button>
    </div>
    <div class="build-feedback hidden" id="build-feedback"></div>
    <div class="challenge-nav">
      ${idx > 0       ? '<button class="btn btn-ghost" id="btn-prev">← previous</button>' : ''}
      ${idx < total-1 ? '<button class="btn btn-ghost" id="btn-next">next →</button>'     : ''}
    </div>
  `;

  // Disk pool
  const poolDisks = document.getElementById('pool-disks');
  for (let i = 0; i < ch.availableDisks; i++) {
    poolDisks.appendChild(createDraggableDisk(i, ch.diskSizeGB));
  }

  // RAID buttons
  const raidButtons = document.getElementById('raid-buttons');
  Object.values(raidTypes).forEach((raid) => {
    const btn = document.createElement('button');
    btn.className      = 'raid-pick-btn';
    btn.dataset.raidId = raid.id;
    btn.textContent    = raid.name;
    btn.addEventListener('click', () => selectRaidType(raid.id));
    raidButtons.appendChild(btn);
  });

  setupDropZone();

  document.getElementById('btn-hint').addEventListener('click', showHint);
  document.getElementById('btn-validate').addEventListener('click', () => validateBuild(raidTypes));
  document.getElementById('btn-prev')?.addEventListener('click', () => renderChallenge(idx - 1));
  document.getElementById('btn-next')?.addEventListener('click', () => renderChallenge(idx + 1));
}

// ---------------------------------------------------------------------------
// DRAG & DROP
// ---------------------------------------------------------------------------

function createDraggableDisk(index, sizeGB) {
  const disk = document.createElement('div');
  disk.className         = 'draggable-disk';
  disk.draggable         = true;
  disk.dataset.diskIndex = index;
  disk.innerHTML = `<span class="drag-icon">⬜</span><span class="drag-label">${(sizeGB / 1000).toFixed(0)} TB</span>`;
  disk.addEventListener('dragstart', (e) => { e.dataTransfer.setData('diskIndex', index); disk.classList.add('dragging'); });
  disk.addEventListener('dragend',   () => disk.classList.remove('dragging'));
  return disk;
}

function setupDropZone() {
  const zone = document.getElementById('build-zone');
  zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const diskIndex = parseInt(e.dataTransfer.getData('diskIndex'));
    if (document.querySelector(`#zone-disks [data-disk-index="${diskIndex}"]`)) return;
    const poolDisk = document.querySelector(`#pool-disks [data-disk-index="${diskIndex}"]`);
    if (!poolDisk) return;
    const zoneDisk = poolDisk.cloneNode(true);
    zoneDisk.classList.add('in-zone');
    zoneDisk.draggable = false;
    zoneDisk.title = 'Click to remove';
    zoneDisk.addEventListener('click', () => returnDiskToPool(diskIndex));
    document.getElementById('zone-disks').appendChild(zoneDisk);
    poolDisk.classList.add('used');
    poolDisk.draggable = false;
    State.placedDisks++;
    updateZoneLabel();
  });
}

function returnDiskToPool(diskIndex) {
  document.querySelector(`#zone-disks [data-disk-index="${diskIndex}"]`)?.remove();
  const poolDisk = document.querySelector(`#pool-disks [data-disk-index="${diskIndex}"]`);
  if (poolDisk) { poolDisk.classList.remove('used'); poolDisk.draggable = true; }
  State.placedDisks--;
  updateZoneLabel();
}

function updateZoneLabel() {
  document.querySelector('.zone-label').textContent = State.placedDisks === 0
    ? 'drop disks here'
    : `${State.placedDisks} disk${State.placedDisks !== 1 ? 's' : ''} selected — click to remove`;
}

function selectRaidType(raidId) {
  State.selectedRaidForBuild = raidId;
  document.querySelectorAll('.raid-pick-btn').forEach((btn) =>
    btn.classList.toggle('selected', btn.dataset.raidId === raidId)
  );
}

function showHint() {
  const feedback = document.getElementById('build-feedback');
  feedback.className   = 'build-feedback hint';
  feedback.textContent = `💡 ${State.currentChallenge.hint}`;
}

async function validateBuild(raidTypes) {
  const feedback = document.getElementById('build-feedback');
  const ch       = State.currentChallenge;

  if (State.placedDisks === 0) {
    feedback.className = 'build-feedback error';
    feedback.textContent = 'Drag at least one disk into the build zone first.';
    return;
  }
  if (!State.selectedRaidForBuild) {
    feedback.className = 'build-feedback error';
    feedback.textContent = 'Select a RAID level before validating.';
    return;
  }

  const raidInfo = raidTypes[State.selectedRaidForBuild];
  const correct  = State.selectedRaidForBuild === ch.targetRaid
                && State.placedDisks >= raidInfo.diskCount.min;

  if (correct) {
    const usable = computeUsableCapacity(raidInfo, State.placedDisks, ch.diskSizeGB);
    feedback.className = 'build-feedback success';
    feedback.innerHTML = `
      <strong>✓ Correct!</strong><br>${ch.successMessage}
      <br><br>
      <span class="result-stat">Usable capacity: <strong>${usable} TB</strong></span>
      <span class="result-stat">Fault tolerance: <strong>${raidInfo.faultTolerance} disk${raidInfo.faultTolerance !== 1 ? 's' : ''}</strong></span>
    `;
  } else {
    const failMsg = ch.failureMessages?.[State.selectedRaidForBuild];
    feedback.className = 'build-feedback error';
    feedback.innerHTML = `<strong>✗ Not quite.</strong><br>${failMsg ?? 'Think again about the requirements.'}`;
  }
}

function computeUsableCapacity(raidInfo, diskCount, diskSizeGB) {
  const usableDisks = (raidInfo.id === 'raid1' || raidInfo.id === 'raid10')
    ? diskCount / 2
    : diskCount - raidInfo.faultTolerance;
  return Math.round(usableDisks * diskSizeGB / 1000);
}

// ---------------------------------------------------------------------------
// POPUP
// ---------------------------------------------------------------------------

function openPopup(data) {
  if (!data) return;
  document.getElementById('popup-title').textContent = data.title;

  let html = '';
  if (data.summary) {
    html += `<p class="popup-summary">${data.summary}</p><p class="popup-detail">${data.detail}</p>`;
    if (data.useCases?.length) {
      html += `<div class="popup-list-section"><span class="popup-list-label">✓ Good for</span>
        <ul>${data.useCases.map((u) => `<li>${u}</li>`).join('')}</ul></div>`;
    }
    if (data.notFor?.length) {
      html += `<div class="popup-list-section"><span class="popup-list-label">✗ Not ideal for</span>
        <ul>${data.notFor.map((u) => `<li>${u}</li>`).join('')}</ul></div>`;
    }
  } else {
    html = `<p>${data.body}</p>`;
  }

  const popupBody = document.getElementById('popup-body');
  popupBody.innerHTML = html;

  // Render any LaTeX delimiters ($...$ and $$...$$) found in the popup text
  renderMathInElement(popupBody, {
    delimiters: [
      { left: '$$', right: '$$', display: true  },
      { left: '$',  right: '$',  display: false },
    ],
    throwOnError: false,
  });

  const overlay = document.getElementById('popup-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('visible');
}

function closePopup() {
  const overlay = document.getElementById('popup-overlay');
  overlay.classList.remove('visible');
  overlay.classList.add('hidden');
}

function setupPopupDismiss() {
  document.getElementById('popup-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePopup();
  });
  document.getElementById('popup-close').addEventListener('click', closePopup);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function setLoading(container, msg) {
  container.innerHTML = `<p class="state-msg loading">${msg}</p>`;
}
function setError(container, msg) {
  container.innerHTML = `<p class="state-msg error">${msg}</p>`;
}
