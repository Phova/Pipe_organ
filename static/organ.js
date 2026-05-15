/* ================================================================
   Pipe Organ Engine — Multi-division organ tone synthesis
   Four divisions: Great, Swell, Choir, Solo — each with distinct
   harmonic recipes. Global tremulant with division-aware routing.
   ================================================================ */

class PipeOrganEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;

    /** Master gain */
    this.masterGain = null;

    /** Tremulant chain */
    this.tremulantGain = null;
    this.tremulantLFO = null;
    this.tremulantLfoGain = null;
    this.tremulantActive = false;

    /** Dry path — voices bypass tremulant when off */
    this.dryGain = null;

    /** Active voices: Map<freqKey, { ... }> */
    this.activeVoices = new Map();

    /** Chiff noise buffer (shared) */
    this.noiseBuffer = null;

    /** Attack / release (seconds) */
    this.attackTime = 0.03;
    this.releaseTime = 0.12;

    /** Master volume 0–1 */
    this.volume = 0.7;
  }

  /* ------------------------------------------------------------------
   * Harmonic recipes per division
   * [multiplier, relativeGain, detuneCents]
   * ------------------------------------------------------------------ */
  _getHarmonics(division) {
    switch (division) {
      case 'choir':
        // Dulciana — gentle, few harmonics
        return [
          [1.0,  0.55,  0],
          [2.0,  0.20,  2],
        ];
      case 'great':
        // Principal chorus — full, rich
        return [
          [1.0,  0.70,  0],
          [2.0,  0.45,  2],
          [3.0,  0.30, -3],
          [4.0,  0.20,  4],
          [5.0,  0.10,  5],
          [6.0,  0.05, -5],
        ];
      case 'swell':
        // Flute — mellow, lighter upper harmonics
        return [
          [1.0,  0.60,  0],
          [2.0,  0.25,  1],
          [3.0,  0.10, -2],
        ];
      case 'solo':
        // Trompette / reed — bright, incisive
        return [
          [1.0,  0.65,  0],
          [2.0,  0.50,  2],
          [3.0,  0.35, -3],
          [4.0,  0.25,  4],
          [5.0,  0.18,  5],
          [6.0,  0.12, -5],
          [8.0,  0.06,  2],
        ];
      default:
        return [[1.0, 0.70, 0]];
    }
  }

  /* ---- Initialisation ---- */
  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);

    // Dry gain (always on)
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1.0;
    this.dryGain.connect(this.masterGain);

    // Tremulant gain (parallel wet path)
    this.tremulantGain = this.ctx.createGain();
    this.tremulantGain.gain.value = 0; // off by default
    this.tremulantGain.connect(this.masterGain);

    this._buildNoiseBuffer();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 0.04);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
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

    const oscillators = [];
    const oscGains = [];

    // Per-note local gain (attack/release envelope)
    const noteGain = this.ctx.createGain();
    noteGain.gain.setValueAtTime(0, now);
    noteGain.gain.linearRampToValueAtTime(0.85, now + this.attackTime);

    for (const [mult, gainVal, detune] of harmonics) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      osc.detune.value = detune;
      g.gain.value = gainVal;

      osc.connect(g);
      g.connect(noteGain);
      osc.start(now);

      oscillators.push(osc);
      oscGains.push(g);
    }

    // Connect note into both dry and tremulant paths
    noteGain.connect(this.dryGain);
    noteGain.connect(this.tremulantGain);

    // Chiff
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
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
      this.tremulantGain.gain.value = 0.7; // wet mix

      this.tremulantLFO = this.ctx.createOscillator();
      this.tremulantLfoGain = this.ctx.createGain();

      this.tremulantLFO.type = 'sine';
      this.tremulantLFO.frequency.value = 5.5;
      this.tremulantLfoGain.gain.value = 0.10; // ±10 %

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
}
