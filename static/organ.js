/* ================================================================
   Pipe Organ Engine — Multi-division organ tone synthesis
   Four divisions: Great, Swell, Choir, Solo — each with distinct
   harmonic recipes. Dynamics compressor, soft clipper, per-division
   lowpass filters, polyphony-aware gain staging, micro-detune.
   ================================================================ */

class PipeOrganEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;

    /** Master gain */
    this.masterGain = null;

    /** DynamicsCompressor — prevents clipping on polyphony */
    this.compressor = null;

    /** WaveShaper — tanh soft-clipping limiter */
    this.waveshaper = null;

    /** Tremulant chain */
    this.tremulantGain = null;
    this.tremulantLFO = null;
    this.tremulantLfoGain = null;
    this.tremulantActive = false;

    /** Dry path — voices bypass tremulant when off */
    this.dryGain = null;

    /** Per-division lowpass filters (natural pipe rank bandwidth) */
    this.divisionFilters = {};

    /** Active voices: Map<freqKey, { ... }> */
    this.activeVoices = new Map();

    /** Chiff noise buffer (shared) */
    this.noiseBuffer = null;

    /** Attack / release (seconds) */
    this.attackTime = 0.025;
    this.releaseTime = 0.25;

    /** Master volume 0–1 */
    this.volume = 0.70;

    /** Random micro-detune range (cents, ± half this) */
    this.randomDetuneRange = 4;
  }

  /* ------------------------------------------------------------------
   * Harmonic recipes per division
   * [multiplier, relativeGain, detuneCents]
   * Gains scaled so single-note harmonic sum ≈ 0.55 peak
   * ------------------------------------------------------------------ */
  _getHarmonics(division) {
    switch (division) {
      case 'choir':
        // Dulciana — gentle, very few harmonics
        return [
          [1.0,  0.40,  0],
          [2.0,  0.15,  2],
        ];
      case 'great':
        // Principal chorus — full, rich (scaled down)
        return [
          [1.0,  0.30,  0],
          [2.0,  0.20,  2],
          [3.0,  0.12, -3],
          [4.0,  0.08,  4],
          [5.0,  0.04,  5],
          [6.0,  0.02, -5],
        ];
      case 'swell':
        // Flute — mellow, lighter upper harmonics
        return [
          [1.0,  0.38,  0],
          [2.0,  0.18,  1],
          [3.0,  0.06, -2],
        ];
      case 'solo':
        // Trompette / reed — bright, incisive (scaled down)
        return [
          [1.0,  0.28,  0],
          [2.0,  0.22,  2],
          [3.0,  0.14, -3],
          [4.0,  0.10,  4],
          [5.0,  0.07,  5],
          [6.0,  0.05, -5],
          [8.0,  0.03,  2],
        ];
      default:
        return [[1.0, 0.35, 0]];
    }
  }

  /* ---- Initialisation ---- */
  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // ---- Master gain ----
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;

    // ---- DynamicsCompressor (glue, prevents digital clipping) ----
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.08, this.ctx.currentTime);

    // ---- WaveShaper (tanh soft-clipper) ----
    this.waveshaper = this.ctx.createWaveShaper();
    this.waveshaper.curve = this._makeTanhCurve(1024, 1.5);
    this.waveshaper.oversample = '2x';

    // Chain: compressor → waveshaper → masterGain → destination
    this.compressor.connect(this.waveshaper);
    this.waveshaper.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // ---- Dry gain (always on, feeds into compressor) ----
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1.0;
    this.dryGain.connect(this.compressor);

    // ---- Tremulant gain (parallel wet path into compressor) ----
    this.tremulantGain = this.ctx.createGain();
    this.tremulantGain.gain.value = 0; // off by default
    this.tremulantGain.connect(this.compressor);

    // ---- Per-division lowpass filters ----
    const filterCutoffs = {
      choir: 2500,  // Dulciana — warm, rolled-off
      great: 5000,  // Principal — full but not piercing
      swell: 3800,  // Flute — mellow
      solo:  7000,  // Trompette — bright but band-limited
    };
    for (const [div, cutoff] of Object.entries(filterCutoffs)) {
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = cutoff;
      filt.Q.value = 0.5;
      this.divisionFilters[div] = filt;
    }

    this._buildNoiseBuffer();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Build tanh soft-clipping curve (lookup table) */
  _makeTanhCurve(n, k) {
    const curve = new Float32Array(n);
    const half = n / 2;
    for (let i = 0; i < n; i++) {
      const x = (i - half) / half;        // -1 … 1
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return curve;
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 0.04);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
  }

  /* ------------------------------------------------------------------
   * Polyphony-aware gain scaling
   * When > 3 voices, gently reduce per-note gain to prevent overload
   * ------------------------------------------------------------------ */
  _polyphonyScale() {
    const n = this.activeVoices.size + 1; // +1 for the new note
    if (n <= 3) return 1.0;
    return Math.pow(3 / n, 0.30);
  }

  /* ---- Note on ---- */
  /**
   * @param {number}  freq      Frequency in Hz
   * @param {string}  division  'choir'|'great'|'swell'|'solo'
   */
  noteOn(freq, division = 'great') {
    if (!this.ctx) return;
    const key = freq + '|' + division;
    if (this.activeVoices.has(key)) return;

    const now = this.ctx.currentTime;
    const harmonics = this._getHarmonics(division);
    const polyScale = this._polyphonyScale();
    const notePeak = 0.55 * polyScale;

    const oscillators = [];
    const oscGains = [];

    // ---- Per-note local gain (attack envelope) ----
    const noteGain = this.ctx.createGain();
    noteGain.gain.setValueAtTime(0, now);
    noteGain.gain.linearRampToValueAtTime(notePeak, now + this.attackTime);

    // Frequency glide — start slightly flat, settle in 15 ms
    const freqGlideStart = freq * 0.997;

    for (const [mult, gainVal, detune] of harmonics) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = 'sine';
      // Frequency glide (simulates pipe speech onset)
      osc.frequency.setValueAtTime(freqGlideStart * mult, now);
      osc.frequency.linearRampToValueAtTime(freq * mult, now + 0.015);
      // Random micro-detune (±2 cents) — reduces phase coherence on chords
      const randDetune = (Math.random() - 0.5) * this.randomDetuneRange;
      osc.detune.value = detune + randDetune;
      g.gain.value = gainVal * polyScale;

      osc.connect(g);
      g.connect(noteGain);
      osc.start(now);

      oscillators.push(osc);
      oscGains.push(g);
    }

    // ---- Route through division lowpass filter ----
    const divFilter = this.divisionFilters[division];
    if (divFilter) {
      noteGain.connect(divFilter);
      divFilter.connect(this.dryGain);
      divFilter.connect(this.tremulantGain);
    } else {
      noteGain.connect(this.dryGain);
      noteGain.connect(this.tremulantGain);
    }

    // ---- Chiff (attack breath) — division-specific intensity ----
    const chiffGains = {
      choir: 0.04,
      great: 0.07,
      swell: 0.06,
      solo:  0.12,
    };
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(chiffGains[division] || 0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    const noiseFilt = this.ctx.createBiquadFilter();
    noiseFilt.type = 'highpass';
    noiseFilt.frequency.value = 800;
    noiseNode.connect(noiseFilt);
    noiseFilt.connect(noiseGain);
    noiseGain.connect(this.dryGain);
    noiseNode.start(now);
    noiseNode.stop(now + 0.04);

    this.activeVoices.set(key, {
      oscillators,
      noteGain,
      noiseNode,
      noiseGain,
      division,
    });
  }

  /* ---- Note off ---- */
  noteOff(freq, division = 'great') {
    if (!this.ctx) return;
    const key = freq + '|' + division;
    const voice = this.activeVoices.get(key);
    if (!voice) return;

    const now = this.ctx.currentTime;
    const end = now + this.releaseTime;

    voice.noteGain.gain.setValueAtTime(voice.noteGain.gain.value, now);
    voice.noteGain.gain.linearRampToValueAtTime(0, end);

    const oscs = voice.oscillators;
    setTimeout(() => {
      for (const o of oscs) { try { o.stop(); } catch (_) {} }
    }, this.releaseTime * 1000 + 60);

    this.activeVoices.delete(key);
  }

  /* ---- Tremulant ---- */
  toggleTremulant() {
    if (!this.ctx) return false;
    this.tremulantActive = !this.tremulantActive;

    if (this.tremulantActive) {
      this.tremulantGain.gain.value = 0.7;

      this.tremulantLFO = this.ctx.createOscillator();
      this.tremulantLfoGain = this.ctx.createGain();

      this.tremulantLFO.type = 'sine';
      this.tremulantLFO.frequency.value = 5.5;
      this.tremulantLfoGain.gain.value = 0.10;

      this.tremulantLFO.connect(this.tremulantLfoGain);
      this.tremulantLfoGain.connect(this.tremulantGain.gain);
      this.tremulantLFO.start();
    } else {
      if (this.tremulantLFO) {
        try { this.tremulantLFO.stop(); } catch (_) {}
        this.tremulantLFO = null;
        this.tremulantLfoGain = null;
      }
      this.tremulantGain.gain.value = 0;
    }

    return this.tremulantActive;
  }

  /* ---- Master volume ---- */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  /** Number of currently active voices (for external display) */
  get activeVoiceCount() {
    return this.activeVoices.size;
  }
}
