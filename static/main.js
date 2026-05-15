/* ================================================================
   Pipe Organ — Main controller (Baroque tower edition)
   Four divisions split across two towers:
     Left tower  — Choir + Great (façade pipes)
     Right tower — Swell + Solo  (façade pipes)
   Keyboard console in center bay.
   ================================================================ */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Division definitions
  // ------------------------------------------------------------------
  const DIVISIONS = {
    solo: {
      label: 'Solo',
      cls: 'solo',
      keys:  ['1','2','3','4','5','6','7','8','9','0','-','='],
      notes: [
        {freq:1046.50, lbl:'C6'}, {freq:1174.66, lbl:'D6'}, {freq:1318.51, lbl:'E6'},
        {freq:1396.91, lbl:'F6'}, {freq:1567.98, lbl:'G6'}, {freq:1760.00, lbl:'A6'},
        {freq:1975.53, lbl:'B6'}, {freq:2093.00, lbl:'C7'}, {freq:2349.32, lbl:'D7'},
        {freq:2637.02, lbl:'E7'}, {freq:2793.83, lbl:'F7'}, {freq:3135.96, lbl:'G7'},
      ],
      pipeTint: 'linear-gradient(90deg,#c9a040,#e8d080,#f5e8b0,#e8d080,#c9a040)',
    },
    swell: {
      label: 'Swell',
      cls: 'swell',
      keys:  ['Q','W','E','R','T','Y','U','I','O','P'],
      notes: [
        {freq:523.25, lbl:'C5'}, {freq:587.33, lbl:'D5'}, {freq:659.25, lbl:'E5'},
        {freq:698.46, lbl:'F5'}, {freq:783.99, lbl:'G5'}, {freq:880.00, lbl:'A5'},
        {freq:987.77, lbl:'B5'}, {freq:1046.50, lbl:'C6'}, {freq:1174.66, lbl:'D6'},
        {freq:1318.51, lbl:'E6'},
      ],
      pipeTint: 'linear-gradient(90deg,#c0a860,#e0cc90,#f0e4c0,#e0cc90,#c0a860)',
    },
    great: {
      label: 'Great',
      cls: 'great',
      keys:  ['A','S','D','F','G','H','J','K','L',';',"'"],
      notes: [
        {freq:261.63, lbl:'C4'}, {freq:293.66, lbl:'D4'}, {freq:329.63, lbl:'E4'},
        {freq:349.23, lbl:'F4'}, {freq:392.00, lbl:'G4'}, {freq:440.00, lbl:'A4'},
        {freq:493.88, lbl:'B4'}, {freq:523.25, lbl:'C5'}, {freq:587.33, lbl:'D5'},
        {freq:659.25, lbl:'E5'}, {freq:698.46, lbl:'F5'},
      ],
      pipeTint: 'linear-gradient(90deg,#b8944e,#d4b87a,#e8d5a3,#f0e2b8,#e8d5a3,#d4b87a,#b8944e)',
    },
    choir: {
      label: 'Choir',
      cls: 'choir',
      keys:  ['Z','X','C','V','B','N','M',',','.','/'],
      notes: [
        {freq:130.81, lbl:'C3'}, {freq:146.83, lbl:'D3'}, {freq:164.81, lbl:'E3'},
        {freq:174.61, lbl:'F3'}, {freq:196.00, lbl:'G3'}, {freq:220.00, lbl:'A3'},
        {freq:246.94, lbl:'B3'}, {freq:261.63, lbl:'C4'}, {freq:293.66, lbl:'D4'},
        {freq:329.63, lbl:'E4'},
      ],
      pipeTint: 'linear-gradient(90deg,#8a6d40,#b89860,#d4b880,#c8a870,#a08050,#8a6d40)',
    },
  };

  /** Flat key → {freq, division, label} lookup */
  const KEY_MAP = {};
  for (const [divName, div] of Object.entries(DIVISIONS)) {
    div.keys.forEach((k, i) => {
      KEY_MAP[k] = {
        freq: div.notes[i].freq,
        division: divName,
        label: div.notes[i].lbl,
        cls: div.cls,
      };
    });
  }

  // Keyboard row order (top to bottom)
  const DIV_ORDER = ['solo', 'swell', 'great', 'choir'];

  // Tower assignments: which tower gets which divisions
  const LEFT_DIVISIONS  = ['choir', 'great'];   // deeper pipes, left tower
  const RIGHT_DIVISIONS = ['swell', 'solo'];     // brighter pipes, right tower

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const towerLeftPipes  = document.getElementById('tower-left-pipes');
  const towerRightPipes = document.getElementById('tower-right-pipes');
  const keyboardStack   = document.getElementById('keyboard-stack');
  const tremulantBtn    = document.getElementById('tremulant-btn');
  const voiceCountEl    = document.getElementById('voice-count');

  /** Map: keyChar → { pipeEl, keyEl } */
  const elements = {};

  // ------------------------------------------------------------------
  // Build playable façade pipes in a tower
  // orientation: 'left' = tallest at outer edge (index 0), decreasing inward
  //              'right' = tallest at outer edge (index n-1), increasing outward
  // ------------------------------------------------------------------
  function buildTowerDivisionPipes(container, divNames, orientation) {
    // Sort divisions: deeper/larger pipes first
    const ordered = divNames.slice().sort(function (a, b) {
      return DIVISIONS[a].notes[0].freq - DIVISIONS[b].notes[0].freq;
    });

    ordered.forEach(function (divName) {
      const div = DIVISIONS[divName];
      const n = div.keys.length;

      const rankEl = document.createElement('div');
      rankEl.className = 'tower-rank';
      rankEl.dataset.division = divName;

      // Pipe sizes: tall, monumental tower pipes (300-420px range)
      const sizeByDiv = {
        choir: { hMin: 260, hMax: 430, wBase: 32 },
        great: { hMin: 210, hMax: 360, wBase: 28 },
        swell: { hMin: 170, hMax: 310, wBase: 25 },
        solo:  { hMin: 130, hMax: 250, wBase: 22 },
      };
      const sz = sizeByDiv[divName];

      for (let i = 0; i < n; i++) {
        // Symmetric height: tallest at outer edge, decreasing toward center
        var t;
        if (orientation === 'left') {
          // Left tower: index 0 is outer edge → tallest
          t = i / (n - 1 || 1);
        } else {
          // Right tower: index n-1 is outer edge → tallest
          t = (n - 1 - i) / (n - 1 || 1);
        }
        const h = Math.round(sz.hMax - t * (sz.hMax - sz.hMin));
        const w = Math.round(sz.wBase - t * 6);

        const pipeEl = document.createElement('div');
        pipeEl.className = 'pipe pipe--' + div.cls;
        pipeEl.dataset.key = div.keys[i];
        pipeEl.dataset.freq = div.notes[i].freq;
        pipeEl.dataset.division = divName;
        pipeEl.style.height = h + 'px';
        pipeEl.style.width  = w + 'px';
        // CSS provides the metallic cylindrical gradient — no inline tint

        rankEl.appendChild(pipeEl);
        elements[div.keys[i]] = Object.assign(elements[div.keys[i]] || {}, { pipeEl: pipeEl });
      }

      container.appendChild(rankEl);
    });
  }

  // ------------------------------------------------------------------
  // Build keyboard rows (center console)
  // ------------------------------------------------------------------
  function buildKeyboardRows() {
    DIV_ORDER.forEach(function (divName) {
      const div = DIVISIONS[divName];
      const n = div.keys.length;

      const kbRow = document.createElement('div');
      kbRow.className = 'keyboard-row keyboard-row--' + div.cls;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'keyboard-label';
      labelSpan.textContent = div.label;
      kbRow.appendChild(labelSpan);

      const keysWrap = document.createElement('div');
      keysWrap.className = 'keyboard-keys';

      for (let i = 0; i < n; i++) {
        const keyChar = div.keys[i];
        const info = KEY_MAP[keyChar];

        const keyEl = document.createElement('button');
        keyEl.className = 'key key--' + div.cls;
        keyEl.dataset.key = keyChar;
        keyEl.dataset.freq = info.freq;
        keyEl.dataset.division = divName;
        keyEl.innerHTML =
          '<span class="key-note">' + info.label + '</span>' +
          '<span class="key-hint">' + keyChar + '</span>';
        keyEl.title = info.label + ' \u2014 ' + div.label + ' [' + keyChar + ']';

        keyEl.addEventListener('mousedown', function (e) { e.preventDefault(); press(keyChar); });
        keyEl.addEventListener('mouseup',   function () { release(keyChar); });
        keyEl.addEventListener('mouseleave', function () { release(keyChar); });
        keyEl.addEventListener('touchstart', function (e) { e.preventDefault(); press(keyChar); });
        keyEl.addEventListener('touchend',  function () { release(keyChar); });

        keysWrap.appendChild(keyEl);
        elements[keyChar] = Object.assign(elements[keyChar] || {}, { keyEl: keyEl });
      }

      kbRow.appendChild(keysWrap);
      keyboardStack.appendChild(kbRow);
    });
  }

  // ------------------------------------------------------------------
  // Build the entire UI
  // ------------------------------------------------------------------
  function buildUI() {
    // Façade pipes in towers (playable, symmetric arch profile)
    buildTowerDivisionPipes(towerLeftPipes, LEFT_DIVISIONS, 'left');
    buildTowerDivisionPipes(towerRightPipes, RIGHT_DIVISIONS, 'right');

    // Keyboard rows in center console
    buildKeyboardRows();
  }

  // ------------------------------------------------------------------
  // Organ engine
  // ------------------------------------------------------------------
  var organ = null;
  var initPromise = null;

  async function ensureOrgan() {
    if (organ) {
      if (organ.ctx && organ.ctx.state === 'suspended') await organ.ctx.resume();
      return;
    }
    if (!initPromise) {
      initPromise = (async function () {
        var eng = new PipeOrganEngine();
        await eng.init();
        organ = eng;
      })();
    }
    await initPromise;
  }

  // ------------------------------------------------------------------
  // Press / release
  // ------------------------------------------------------------------
  var held = new Set();

  async function press(keyChar) {
    if (held.has(keyChar)) return;
    var info = KEY_MAP[keyChar];
    if (!info) return;

    held.add(keyChar);
    await ensureOrgan();
    organ.noteOn(info.freq, info.division);
    updateVoiceCount();

    var els = elements[keyChar];
    if (els) {
      if (els.pipeEl) els.pipeEl.classList.add('active');
      if (els.keyEl)  els.keyEl.classList.add('active');
    }
  }

  function release(keyChar) {
    if (!held.has(keyChar)) return;
    held.delete(keyChar);

    var info = KEY_MAP[keyChar];
    if (!info || !organ) return;
    organ.noteOff(info.freq, info.division);
    updateVoiceCount();

    var els = elements[keyChar];
    if (els) {
      if (els.pipeEl) els.pipeEl.classList.remove('active');
      if (els.keyEl)  els.keyEl.classList.remove('active');
    }
  }

  function releaseAll() {
    held.forEach(function (k) { release(k); });
    held.clear();
  }

  function updateVoiceCount() {
    if (!voiceCountEl || !organ) return;
    var n = organ.activeVoiceCount;
    voiceCountEl.textContent = n > 0 ? 'Voices: ' + n : '';
  }

  // ------------------------------------------------------------------
  // Keyboard events
  // ------------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var ch = e.key.length === 1 ? e.key : '';
    var upper = ch.toUpperCase();
    if (ch && KEY_MAP[ch]) {
      e.preventDefault(); press(ch);
    } else if (upper !== ch && KEY_MAP[upper]) {
      e.preventDefault(); press(upper);
    }
  });

  document.addEventListener('keyup', function (e) {
    var ch = e.key.length === 1 ? e.key : '';
    var upper = ch.toUpperCase();
    if (ch && KEY_MAP[ch]) release(ch);
    else if (upper !== ch && KEY_MAP[upper]) release(upper);
  });

  window.addEventListener('blur', releaseAll);

  // ------------------------------------------------------------------
  // Tremulant button
  // ------------------------------------------------------------------
  tremulantBtn.addEventListener('click', async function () {
    await ensureOrgan();
    var active = organ.toggleTremulant();
    tremulantBtn.textContent = active ? 'Tremulant: On' : 'Tremulant: Off';
    tremulantBtn.classList.toggle('active', active);
  });

  // ------------------------------------------------------------------
  // First gesture init
  // ------------------------------------------------------------------
  document.addEventListener('click', async function () { await ensureOrgan(); }, { once: true });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  buildUI();

})();
