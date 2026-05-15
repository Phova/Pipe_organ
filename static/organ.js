/* ================================================================
   Pipe Organ Engine — Web Audio API organ tone synthesis
   Multi-harmonic additive synthesis with detune, chiff, and tremulant.
   ================================================================ */

class PipeOrganEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;

    /** Master gain for overall volume */
    this.masterGain = null;

    /** Tremulant LFO */
    this.tremulantGain = null;
    this.tremulantLFO = null;
    this.tremulantActive = false;

    /** Active voices: Map<frequency_Hz, { oscillators, gains, masterGain, noiseNode, noiseGain }> */
    this.activeVoices = new Map();

    /** Chiff noise buffer (reused) */
    this.noiseBuffer = null;

    /** Attack / release times in seconds */
    this.attackTime = 0.03;
    this.releaseTime = 0.12;

    /** Overall volume (0–1) */
    this.volume = 0.7;
  }

  /**
   * Initialise the AudioContext and master chain.
   * Must be called after a user gesture.
   */
  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);

    // Tremulant gain node (sits between voices and master)
    this.tremulantGain = this.ctx.createGain();
    this.tremulantGain.gain.value = 1.0;
    this.tremulantGain.connect(this.masterGain);

    // Build shared noise buffer for chiff
    this._buildNoiseBuffer();

    // Warm up — resume if suspended
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Build a short buffer of white noise for the chiff effect.
   */
  _buildNoiseBuffer() {
    const length = this.ctx.sampleRate * 0.04; // 40 ms
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
  }

  /**
   * Start a note at the given frequency.
   * @param {number} freq - Frequency in Hz
   */
  noteOn(freq) {
    if (!this.ctx) return;
    if (this.activeVoices.has(freq)) return; // already playing

    const now = this.ctx.currentTime;

    // --- Harmonic recipe (pipe organ stop mixture) ---
    // [multiplier, gain, detuneCents]
    const harmonics = [
      [1.0,  0.70,  0],     // Principal 8'
      [2.0,  0.45,  2],     // Octave 4'
      [3.0,  0.30, -3],     // Twelfth 2-2/3'
      [4.0,  0.20,  4],     // Fifteenth 2'
      [5.0,  0.10,  5],     // Seventeenth (mixture)
      [6.0,  0.05, -5],     // Nineteenth (mixture)
    ];

    const oscillators = [];
    const gains = [];

    // Per-note gain node (for local attack/release)
    const noteGain = this.ctx.createGain();
    noteGain.gain.setValueAtTime(0, now);
    noteGain.gain.linearRampToValueAtTime(0.85, now + this.attackTime);

    for (const [mult, gainVal, detuneCents] of harmonics) {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      osc.detune.value = detuneCents;

      oscGain.gain.value = gainVal;

      osc.connect(oscGain);
      oscGain.connect(noteGain);
      osc.start(now);

      oscillators.push(osc);
      gains.push(oscGain);
    }

    // Connect note gain into tremulant chain
    noteGain.connect(this.tremulantGain);

    // --- Chiff (breath noise burst) ---
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.noiseBuffer;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 800;

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.tremulantGain);
    noiseNode.start(now);
    noiseNode.stop(now + 0.04);

    this.activeVoices.set(freq, {
      oscillators,
      gains,
      noteGain,
      noiseNode,
      noiseGain,
    });
  }

  /**
   * Stop a note at the given frequency.
   * @param {number} freq - Frequency in Hz
   */
  noteOff(freq) {
    if (!this.ctx) return;

    const voice = this.activeVoices.get(freq);
    if (!voice) return;

    const now = this.ctx.currentTime;
    const releaseEnd = now + this.releaseTime;

    // Smooth release
    voice.noteGain.gain.setValueAtTime(voice.noteGain.gain.value, now);
    voice.noteGain.gain.linearRampToValueAtTime(0, releaseEnd);

    // Schedule cleanup
    const oscillators = voice.oscillators;
    setTimeout(() => {
      for (const osc of oscillators) {
        try { osc.stop(); } catch (_) { /* already stopped */ }
      }
    }, this.releaseTime * 1000 + 50);

    this.activeVoices.delete(freq);
  }

  /**
   * Toggle the tremulant (amplitude modulation).
   */
  toggleTremulant() {
    if (!this.ctx) return;

    this.tremulantActive = !this.tremulantActive;

    if (this.tremulantActive) {
      // Create LFO modulating tremulantGain
      this.tremulantLFO = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      this.tremulantLFO.type = 'sine';
      this.tremulantLFO.frequency.value = 5.5; // typical organ tremulant rate
      lfoGain.gain.value = 0.08; // ±8% depth

      this.tremulantLFO.connect(lfoGain);
      lfoGain.connect(this.tremulantGain.gain);
      this.tremulantLFO.start();
    } else {
      if (this.tremulantLFO) {
        try { this.tremulantLFO.stop(); } catch (_) {}
        this.tremulantLFO = null;
      }
      this.tremulantGain.gain.value = 1.0;
    }

    return this.tremulantActive;
  }

  /**
   * Set master volume.
   * @param {number} v - 0..1
   */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }
}
