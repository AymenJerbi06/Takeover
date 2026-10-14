'use strict';
/* A JavaScript port of the physics in b3ll/Motion (MIT): analytic springs configured by
   response + dampingRatio, UIScrollView decay, decay projection and rubber-banding.
   Animations are interruptible: retargeting keeps the current value and velocity, so a
   gesture can catch a moving element and throw it again. Presets mirror the Swift calls
   `SpringAnimation.configure(response:dampingRatio:)` so the iOS app can reuse them 1:1. */
(() => {
  const TAU = Math.PI * 2;

  // Same constants as Motion's SpringFunction.configure(response:dampingRatio:).
  function constants(response, dampingRatio) {
    const r = Math.max(response, 0.0001);
    const stiffness = (TAU / r) ** 2;
    const damping = 4 * Math.PI * dampingRatio / r;
    const w0 = Math.sqrt(stiffness);
    return { stiffness, damping, w0, zeta: damping / (2 * w0) };
  }

  // Advances displacement d (value − target) and velocity v by dt seconds, analytically.
  function solve(c, dt, d, v) {
    const { w0, zeta } = c;
    if (zeta < 0.999) {
      const a = zeta * w0, wd = w0 * Math.sqrt(1 - zeta * zeta);
      const env = Math.exp(-a * dt), cos = Math.cos(wd * dt), sin = Math.sin(wd * dt);
      const B = (v + a * d) / wd;
      return [env * (d * cos + B * sin), env * (v * cos - (a * B + d * wd) * sin)];
    }
    if (zeta <= 1.001) {
      const env = Math.exp(-w0 * dt), B = v + w0 * d;
      return [env * (d + B * dt), env * (v - w0 * B * dt)];
    }
    // Overdamped. (Motion uses 4·w0 under the root here; the physical term is 4·stiffness.)
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - root), r2 = -w0 * (zeta + root);
    const C2 = (v - r1 * d) / (r2 - r1), C1 = d - C2;
    const e1 = Math.exp(r1 * dt), e2 = Math.exp(r2 * dt);
    return [C1 * e1 + C2 * e2, C1 * r1 * e1 + C2 * r2 * e2];
  }

  // UIScrollView deceleration, as in Motion's DecayFunction.
  const UIScrollViewDecayConstant = 0.998;
  function project(value, velocity, decay = UIScrollViewDecayConstant) {
    return value - velocity / (Math.log(decay) * 1000);
  }

  // Motion's rubberband(): resistance past [0, contentSize - boundsSize].
  const UIScrollViewRubberBandingConstant = 0.55;
  function rubberband(value, boundsSize, contentSize = boundsSize, coefficient = UIScrollViewRubberBandingConstant) {
    let x, positive = false;
    if (value + boundsSize > contentSize) { x = Math.abs(contentSize - boundsSize - value); positive = true; }
    else if (value < 0) x = -value;
    else return value;
    const amount = (1 - 1 / ((x * coefficient / boundsSize) + 1)) * boundsSize;
    return positive ? amount + contentSize - boundsSize : -amount;
  }

  /* One shared frame loop, like Motion's AnimationDriver. */
  const live = new Set();
  let frame = 0, last = 0;
  function tick(now) {
    // Clamp long gaps (background tabs) so springs never jump.
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    // One failing animation must not stall every other spring on the page.
    [...live].forEach(animation => { try { animation.step(dt); } catch (error) { live.delete(animation); reportError?.(error); } });
    frame = live.size ? requestAnimationFrame(tick) : (last = 0, 0);
  }
  const schedule = animation => { live.add(animation); if (!frame) frame = requestAnimationFrame(tick); };

  const list = value => Array.isArray(value) ? value.slice() : [value];
  const shape = (value, template) => Array.isArray(template) ? value : value[0];

  class SpringAnimation {
    constructor({ response = 0.4, dampingRatio = 0.8, value = 0, epsilon = 0.001, onUpdate, onComplete, resolvesUponReachingToValue = false } = {}) {
      this.configure(response, dampingRatio);
      this.template = value;
      this.value = list(value); this.target = list(value); this.velocity = this.value.map(() => 0);
      this.epsilon = epsilon; this.onUpdate = onUpdate; this.onComplete = onComplete;
      this.resolvesUponReachingToValue = resolvesUponReachingToValue;
    }
    configure(response, dampingRatio) { this.response = response; this.dampingRatio = dampingRatio; this.c = constants(response, dampingRatio); return this; }
    get running() { return live.has(this); }
    // Moves immediately (e.g. under a finger) without losing the tracked velocity.
    updateValue(value, velocity) {
      this.value = list(value);
      if (velocity !== undefined) this.velocity = list(velocity);
      this.onUpdate?.(shape(this.value, this.template));
      return this;
    }
    // Retarget from wherever the value is now; optional velocity hands off from a gesture.
    start(target, velocity) {
      this.target = list(target);
      if (velocity !== undefined) this.velocity = list(velocity);
      this.sides = this.value.map((v, i) => Math.sign(v - this.target[i]));
      schedule(this);
      return this;
    }
    stop() { live.delete(this); return this; }
    // Settle on the target now (reduced motion, keyboard input).
    finish() {
      this.stop(); this.value = this.target.slice(); this.velocity = this.value.map(() => 0);
      this.onUpdate?.(shape(this.value, this.template)); this.onComplete?.();
      return this;
    }
    step(dt) {
      let resolved = true, crossed = this.resolvesUponReachingToValue;
      for (let i = 0; i < this.value.length; i++) {
        const [d, v] = solve(this.c, dt, this.value[i] - this.target[i], this.velocity[i]);
        this.value[i] = this.target[i] + d; this.velocity[i] = v;
        if (Math.abs(d) > this.epsilon || Math.abs(v) > this.epsilon * 10) resolved = false;
        if (crossed && Math.sign(d) === this.sides[i] && Math.abs(d) > this.epsilon) crossed = false;
      }
      if (resolved || crossed) {
        if (resolved) this.value = this.target.slice();
        this.stop(); this.velocity = this.value.map(() => 0);
        this.onUpdate?.(shape(this.value, this.template)); this.onComplete?.();
      } else this.onUpdate?.(shape(this.value, this.template));
    }
  }

  // Tracks pointer samples and reports release velocity in px/s (like UIPanGestureRecognizer).
  class VelocityTracker {
    constructor() { this.samples = []; }
    add(value, time = performance.now()) {
      this.samples.push([time, value]);
      while (this.samples.length > 2 && time - this.samples[0][0] > 100) this.samples.shift();
    }
    velocity() {
      const s = this.samples; if (s.length < 2) return 0;
      const [t0, v0] = s[0], [t1, v1] = s[s.length - 1];
      return t1 > t0 ? (v1 - v0) / ((t1 - t0) / 1000) : 0;
    }
  }

  /* Named springs, shared by every component and by the planned iOS app. */
  const presets = {
    press:     { response: 0.16, dampingRatio: 1.0 },   // finger down: quick, no wobble
    release:   { response: 0.32, dampingRatio: 0.55 },  // finger up: lively rebound
    snappy:    { response: 0.32, dampingRatio: 0.86 },  // state changes, selected tabs
    smooth:    { response: 0.45, dampingRatio: 1.0 },   // content entrances
    sheet:     { response: 0.42, dampingRatio: 0.92 },  // bottom sheet present/dismiss
    bouncy:    { response: 0.45, dampingRatio: 0.58 },  // completion moments
    toast:     { response: 0.5,  dampingRatio: 0.72 },
  };

  window.Motion = { SpringAnimation, VelocityTracker, presets, project, rubberband, solve, constants, UIScrollViewDecayConstant, UIScrollViewRubberBandingConstant };
})();
