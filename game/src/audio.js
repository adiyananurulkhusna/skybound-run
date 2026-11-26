// All sound is synthesised with WebAudio: an engine hum that follows the
// throttle, wind that rises with speed, a chime for each ring, a stall
// warning and a soft thud on touchdown. Nothing loads from the network.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
    this.wind = null;
    this.lastWarning = 0;
  }

  /** Browsers only allow audio after a gesture; the shell calls this on input. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    const engineOsc = this.ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    const engineGain = this.ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(this.ctx.destination);
    engineOsc.start();
    // A detuned square underneath gives the engine its putter, and a
    // band-passed noise layer adds propeller wash that grows with throttle.
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'square';
    subOsc.frequency.value = 28;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0;
    subOsc.connect(subGain).connect(this.ctx.destination);
    subOsc.start();

    const noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const propSrc = this.ctx.createBufferSource();
    propSrc.buffer = noise;
    propSrc.loop = true;
    const propFilter = this.ctx.createBiquadFilter();
    propFilter.type = 'bandpass';
    propFilter.frequency.value = 340;
    propFilter.Q.value = 0.8;
    const propGain = this.ctx.createGain();
    propGain.gain.value = 0;
    propSrc.connect(propFilter).connect(propGain).connect(this.ctx.destination);
    propSrc.start();
    this.engine = { osc: engineOsc, gain: engineGain, filter: engineFilter, sub: subOsc, subGain, propGain, propFilter };

    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = noise;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 900;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(this.ctx.destination);
    windSrc.start();
    this.wind = { gain: windGain, filter: windFilter };
  }

  /** Follow the flight each frame: engine by throttle, wind by speed. */
  update(plane, playing) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const on = playing && !this.muted;
    this.engine.osc.frequency.setTargetAtTime(48 + plane.throttle * 95 + plane.speed * 0.35, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(300 + plane.throttle * 700, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(on ? 0.028 + plane.throttle * 0.05 : 0, t, 0.1);
    this.engine.sub.frequency.setTargetAtTime(24 + plane.throttle * 47, t, 0.08);
    this.engine.subGain.gain.setTargetAtTime(on ? 0.012 + plane.throttle * 0.02 : 0, t, 0.1);
    this.engine.propFilter.frequency.setTargetAtTime(240 + plane.throttle * 520, t, 0.1);
    this.engine.propGain.gain.setTargetAtTime(on ? plane.throttle * 0.035 : 0, t, 0.1);
    this.wind.filter.frequency.setTargetAtTime(500 + plane.speed * 9, t, 0.15);
    this.wind.gain.gain.setTargetAtTime(on ? Math.min(0.09, plane.speed / 900) : 0, t, 0.15);
    if (on && plane.stalled && t - this.lastWarning > 0.9) {
      this.lastWarning = t;
      this.tone(880, 0.1, 'square', 0.045);
      this.tone(659, 0.12, 'square', 0.045, 0.11);
    }
  }

  tone(freq, seconds, type = 'sine', gain = 0.08, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  ring() {
    this.tone(660, 0.18, 'sine', 0.09);
    this.tone(990, 0.24, 'sine', 0.07, 0.06);
    this.tone(1320, 0.3, 'triangle', 0.05, 0.12);
    this.tone(1980, 0.36, 'sine', 0.025, 0.18);
  }

  touchdown() {
    this.tone(72, 0.25, 'sine', 0.16);
    this.tone(110, 0.12, 'triangle', 0.06, 0.02);
  }

  crash() {
    this.tone(58, 0.5, 'sawtooth', 0.12);
    this.tone(41, 0.7, 'square', 0.08, 0.05);
  }

  click() {
    this.tone(520, 0.06, 'triangle', 0.05);
  }
}
