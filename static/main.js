/* ================================================================
   Pipe Organ — Main controller (Baroque multi-manual edition)
   Four divisions mapped to keyboard rows, with visual feedback.
   ================================================================ */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Division definitions
  // Each division maps a keyboard row → a set of notes (low→high)
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

  /** Build flat key→{freq,division,label} lookup */
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

  // Division display order (top → bottom in the organ case)
  const DIV_ORDER = ['solo', 'swell', 'great', 'choir'];

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const pipesContainer = document.getElementById('pipes-container');
  const keyboardStack = document.getElementById('keyboard-stack');
  const tremulantBtn = document.getElementById('tremulant-btn');

  /** Map: keyChar → { pipeEl, keyEl } */
  const elements = {};

  // ------------------------------------------------------------------
  // Build the UI: pipes + keyboards per division
  // ------------------------------------------------------------------
  function buildUI() {
    DIV_ORDER.forEach((divName) => {
      const div = DIVISIONS[divName];
      const n = div.keys.length;

      // --- Pipes group ---
      const groupEl = document.createElement('div');
      groupEl.className = 'pipe-group pipe-group--' + div.cls;
      groupEl.dataset.division = divName;

      // Height range for this division (choir=tallest → solo=shortest)
      const heightMin = { choir: 130, great: 110, swell: 90, solo: 70 }[divName];
      const heightMax = { choir: 200, great: 175, swell: 150, solo: 125 }[divName];
      const widthBase  = { choir: 28, great: 26, swell: 24, solo: 22 }[divName];

      for (let i = 0; i < n; i++) {
        const t = i / (n - 1 || 1);
        const h = Math.round(heightMax - t * (heightMax - heightMin));
        const w = Math.round(widthBase - t * 6);

        const pipeEl = document.createElement('div');
        pipeEl.className = 'pipe pipe--' + div.cls;
        pipeEl.dataset.key = div.keys[i];
        pipeEl.dataset.freq = div.notes[i].freq;
        pipeEl.dataset.division = divName;
        pipeEl.style.height = h + 'px';
        pipeEl.style.width  = w + 'px';
        if (div.pipeTint) pipeEl.style.background = div.pipeTint;

        groupEl.appendChild(pipeEl);
        elements[div.keys[i]] = { ...(elements[div.keys[i]] || {}), pipeEl };
      }

      pipesContainer.appendChild(groupEl);

      // --- Keyboard row ---
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
        keyEl.textContent = keyChar;
        keyEl.title = info.label + ' (' + div.label + ')';

        // Mouse
        keyEl.addEventListener('mousedown', (e) => { e.preventDefault(); press(keyChar); });
        keyEl.addEventListener('mouseup',   () => release(keyChar));
        keyEl.addEventListener('mouseleave',() => release(keyChar));
        // Touch
        keyEl.addEventListener('touchstart',(e) => { e.preventDefault(); press(keyChar); });
        keyEl.addEventListener('touchend',  () => release(keyChar));

        keysWrap.appendChild(keyEl);
        elements[keyChar] = { ...(elements[keyChar] || {}), keyEl };
      }

      kbRow.appendChild(keysWrap);
      keyboardStack.appendChild(kbRow);
    });
  }

  // ------------------------------------------------------------------
  // Organ engine
  // ------------------------------------------------------------------
  let organ = null;
  let initPromise = null;

  async function ensureOrgan() {
    if (organ) {
      if (organ.ctx && organ.ctx.state === 'suspended') await organ.ctx.resume();
      return;
    }
    if (!initPromise) {
      initPromise = (async () => {
        const eng = new PipeOrganEngine();
        await eng.init();
        organ = eng;
      })();
    }
    await initPromise;
  }

  // ------------------------------------------------------------------
  // Press / release
  // ------------------------------------------------------------------
  const held = new Set();

  async function press(keyChar) {
    if (held.has(keyChar)) return;
    const info = KEY_MAP[keyChar];
    if (!info) return;

    held.add(keyChar);
    await ensureOrgan();
    organ.noteOn(info.freq, info.division);

    const els = elements[keyChar];
    if (els) {
      if (els.pipeEl) els.pipeEl.classList.add('active');
      if (els.keyEl)  els.keyEl.classList.add('active');
    }
  }

  function release(keyChar) {
    if (!held.has(keyChar)) return;
    held.delete(keyChar);

    const info = KEY_MAP[keyChar];
    if (!info || !organ) return;
    organ.noteOff(info.freq, info.division);

    const els = elements[keyChar];
    if (els) {
      if (els.pipeEl) els.pipeEl.classList.remove('active');
      if (els.keyEl)  els.keyEl.classList.remove('active');
    }
  }

  function releaseAll() {
    for (const k of held) release(k);
    held.clear();
  }

  // ------------------------------------------------------------------
  // Keyboard events
  // ------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const ch = e.key.length === 1 ? e.key : '';
    const upper = ch.toUpperCase();
    if (ch && KEY_MAP[ch]) {
      e.preventDefault(); press(ch);
    } else if (upper !== ch && KEY_MAP[upper]) {
      // e.g. ';' → upper=';' same char — won't double-fire
      e.preventDefault(); press(upper);
    }
  });

  document.addEventListener('keyup', (e) => {
    const ch = e.key.length === 1 ? e.key : '';
    const upper = ch.toUpperCase();
    if (ch && KEY_MAP[ch]) release(ch);
    else if (upper !== ch && KEY_MAP[upper]) release(upper);
  });

  window.addEventListener('blur', releaseAll);

  // ------------------------------------------------------------------
  // Tremulant button
  // ------------------------------------------------------------------
  tremulantBtn.addEventListener('click', async () => {
    await ensureOrgan();
    const active = organ.toggleTremulant();
    tremulantBtn.textContent = active ? 'Tremulant: On' : 'Tremulant: Off';
    tremulantBtn.classList.toggle('active', active);
  });

  // ------------------------------------------------------------------
  // First gesture init
  // ------------------------------------------------------------------
  document.addEventListener('click', async () => { await ensureOrgan(); }, { once: true });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  buildUI();

})();
