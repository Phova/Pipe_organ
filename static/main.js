/* ================================================================
   Pipe Organ — Main controller
   Keyboard mapping, UI rendering, event handling.
   ================================================================ */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Note mapping: 26 letters A–Z → frequencies (A=440, C3–G6)
  // ------------------------------------------------------------------
  const NOTE_MAP = {
    A: { freq: 130.81, label: 'C3' },
    B: { freq: 146.83, label: 'D3' },
    C: { freq: 164.81, label: 'E3' },
    D: { freq: 174.61, label: 'F3' },
    E: { freq: 196.00, label: 'G3' },
    F: { freq: 220.00, label: 'A3' },
    G: { freq: 246.94, label: 'B3' },
    H: { freq: 261.63, label: 'C4' },
    I: { freq: 293.66, label: 'D4' },
    J: { freq: 329.63, label: 'E4' },
    K: { freq: 349.23, label: 'F4' },
    L: { freq: 392.00, label: 'G4' },
    M: { freq: 440.00, label: 'A4' },
    N: { freq: 493.88, label: 'B4' },
    O: { freq: 523.25, label: 'C5' },
    P: { freq: 587.33, label: 'D5' },
    Q: { freq: 659.25, label: 'E5' },
    R: { freq: 698.46, label: 'F5' },
    S: { freq: 783.99, label: 'G5' },
    T: { freq: 880.00, label: 'A5' },
    U: { freq: 987.77, label: 'B5' },
    V: { freq: 1046.50, label: 'C6' },
    W: { freq: 1174.66, label: 'D6' },
    X: { freq: 1318.51, label: 'E6' },
    Y: { freq: 1396.91, label: 'F6' },
    Z: { freq: 1567.98, label: 'G6' },
  };

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ------------------------------------------------------------------
  // DOM references
  // ------------------------------------------------------------------
  const pipesContainer = document.getElementById('pipes-container');
  const noteLabelsEl = document.getElementById('note-labels');
  const keyboardEl = document.getElementById('keyboard');
  const tremulantBtn = document.getElementById('tremulant-btn');

  /** Map: letter → { pipeEl, keyEl, labelEl } */
  const elements = {};

  // ------------------------------------------------------------------
  // Build the UI: pipes, labels, keys
  // ------------------------------------------------------------------
  function buildUI() {
    const totalNotes = LETTERS.length; // 26

    for (let i = 0; i < totalNotes; i++) {
      const letter = LETTERS[i];
      const { freq, label } = NOTE_MAP[letter];

      // --- Pipe ---
      // Pipe height: lower notes → taller pipes (real organ physics)
      // C3 (~131 Hz) → tallest; G6 (~1568 Hz) → shortest
      const t = i / (totalNotes - 1); // 0 (low) → 1 (high)
      const pipeHeight = Math.round(200 - t * 140); // 200px → 60px
      const pipeWidth = Math.round(34 - t * 12);     // 34px → 22px (low notes wider)

      const pipeEl = document.createElement('div');
      pipeEl.className = 'pipe';
      pipeEl.dataset.letter = letter;
      pipeEl.dataset.freq = freq;
      pipeEl.style.height = pipeHeight + 'px';
      pipeEl.style.width = pipeWidth + 'px';
      pipesContainer.appendChild(pipeEl);

      // --- Note label ---
      const labelEl = document.createElement('div');
      labelEl.className = 'note-label';
      labelEl.dataset.letter = letter;
      labelEl.textContent = label;
      noteLabelsEl.appendChild(labelEl);

      // --- Key ---
      const keyEl = document.createElement('button');
      keyEl.className = 'key';
      keyEl.dataset.letter = letter;
      keyEl.dataset.freq = freq;
      keyEl.textContent = letter;
      // Click/tap support
      keyEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pressKey(letter);
      });
      keyEl.addEventListener('mouseup', () => releaseKey(letter));
      keyEl.addEventListener('mouseleave', () => releaseKey(letter));
      // Touch support
      keyEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        pressKey(letter);
      });
      keyEl.addEventListener('touchend', () => releaseKey(letter));
      keyboardEl.appendChild(keyEl);

      elements[letter] = { pipeEl, keyEl, labelEl };
    }
  }

  // ------------------------------------------------------------------
  // Organ engine (instantiated after first user gesture)
  // ------------------------------------------------------------------
  let organ = null;
  let organInitPromise = null; // guard against concurrent init

  async function ensureOrgan() {
    if (organ) {
      if (organ.ctx && organ.ctx.state === 'suspended') {
        await organ.ctx.resume();
      }
      return;
    }
    // Serialise initialisation — prevent duplicate AudioContexts
    if (!organInitPromise) {
      organInitPromise = (async () => {
        const engine = new PipeOrganEngine();
        await engine.init();
        organ = engine;
      })();
    }
    await organInitPromise;
  }

  // ------------------------------------------------------------------
  // Press / release
  // ------------------------------------------------------------------
  /** @type {Set<string>} */
  const heldKeys = new Set();

  async function pressKey(letter) {
    if (heldKeys.has(letter)) return;
    heldKeys.add(letter);

    await ensureOrgan();

    const info = NOTE_MAP[letter];
    if (!info) return;

    organ.noteOn(info.freq);

    // Visual feedback
    const els = elements[letter];
    if (els) {
      els.pipeEl.classList.add('active');
      els.keyEl.classList.add('active');
      els.labelEl.classList.add('highlight');
    }
  }

  function releaseKey(letter) {
    if (!heldKeys.has(letter)) return;
    heldKeys.delete(letter);

    const info = NOTE_MAP[letter];
    if (!info || !organ) return;

    organ.noteOff(info.freq);

    // Remove visual feedback
    const els = elements[letter];
    if (els) {
      els.pipeEl.classList.remove('active');
      els.keyEl.classList.remove('active');
      els.labelEl.classList.remove('highlight');
    }
  }

  // ------------------------------------------------------------------
  // Keyboard events
  // ------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    // Ignore if modifier held, or if target is an input
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const letter = e.key.toUpperCase();
    if (!NOTE_MAP[letter]) return;

    e.preventDefault();
    pressKey(letter);
  });

  document.addEventListener('keyup', (e) => {
    const letter = e.key.toUpperCase();
    if (!NOTE_MAP[letter]) return;
    releaseKey(letter);
  });

  // Handle window losing focus — release all keys
  window.addEventListener('blur', () => {
    for (const letter of heldKeys) {
      releaseKey(letter);
    }
    heldKeys.clear();
  });

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
  // First-click init for AudioContext (browser policy)
  // ------------------------------------------------------------------
  document.addEventListener('click', async () => {
    await ensureOrgan();
  }, { once: true });

  // Also init on first key press (handled in pressKey)

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  buildUI();

})();
