/**
 * challenge-ui.js — Challenge mode UI for the RAID Sandbox.
 *
 * Owns all DOM wiring for the challenge list, client brief, hint toggle,
 * requirement checklist, and win banner. Reads from RaidChallenge (challenge.js).
 *
 * Usage:
 *   const ui = ChallengeUI.createChallengeUI();
 *   // then in onEvaluate:
 *   ui.update(evaluateResult);
 */

(function (root) {
  'use strict';

  function createChallengeUI() {
    const elModeSelect        = document.getElementById('mode-select');
    const elChallengeListWrap = document.querySelector('[data-challenge-list-wrap]');
    const elChallengeList     = document.querySelector('[data-challenge-list]');
    const elWin               = document.querySelector('[data-win]');
    const elPrompt            = document.querySelector('[data-prompt]');
    const elPromptClient      = document.querySelector('[data-prompt-client]');
    const elPromptText        = document.querySelector('[data-prompt-text]');
    const elHintBtn           = document.querySelector('[data-hint-btn]');
    const elPromptHint        = document.querySelector('[data-prompt-hint]');
    const elReqWrap           = document.querySelector('[data-requirements-wrap]');
    const elReqs              = document.querySelector('[data-result="requirements"]');

    let challengeIndex   = [];
    let currentChallenge = null;
    let lastResult       = null;

    function renderPrompt(ch) {
      elPromptClient.textContent = `🗣 ${ch.client || 'Client'}`;
      elPromptText.textContent   = ch.prompt || '';
      elPromptHint.textContent   = ch.hint || '';
      elPromptHint.hidden = true;
      elHintBtn.hidden    = !ch.hint;
      elHintBtn.textContent = '💡 Need a hint?';
      elPrompt.hidden     = false;
      elReqWrap.hidden    = false;
    }

    function hideChallengeUI() {
      elChallengeListWrap.hidden = true;
      elPrompt.hidden  = true;
      elReqWrap.hidden = true;
      elWin.hidden     = true;
      elReqs.innerHTML = '';
    }

    function renderChallengeList() {
      elChallengeList.innerHTML = '';
      for (const c of challengeIndex) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'sbc-challenge-item'
          + (currentChallenge && currentChallenge.id === c.id ? ' sbc-challenge-item--active' : '');
        item.textContent = c.title;
        item.addEventListener('click', () => selectChallenge(c.id));
        elChallengeList.appendChild(item);
      }
    }

    function selectChallenge(id) {
      root.RaidChallenge.loadChallenge(id)
        .then((ch) => {
          currentChallenge = ch;
          renderChallengeList();
          renderPrompt(ch);
          updateChallengeUI(lastResult);
        })
        .catch(() => { /* keep current selection on a load error */ });
    }

    function updateChallengeUI(r) {
      if (!currentChallenge) { elWin.hidden = true; return; }
      const res = root.RaidChallenge.checkChallenge(currentChallenge, r || {});
      elReqs.innerHTML = '';
      for (const req of res.requirements.filter((x) => !x.isAny)) {
        const row = document.createElement('div');
        row.className = 'sbc-req ' + (req.met ? 'sbc-req--met' : 'sbc-req--unmet');
        const actual = (req.actual === undefined || req.actual === null) ? '—' : req.actual;
        row.textContent = `${req.met ? '✓' : '○'} ${req.label}  ·  now: ${actual}`;
        elReqs.appendChild(row);
      }
      elWin.hidden = !res.satisfied;
    }

    let _indexLoaded = false;
    function ensureIndex() {
      if (_indexLoaded) return Promise.resolve(challengeIndex);
      return root.RaidChallenge.loadIndex()
        .then((list) => { challengeIndex = list || []; _indexLoaded = true; return challengeIndex; })
        .catch(() => { challengeIndex = []; _indexLoaded = true; return challengeIndex; });
    }

    function setMode(mode, wantedChallengeId) {
      if (mode === 'challenge') {
        ensureIndex().then((list) => {
          if (!list.length) return;
          elChallengeListWrap.hidden = false;
          renderChallengeList();
          const start = list.some((c) => c.id === wantedChallengeId) ? wantedChallengeId : list[0].id;
          selectChallenge(start);
        });
      } else {
        currentChallenge = null;
        hideChallengeUI();
      }
    }

    elHintBtn.addEventListener('click', () => {
      elPromptHint.hidden = !elPromptHint.hidden;
      elHintBtn.textContent = elPromptHint.hidden ? '💡 Need a hint?' : '💡 Hide hint';
    });

    elModeSelect.addEventListener('change', (e) => setMode(e.target.value));

    const _wanted = new URLSearchParams(location.search).get('challenge');
    if (_wanted) { elModeSelect.value = 'challenge'; setMode('challenge', _wanted); }
    else         { setMode('sandbox'); }

    return {
      update(r) {
        lastResult = r;
        updateChallengeUI(r);
      },
    };
  }

  root.ChallengeUI = { createChallengeUI };
})(typeof window !== 'undefined' ? window : global);
