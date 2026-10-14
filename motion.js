'use strict';
/* Interaction motion built on spring.js (a port of b3ll/Motion). Every animation is
   interruptible and velocity-aware: a press can be released mid-flight, a sheet can be
   caught and thrown, a tab indicator can be redirected. Data updates stay immediate;
   motion only follows deliberate input, and never replays on background renders.
   Gesture-heavy behaviour is scoped to the vertical phone layout (the future iOS app). */
(() => {
  const { SpringAnimation, VelocityTracker, presets, project, rubberband } = window.Motion;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const vertical = matchMedia('(max-width: 760px)');
  const sheetLayout = matchMedia('(max-width: 520px)');
  const active = new Set();
  const track = spring => { active.add(spring); return spring; };
  const settle = () => active.forEach(spring => spring.running && spring.finish());
  let keyboard = false;

  document.addEventListener('keydown', () => { keyboard = true; root.dataset.input = 'keyboard'; settle(); }, true);
  document.addEventListener('pointerdown', () => { keyboard = false; root.dataset.input = 'pointer'; }, true);
  reduced.addEventListener('change', () => { if (reduced.matches) settle(); syncMode(); });
  vertical.addEventListener('change', syncMode);
  function syncMode() { root.classList.toggle('motion-springs', !reduced.matches && vertical.matches); }
  syncMode();

  const allowed = () => !reduced.matches && !keyboard && !document.hidden;
  const phone = () => allowed() && vertical.matches;
  const springs = new WeakMap();
  // One spring per element and role, so a new gesture always continues from the current state.
  function springFor(node, role, options) {
    let map = springs.get(node);
    if (!map) springs.set(node, map = {});
    return map[role] ||= track(new SpringAnimation(options));
  }
  const clamp01 = x => Math.max(0, Math.min(1, x));

  /* ---------- Entrances (Response Time, Doherty) ---------- */
  function reveal(node, delay = 0) {
    if (!node || node.hidden || !node.isConnected || !allowed()) return;
    const s = springFor(node, 'reveal', { ...presets.smooth, value: [0, 1], epsilon: 0.002,
      onUpdate: ([y, o]) => { node.style.translate = y ? `0 ${y}px` : ''; node.style.opacity = o >= 1 ? '' : clamp01(o); } });
    s.stop().updateValue([vertical.matches ? 18 : 10, 0.25]);
    if (delay) setTimeout(() => s.start([0, 1]), delay); else s.start([0, 1]);
  }

  /* ---------- Press: squish on touch, rebound with the release velocity (Fitts, Doherty) ---------- */
  const pressable = 'button:not(:disabled), a.btn-like, .quick-nav a, summary, .profile-trigger, label.goal-choice';
  function pressDepth(node) {
    const { width, height } = node.getBoundingClientRect();
    if (width > 240) return 0.975;                    // full-width buttons, rows and cards
    if (width <= 64 && height <= 64) return 0.86;     // round icon buttons
    return 0.94;
  }
  function pressSpring(node) {
    return springFor(node, 'press', { ...presets.press, value: 1, epsilon: 0.0005,
      onUpdate: s => { node.style.scale = Math.abs(s - 1) < 0.0005 ? '' : s; } });
  }
  let pressed = null;
  document.addEventListener('pointerdown', event => {
    if (!phone() || event.button > 0) return;
    const node = event.target.closest(pressable);
    if (!node || node.closest('.motion-no-press')) return;
    pressed = node;
    pressSpring(node).configure(presets.press.response, presets.press.dampingRatio).start(pressDepth(node));
  }, { passive: true });
  const release = () => {
    if (!pressed) return;
    const s = pressSpring(pressed); pressed = null;
    s.configure(presets.release.response, presets.release.dampingRatio).start(1);
  };
  ['pointerup', 'pointercancel', 'dragstart'].forEach(type => document.addEventListener(type, release, { passive: true }));
  document.addEventListener('pointerleave', release, { passive: true });

  /* ---------- Selected-tab indicator: springs between tabs and can be redirected (Jakob) ---------- */
  const tabSelector = '.quick-nav, .destination-tabs, .daily-switch, .account-tabs, .seg';
  const selected = group => group.querySelector('[aria-selected="true"],[aria-pressed="true"],[aria-current="page"],.active');
  const indicators = new WeakMap();
  const boxIn = (node, group) => {
    const a = node.getBoundingClientRect(), b = group.getBoundingClientRect();
    return [a.left - b.left, a.top - b.top, a.width, a.height];
  };
  document.addEventListener('click', event => {
    const target = event.target.closest('button,a');
    const group = target?.closest(tabSelector);
    if (!group || !allowed()) return;
    const old = selected(group);
    if (!old || old === target || target.disabled) return;
    const live = indicators.get(group);
    const from = live?.spring.running ? live.spring.value.slice() : boxIn(old, group);
    requestAnimationFrame(() => {
      const current = selected(group);
      if (!group.isConnected || current !== target || !allowed()) return;
      let state = indicators.get(group);
      if (!state) {
        const el = document.createElement('span');
        el.className = 'motion-tab-indicator'; el.setAttribute('aria-hidden', 'true');
        const spring = track(new SpringAnimation({ ...presets.snappy, value: from, epsilon: 0.3,
          onUpdate: ([x, y, w, h]) => Object.assign(el.style, { translate: `${x}px ${y}px`, width: `${w}px`, height: `${h}px` }) }));
        state = { el, spring, owner: null };
        spring.onComplete = () => { el.remove(); state.owner?.classList.remove('motion-selected'); indicators.delete(group); };
        indicators.set(group, state);
      }
      if (!state.el.isConnected) { group.append(state.el); state.spring.updateValue(from); }
      state.owner?.classList.remove('motion-selected');
      state.owner = current; current.classList.add('motion-selected');
      state.spring.start(boxIn(current, group));
    });
  }, true);

  /* ---------- Disclosures: rows settle in one after another (Serial Position) ---------- */
  document.addEventListener('click', event => {
    const detail = event.target.closest('summary')?.parentElement;
    if (detail?.tagName !== 'DETAILS' || detail.open) return;
    requestAnimationFrame(() => {
      if (!detail.isConnected || !detail.open) return;
      [...detail.children].filter(node => node.tagName !== 'SUMMARY').slice(0, 4).forEach((node, i) => reveal(node, i * 35));
    });
  }, true);
  window.addEventListener('takeover:section', event => reveal(document.getElementById(`${event.detail.group}-${event.detail.name}`)));

  /* ---------- Bottom sheet: presents with a spring, drags down to dismiss (Jakob: iOS sheets) ---------- */
  const dialog = document.getElementById('routine-dialog');
  const sheetSpring = dialog && track(new SpringAnimation({ ...presets.sheet, value: 0, epsilon: 0.3,
    onUpdate: y => {
      dialog.style.translate = Math.abs(y) < 0.3 ? '' : `0 ${y}px`;
      dialog.style.setProperty('--sheet-presence', clamp01(1 - y / Math.max(dialog.offsetHeight, 1)).toFixed(3));
    } }));
  const sheetHeight = () => dialog.getBoundingClientRect().height || innerHeight;
  function sheet(node, opening) {
    if (!opening) { reveal(node.querySelector('.routine-sheet')); return; }
    if (!allowed()) return;
    if (!sheetLayout.matches) { reveal(node); return; }
    sheetSpring.configure(presets.sheet.response, presets.sheet.dampingRatio);
    sheetSpring.resolvesUponReachingToValue = false; sheetSpring.onComplete = null;
    sheetSpring.stop().updateValue(sheetHeight()).start(0);
  }
  function closeSheet(node, velocity = 0) {
    if (!node.open || node.dataset.closing) return;
    if (!allowed()) { node.close(); return; }
    node.dataset.closing = 'true';
    const finish = () => { delete node.dataset.closing; if (node.open) node.close(); };
    if (node === dialog && sheetLayout.matches) {
      sheetSpring.resolvesUponReachingToValue = true;   // complete once off-screen, skip the tail
      sheetSpring.onComplete = () => { sheetSpring.onComplete = null; sheetSpring.resolvesUponReachingToValue = false; finish(); };
      sheetSpring.start(sheetHeight() + 24, velocity);
      return;
    }
    const s = springFor(node, 'leave', { ...presets.snappy, value: [0, 1], epsilon: 0.002,
      onUpdate: ([y, o]) => { node.style.translate = `0 ${y}px`; node.style.opacity = clamp01(o); } });
    s.onComplete = () => { node.style.translate = ''; node.style.opacity = ''; finish(); };
    s.stop().updateValue([0, 1]).start([16, 0]);
  }
  if (dialog) {
    dialog.addEventListener('close', () => {
      sheetSpring.stop(); sheetSpring.onComplete = null; sheetSpring.resolvesUponReachingToValue = false;
      sheetSpring.value = [0]; dialog.style.translate = ''; dialog.style.removeProperty('--sheet-presence');
    });
    dialog.addEventListener('cancel', event => { if (allowed()) { event.preventDefault(); closeSheet(dialog); } });

    // Drag: follows the finger 1:1 downward, rubber-bands upward, and on release either
    // springs home or is thrown away based on where the fling would come to rest.
    let drag = null;
    const catchSheet = (y) => {
      // Catching a sheet that is already moving freezes it under the finger and cancels
      // any dismissal in flight (Motion: gesture .began → animation.stop()).
      drag.active = true; drag.y0 = y - Math.max(0, sheetSpring.value[0]); sheetSpring.stop();
      sheetSpring.onComplete = null; sheetSpring.resolvesUponReachingToValue = false; delete dialog.dataset.closing;
      dialog.classList.add('is-dragging');
    };
    const begin = (y, scrollable) => {
      drag = { y0: y, active: false, scrollable, tracker: new VelocityTracker() };
      if (sheetSpring.running) { catchSheet(y); drag.tracker.add(sheetSpring.value[0]); }
    };
    const move = (y, event) => {
      if (!drag) return;
      const dy = y - drag.y0;
      if (!drag.active) {
        if (dy < 8 || (drag.scrollable && dialog.scrollTop > 0)) { if (Math.abs(dy) > 8) drag = null; return; }
        catchSheet(y);
      }
      event.preventDefault();
      const offset = y - drag.y0;
      const value = offset >= 0 ? offset : rubberband(offset, sheetHeight());
      drag.tracker.add(value);
      sheetSpring.updateValue(value);
    };
    const end = () => {
      if (!drag) return;
      // A finger that paused before lifting has no velocity, like UIPanGestureRecognizer.
      drag.tracker.add(sheetSpring.value[0]);
      const wasActive = drag.active, velocity = drag.tracker.velocity(); drag = null;
      dialog.classList.remove('is-dragging');
      if (!wasActive) return;
      const y = sheetSpring.value[0];
      if (project(y, velocity) > sheetHeight() * 0.45 && velocity > -200) closeSheet(dialog, velocity);
      else sheetSpring.start(0, velocity);
    };
    dialog.addEventListener('touchstart', event => {
      if (!phone() || !sheetLayout.matches || event.touches.length > 1) return;
      begin(event.touches[0].clientY, !event.target.closest('.sheet-handle'));
    }, { passive: true });
    dialog.addEventListener('touchmove', event => move(event.touches[0].clientY, event), { passive: false });
    dialog.addEventListener('touchend', end); dialog.addEventListener('touchcancel', end);
    // Mouse support on the grabber, for testing the same gesture in a desktop browser.
    dialog.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || !phone() || !sheetLayout.matches) return;
      const top = dialog.getBoundingClientRect().top;
      if (event.clientY - top > 36) return;
      begin(event.clientY, false);
      const onMove = e => move(e.clientY, e);
      const onUp = () => { removeEventListener('pointermove', onMove); end(); };
      addEventListener('pointermove', onMove); addEventListener('pointerup', onUp, { once: true });
    });
  }

  /* ---------- Check-ins: meter, ring and score move from the old value (Peak–End, Doherty) ---------- */
  function progress(id, date, beforeFraction, afterFraction, beforeScore, afterScore) {
    if (!allowed()) return;
    document.querySelectorAll('[data-habit-row]').forEach(row => {
      if (row.dataset.habitRow !== id || row.dataset.logDate !== date) return;
      const meter = row.querySelector('.habit-meter i');
      if (meter && beforeFraction !== afterFraction) {
        springFor(meter, 'fill', { ...presets.snappy, value: beforeFraction * 100, epsilon: 0.05,
          onUpdate: w => { meter.style.width = `${Math.max(0, w)}%`; } })
          .stop().updateValue(beforeFraction * 100).start(Math.min(afterFraction, 1) * 100);
      }
    });
    if (date !== window.TakeoverPersonal?.dateKey(new Date())) return;
    const ring = document.querySelector('.personal-ring');
    if (!ring || beforeScore === null || afterScore === null || beforeScore === afterScore) return;
    const label = ring.querySelector('b');
    springFor(ring, 'score', { ...presets.snappy, value: beforeScore * 100, epsilon: 0.05,
      onUpdate: p => { ring.style.setProperty('--completion', `${Math.max(0, p)}%`); if (label) label.textContent = `${Math.round(Math.max(0, p))}%`; } })
      .stop().updateValue(beforeScore * 100).start(afterScore * 100);
  }
  function complete(id, date, before, after) {
    document.querySelectorAll('[data-habit-row]').forEach(row => {
      if (row.dataset.habitRow !== id || row.dataset.logDate !== date) return;
      const check = row.querySelector('.habit-check');
      // A kick of velocity rather than a fixed keyframe: the pop is a real spring overshoot.
      if (check && allowed()) springFor(check, 'pop', { ...presets.bouncy, value: 1, epsilon: 0.0005,
        onUpdate: s => { check.style.scale = Math.abs(s - 1) < 0.0005 ? '' : s; } }).stop().updateValue(0.7).start(1, 4);
    });
    const today = window.TakeoverPersonal?.dateKey(new Date());
    const ring = document.querySelector('.personal-ring');
    if (date === today && ring && allowed() && before !== after)
      springFor(ring, 'pulse', { ...presets.bouncy, value: 1, epsilon: 0.0005, onUpdate: s => { ring.style.scale = s === 1 ? '' : s; } }).start(1, 1.2);
    if (after >= 1 && before < 1) reveal(document.querySelector('.personal-hero h2'));
  }

  /* ---------- Tasbih: every tap adds velocity, so fast counting builds a livelier bounce ---------- */
  document.addEventListener('click', event => {
    const button = event.target.closest('#tasbih-btn, #tasbih-33');
    if (!button || !phone()) return;
    const target = document.getElementById('tasbih-btn'), count = document.getElementById('tasbih-val');
    const s = springFor(count, 'beat', { ...presets.release, value: 1, epsilon: 0.0005, onUpdate: v => { count.style.scale = v === 1 ? '' : v; } });
    s.start(1, (s.velocity[0] || 0) + (button === target ? 2.2 : 4));
  });

  /* ---------- Toast: arrives with a little lift, nudges when its message changes ---------- */
  const toast = document.getElementById('toast');
  if (toast) {
    const s = track(new SpringAnimation({ ...presets.toast, value: [28, 0.9, 0], epsilon: 0.001,
      onUpdate: ([y, scale, o]) => { toast.style.translate = `-50% ${y}px`; toast.style.scale = scale; toast.style.opacity = clamp01(o); } }));
    let shown = false;
    new MutationObserver(records => {
      const now = toast.classList.contains('show');
      if (!root.classList.contains('motion-springs') || !allowed()) {
        // Hand control back to CSS so the message is still shown without motion.
        s.stop(); toast.style.translate = toast.style.scale = toast.style.opacity = ''; shown = now; return;
      }
      if (now && !shown) { s.configure(presets.toast.response, presets.toast.dampingRatio).updateValue([28, 0.9, 0]).start([0, 1, 1]); }
      else if (!now && shown) s.configure(presets.smooth.response, presets.smooth.dampingRatio).start([18, 0.96, 0]);
      else if (now && records.some(r => r.type === 'childList')) s.start([0, 1, 1], [0, 0.9, 0]);
      shown = now;
    }).observe(toast, { attributes: true, attributeFilter: ['class'], childList: true });
  }

  /* ---------- Session dock: rises into place when a timer starts ---------- */
  const dock = document.getElementById('session-dock');
  if (dock) {
    let visible = !dock.hidden;
    new MutationObserver(() => {
      const now = !dock.hidden;
      if (now && !visible && phone()) {
        springFor(dock, 'rise', { ...presets.bouncy, value: [40, 0], epsilon: 0.002,
          onUpdate: ([y, o]) => { dock.style.translate = y ? `0 ${y}px` : ''; dock.style.opacity = o >= 1 ? '' : clamp01(o); } })
          .stop().updateValue([40, 0]).start([0, 1]);
      }
      visible = now;
    }).observe(dock, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---------- Large title: collapses into a frosted bar on scroll, stretches on overscroll ---------- */
  const title = document.getElementById('page-title');
  if (title) {
    const bar = document.createElement('div');
    bar.className = 'compact-title'; bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<span></span>';
    document.body.append(bar);
    const label = bar.firstElementChild;
    const syncLabel = () => { label.textContent = title.textContent; };
    new MutationObserver(syncLabel).observe(title, { childList: true, characterData: true, subtree: true });
    syncLabel();
    let ticking = false;
    const update = () => {
      ticking = false;
      if (!vertical.matches || document.body.classList.contains('welcome-mode')) { bar.style.opacity = 0; title.style.scale = ''; return; }
      const y = scrollY, end = title.offsetTop + title.offsetHeight;
      const p = clamp01((y - (end - 64)) / 28);
      bar.style.opacity = p; bar.classList.toggle('is-visible', p > 0.5);
      title.style.opacity = p ? 1 - p : '';
      // iOS grows the large title while pulling past the top; scrollY goes negative there.
      title.style.scale = y < 0 && allowed() ? 1 + Math.min(-y, 140) / 900 : '';
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('takeover:view', update);
    vertical.addEventListener('change', update);
    update();
  }

  /* ---------- Launch: the first screen settles in once, in reading order (Serial Position) ---------- */
  function launch() {
    if (!phone() || document.body.classList.contains('welcome-mode')) return;
    const view = document.querySelector('.view-panel:not([hidden])');
    const parts = view ? [...view.querySelectorAll(':scope > :not([hidden]), :scope > .personal-root:not([hidden]) > *')]
      .filter(node => !node.classList.contains('personal-root') && node.offsetHeight > 0 && node.getBoundingClientRect().top < innerHeight)
      .slice(0, 5) : [];
    parts.forEach((node, i) => reveal(node, i * 55));
  }
  const welcome = document.getElementById('welcome-root');
  let launched = false;
  const tryLaunch = () => {
    if (launched || document.readyState === 'loading') return;
    const personal = document.getElementById('personal-today');
    if (document.body.dataset.view !== 'today' && document.body.dataset.view) { launched = true; return; }
    if (personal && !personal.hidden && !personal.childElementCount) return;  // wait for the routine to render
    launched = true; requestAnimationFrame(launch);
  };
  addEventListener('load', () => setTimeout(tryLaunch, 60));
  const personalToday = document.getElementById('personal-today');
  if (personalToday) new MutationObserver(tryLaunch).observe(personalToday, { childList: true });

  // One arrival on the public introduction, independent from account/sync redraws.
  let welcomed = false;
  const observer = new MutationObserver(() => {
    if (welcomed || !welcome || welcome.hidden || !welcome.childElementCount) return;
    welcomed = true; observer.disconnect();
    reveal(welcome.querySelector('.welcome-copy'));
    reveal(welcome.querySelector('.welcome-preview'), 90);
  });
  if (welcome) observer.observe(welcome, { attributes: true, childList: true });

  window.TakeoverMotion = { reveal, sheet, closeSheet, complete, progress };
})();
