'use strict';

const icon = window.TakeoverIcons.svg;

/* ---------- Goals ---------- */
const { GOALS, FOCUS, PRAYERS, kcalOf, dayParts, dayScore, CHALLENGE_START_DATE, normalizeChallenge } = window.TakeoverMetrics;
const STORE_KEY = 'takeover.v1';

const DEFAULT_PLAN = `06:00-06:30 | Fajr · Quran (3 pages) · Tasbih | quran
06:30-07:30 | Morning walk (~7k steps) |
07:30-08:00 | Breakfast & get ready |
08:00-10:00 | Study block 1 — nearest midterm | study
10:00-10:20 | Walk break |
10:20-12:20 | Classes / lectures |
12:30-13:15 | Dhuhr + lunch | pray
13:15-15:15 | Study block 2 — past papers & practice | study
15:15-15:45 | Asr + walk | pray
16:00-17:30 | Gym (Mon/Wed/Fri) or long walk | gym
17:30-19:30 | Dropshipping coursework (pray Maghrib on time) | drop
19:30-20:15 | Dinner + call parents | call
20:15-20:30 | Isha | pray
20:30-21:30 | Full-stack development | fullstack
21:30-22:30 | Video basics | video
22:30-23:00 | Evening walk, log steps/food, wind down |
23:00-06:00 | Sleep (7h) |`;

const DEFAULT_DEBTS = [
  { name: 'Friend 1', amount: 1300 },
  { name: 'Friend 2', amount: 367 },
  { name: 'Friend 3', amount: 300 },
  { name: 'Friend 4', amount: 500 },
  { name: 'Friend 5', amount: 700 },
];

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
// Match the calendar date shown in the header, including the hours after midnight.
const todayKey = () => keyOf(new Date());
const weekStart = k => { const d = parseKey(k); return addDays(k, -((d.getDay() + 6) % 7)); }; // Monday
const fmtMin = m => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h ${pad(m % 60)}m` : `${m}m`; };
const fmtClock = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const num = n => Number(n).toLocaleString();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- State ---------- */
function freshState() {
  return {
    version: 1,
    updatedAt: 0, // last local change (ms); cloud sync uses it to pick the newer copy
    syncUser: null, // Supabase user this device last synced with
    experience: 'personal',
    startDate: todayKey(),
    challengeReset: CHALLENGE_START_DATE,
    startWeight: null,
    currency: '',
    plan: '',
    days: {},
    weights: [],
    running: null,
    exams: [],
    events: [],
    debts: [],
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return restoreState(JSON.parse(raw));
  } catch (e) { /* fall through */ }
  return freshState();
}
function restoreState(value) {
  const legacy = !value.experience && !value.personalPlan && (value.version || value.days || value.plan);
  return { ...freshState(), ...(legacy ? { experience: 'legacy', plan: DEFAULT_PLAN } : {}),
    ...(legacy || value.experience === 'legacy' ? normalizeChallenge(value) : value) };
}
let state = load();
function save(touch = true) {
  if (touch) state.updatedAt = Math.max(Date.now(), (state.updatedAt || 0) + 1);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage is blocked in this browser'); }
  if (touch) window.TakeoverSync?.schedule();
  if (touch) window.dispatchEvent(new CustomEvent('takeover:state-saved'));
}
function day(k = todayKey()) {
  if (!state.days[k]) {
    state.days[k] = { prayers: [false, false, false, false, false], quran: 0, tasbih: 0, food: [], steps: 0, gym: false, mins: {}, call: false, sleep: null, screen: null };
  }
  return state.days[k];
}

/* ---------- Scoring ---------- */
function runningMins(id, k) {
  const r = state.running;
  return r && r.id === id && r.day === k ? (Date.now() - r.start) / 60000 : 0;
}
function focusMins(d, id, k) { return (d.mins[id] || 0) + runningMins(id, k); }
function parts(k) {
  if (state.personalPlan) return window.TakeoverPersonal.dayParts(state, k);
  if (state.experience === 'personal') return [];
  const d = state.days[k];
  return d ? dayParts(d, id => focusMins(d, id, k)) : null;
}
function score(k) {
  if (state.personalPlan) return window.TakeoverPersonal.dayScore(state, k) ?? 0;
  if (state.experience === 'personal') return 0;
  const d = state.days[k];
  return dayScore(d, d && (id => focusMins(d, id, k)));
}
function streak() {
  if (state.personalPlan) return window.TakeoverPersonal.streak(state);
  let k = todayKey(), n = 0;
  if (score(k) < 0.8) k = addDays(k, -1); // today still in progress doesn't break it
  while (k >= state.startDate && score(k) >= 0.8) { n++; k = addDays(k, -1); }
  return n;
}
function gymThisWeek() {
  const ws = weekStart(todayKey());
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i);
    if (k >= state.startDate && state.days[k]?.gym) n++;
  }
  return n;
}

/* ---------- Plan ---------- */
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function parsePlan(text) {
  return text.split('\n').map(line => {
    const m = line.match(/^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*\|\s*([^|]+?)\s*(?:\|\s*(\w*)\s*)?$/);
    if (!m) return null;
    let s = toMin(m[1]), e = toMin(m[2]);
    if (e <= s) e += 1440;
    return { from: m[1], to: m[2], s, e, title: m[3], link: (m[4] || '').toLowerCase() };
  }).filter(Boolean).sort((a, b) => a.s - b.s);
}
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
function blockAt(plan, t) {
  return plan.find(b => (t >= b.s && t < b.e) || (b.e > 1440 && t + 1440 < b.e));
}
function linkDone(link, d, k) {
  const f = FOCUS.find(x => x.id === link);
  if (f) return focusMins(d, f.id, k) >= f.goal;
  if (link === 'gym') return d.gym;
  if (link === 'quran') return d.quran >= GOALS.quran;
  if (link === 'call') return d.call;
  return false;
}

/* ---------- Timers ---------- */
function stopTimer() {
  const r = state.running;
  if (!r) return;
  const d = day(r.day);
  d.mins[r.id] = (d.mins[r.id] || 0) + (Date.now() - r.start) / 60000;
  state.running = null;
}
function startTimer(id) {
  const same = state.running?.id === id;
  stopTimer();
  if (!same) state.running = { id, start: Date.now(), day: todayKey() };
  save(); render();
  toast(same ? 'Session saved' : 'Focus session started');
}

/* ---------- Rendering ---------- */
const $ = id => document.getElementById(id);
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const pct = x => `${Math.round(x * 100)}%`;
const level = s => (s >= 0.8 ? 'l3' : s >= 0.5 ? 'l2' : s > 0 ? 'l1' : 'l0');

function renderHeader() {
  day();
  const now = new Date();
  $('today-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  $('clock').textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const n = diffDays(state.startDate, todayKey()) + 1;
  $('challenge-day').textContent = state.experience === 'personal' ? `Day ${Math.max(1, n)}` : n < 1 ? `–${1 - n}` : `${Math.min(n, GOALS.days)}/${GOALS.days}`;
  document.querySelector('.page-heading .eyebrow').textContent = state.experience === 'personal' ? 'Your daily rhythm' : '40-day reset';
  $('challenge-day').nextElementSibling.textContent = state.experience === 'personal' ? 'your journey' : 'challenge';
  $('streak').textContent = streak();
  $('today-score').textContent = pct(score(todayKey()));
  const goals = parts(todayKey()) || [];
  $('daily-completion').textContent = `${goals.filter(([, value]) => value >= 1).length} of ${goals.length} goals complete`;
}

function renderNow() {
  const k = todayKey(), d = day(k);
  const plan = parsePlan(state.plan);
  const t = nowMin();
  const cur = blockAt(plan, t);
  const next = plan.find(b => b.s > t) || plan[0];
  const r = state.running;
  const runF = r && FOCUS.find(f => f.id === r.id);

  let left = '';
  if (cur) {
    const remain = (cur.e - t + 1440) % 1440;
    left = `<div class="label">Now · ${esc(cur.from)}–${esc(cur.to)}</div>
      <div class="title">${esc(cur.title)}</div>
      <div class="meta">${fmtMin(remain)} remaining</div>`;
  } else {
    left = `<div class="label">Right now</div><div class="title">Open time</div>
      <div class="meta">${next ? `Next ${esc(next.from)} · ${esc(next.title)}` : 'Edit plan to add a block'}</div>`;
  }
  const curFocus = cur && FOCUS.find(f => f.id === cur.link);
  let actions = '';
  if (curFocus && r?.id !== curFocus.id) actions += `<button class="primary" data-start="${curFocus.id}" aria-label="Start ${esc(curFocus.label)} timer">${icon('play')} Start</button>`;
  if (cur?.link === 'quran' && d.quran < GOALS.quran) actions += `<button data-quick="quran">${icon('plus')} Quran</button>`;
  if (cur?.link === 'call' && !d.call) actions += `<button data-quick="call">${icon('phone')} Call</button>`;
  if (cur?.link === 'gym' && !d.gym) actions += `<button data-quick="gym">${icon('check')} Gym</button>`;
  if (cur?.link === 'pray') {
    const i = d.prayers.findIndex(p => !p);
    if (i >= 0) actions += `<button data-quick="pray" data-i="${i}">${icon('check')} ${PRAYERS[i]}</button>`;
  }

  const right = runF
    ? `<div class="label">Focus timer</div><div class="title">${esc(runF.label)}</div>
       <div class="running" id="run-clock">${fmtClock((Date.now() - r.start) / 1000)}</div>
       <div class="actions"><button data-start="${runF.id}" aria-label="Stop ${esc(runF.label)} timer">${icon('stop')} Stop</button></div>`
    : `<span class="now-focus-icon">${icon('focus')}</span><div class="label">Focus today</div><div class="title">${fmtMin(FOCUS.reduce((sum, f) => sum + focusMins(d, f.id, k), 0))}</div><a class="btn-like focus-link" href="#view-focus" data-view-target="focus">Sessions ${icon('arrowRight')}</a>`;

  const remainingItems = (parts(k) || []).filter(([, v]) => v < 1).map(([n]) => n);
  $('now-card').innerHTML = `<div class="now-grid"><div>${left}${actions ? `<div class="actions">${actions}</div>` : ''}</div><div class="${runF ? 'now-active-session' : 'now-session-overview'}">${right}</div></div>
    <div class="now-footer"><span>${next && next !== cur ? `<span class="muted">Up next</span> <b>${esc(next.from)}</b> ${esc(next.title)}` : 'Your day, at your pace.'}</span><button type="button" class="link" data-open-checkin>${remainingItems.length ? 'Check in' : 'All done'} ${icon(remainingItems.length ? 'arrowRight' : 'check')}</button></div>`;
}

function renderDeen() {
  const d = day();
  $('prayers').innerHTML = PRAYERS.map((p, i) => `<button class="chip ${d.prayers[i] ? 'on' : ''}" data-prayer="${i}" aria-pressed="${d.prayers[i]}">${d.prayers[i] ? icon('check') : ''}${p}</button>`).join('');
  $('quran-val').textContent = d.quran;
  const call = $('call-btn');
  call.innerHTML = `${icon(d.call ? 'check' : 'phone')} ${d.call ? 'Called' : 'Call'}`;
  call.setAttribute('aria-pressed', String(d.call));
  call.classList.toggle('on', d.call);
  $('tasbih-val').textContent = d.tasbih;
  $('tasbih-label').textContent = `${d.tasbih} / ${GOALS.tasbih}`;
  $('prayers-count').textContent = `${d.prayers.filter(Boolean).length} / 5`;
  $('tasbih-btn').classList.toggle('done', d.tasbih >= GOALS.tasbih);
}

function renderFocus() {
  const k = todayKey(), d = day(k);
  const list = $('focus-list');
  const openEditors = new Set([...list.querySelectorAll('details[open]')].map(el => el.dataset.focusEditor));
  const active = list.contains(document.activeElement) ? document.activeElement : null;
  const activeSelector = active?.dataset.start ? `[data-start="${active.dataset.start}"]` : active?.dataset.adj ? `[data-adj="${active.dataset.adj}"][data-v="${active.dataset.v}"]` : null;
  renderFocusSummary();
  $('focus-status-text').textContent = state.running ? 'Session in progress' : 'Ready when you are';
  $('focus-status-text').parentElement.classList.toggle('is-running', !!state.running);
  const symbols = { study: 'exams', drop: 'wallet', fullstack: 'code', video: 'video' };
  const tones = { study: 'violet', drop: 'mint', fullstack: 'blue', video: 'coral' };
  list.innerHTML = FOCUS.map((f, i) => {
    const m = focusMins(d, f.id, k);
    const on = state.running?.id === f.id;
    return `<article class="focus ${on ? 'running' : ''}" data-tone="${tones[f.id]}" aria-label="${esc(f.label)}">
      <div class="focus-card-top"><span class="focus-symbol">${icon(symbols[f.id])}</span><span class="focus-number">${on ? 'In session' : String(i + 1).padStart(2, '0')}</span></div>
      <div class="name">${esc(f.label)}</div>
      <div class="focus-measure"><b data-fminutes="${f.id}">${fmtMin(m)}</b><span>of ${fmtMin(f.goal)}</span></div>
      <div class="bar" aria-hidden="true"><i data-fbar="${f.id}" style="width:${pct(Math.min(m / f.goal, 1))}"></i></div>
      <div class="focus-card-bottom"><details class="focus-editor" data-focus-editor="${f.id}" ${openEditors.has(f.id) ? 'open' : ''}><summary>${icon('edit')} Log time</summary><div class="ctrls"><button class="adjust" data-adj="${f.id}" data-v="-15" aria-label="Subtract 15 minutes from ${esc(f.label)}">${icon('minus')}15 min</button><button class="adjust" data-adj="${f.id}" data-v="15" aria-label="Add 15 minutes to ${esc(f.label)}">${icon('plus')}15 min</button></div></details><button class="session-start ${on ? 'is-running' : ''}" data-start="${f.id}" aria-label="${on ? 'Stop and save' : 'Start'} ${esc(f.label)} session" aria-pressed="${on}">${icon(on ? 'stop' : 'play')}<span>${on ? 'Finish' : 'Start'}</span></button></div>
    </article>`;
  }).join('');
  if (activeSelector) list.querySelector(activeSelector)?.focus({ preventScroll: true });
}

function renderFocusSummary() {
  const k = todayKey(), d = day(k);
  const total = FOCUS.reduce((sum, f) => sum + focusMins(d, f.id, k), 0);
  $('focus-summary').textContent = `${fmtMin(total)} focused today · ${fmtMin(FOCUS.reduce((sum, f) => sum + f.goal, 0))} daily goal`;
}

function renderSessionDock() {
  const r = state.running;
  const session = r && FOCUS.find(f => f.id === r.id);
  const dock = $('session-dock');
  dock.hidden = !session;
  document.body.classList.toggle('has-session', !!session);
  if (!session) { dock.innerHTML = ''; return; }
  dock.innerHTML = `<a href="#view-focus" data-view-target="focus" class="session-return"><span class="session-indicator">${icon('focus')}</span><span><small>Focusing</small><b>${esc(session.label)}</b></span></a><span class="session-clock" id="session-clock">${fmtClock((Date.now() - r.start) / 1000)}</span><button type="button" data-start="${session.id}" aria-label="Finish and save ${esc(session.label)} session">${icon('stop')}<span>Finish</span></button>`;
}

function renderBody() {
  const k = todayKey(), d = day(k);
  const kcal = kcalOf(d);
  $('kcal-total').textContent = `${num(kcal)} · ${kcal <= GOALS.kcal ? `${num(GOALS.kcal - kcal)} left` : `${num(kcal - GOALS.kcal)} over`}`;
  const kb = $('kcal-bar'); kb.style.width = pct(Math.min(kcal / GOALS.kcal, 1)); kb.classList.toggle('over', kcal > GOALS.kcal);
  $('food-list').innerHTML = d.food.map((f, i) => `<li><span>${esc(f.name || 'Food')}</span><span>${num(f.kcal)} <button class="x" data-delfood="${i}" aria-label="Remove ${esc(f.name || 'food')}">${icon('close')}</button></span></li>`).join('');

  $('steps-total').textContent = `${num(d.steps)} · ${pct(Math.min(d.steps / GOALS.steps, 1))}`;
  $('steps-bar').style.width = pct(Math.min(d.steps / GOALS.steps, 1));

  const ws = weekStart(k);
  $('gym-dots').innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
    const dk = addDays(ws, i);
    return `<span class="${dk >= state.startDate && state.days[dk]?.gym ? 'on' : ''} ${dk === k ? 'today' : ''}">${l}</span>`;
  }).join('');
  const g = gymThisWeek();
  $('gym-week').textContent = `${g}/${GOALS.gymPerWeek} this week`;
  const gb = $('gym-btn'); gb.innerHTML = `${icon(d.gym ? 'check' : 'plus')} ${d.gym ? 'Done' : 'Log session'}`; gb.setAttribute('aria-label', d.gym ? 'Gym session complete' : 'Log gym session'); gb.setAttribute('aria-pressed', String(d.gym)); gb.classList.toggle('on', d.gym);

  setIfIdle($('sleep-form').sleep, d.sleep ?? '');
  setIfIdle($('screen-form').screen, d.screen ?? '');
  setIfIdle($('steps-form').steps, d.steps || '');
}
function setIfIdle(input, v) { if (document.activeElement !== input) input.value = v; }

const C = window.TakeoverCharts;
const shortDate = k => parseKey(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const compact = n => (n >= 1000 ? `${r1(n / 1000)}K` : String(Math.round(n)));
const r1 = n => Math.round(n * 10) / 10;
const avg = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function areas(k) {
  const d = state.days[k];
  if (!d) return { deen: 0, body: 0, work: 0 };
  const kcal = kcalOf(d);
  const focus = FOCUS.reduce((s, f) => s + focusMins(d, f.id, k), 0);
  return {
    deen: avg([d.prayers.filter(Boolean).length / 5, Math.min(d.quran / GOALS.quran, 1), Math.min(d.tasbih / GOALS.tasbih, 1), d.call ? 1 : 0]),
    body: avg([Math.min(d.steps / GOALS.steps, 1), kcal > 0 && kcal <= GOALS.kcal ? 1 : 0, d.sleep != null ? Math.min(d.sleep / GOALS.sleep, 1) : 0]),
    work: Math.min(focus / FOCUS.reduce((s, f) => s + f.goal, 0), 1),
  };
}

function renderGlance() {
  const k = todayKey(), d = day(k), a = areas(k);
  const list = [
    { label: 'Deen', value: a.deen, cls: 's1', sub: `${d.prayers.filter(Boolean).length}/5 prayers · ${d.quran}/${GOALS.quran} pages · ${d.tasbih} tasbih${d.call ? ' · called' : ''}` },
    { label: 'Body', value: a.body, cls: 's2', sub: `${compact(d.steps)} steps · ${num(kcalOf(d))} kcal · ${d.sleep ?? '–'}h sleep` },
    { label: 'Work', value: a.work, cls: 's3', sub: `${fmtMin(FOCUS.reduce((s, f) => s + focusMins(d, f.id, k), 0))} of ${fmtMin(FOCUS.reduce((s, f) => s + f.goal, 0))} focus` },
  ];
  $('rings').innerHTML = C.rings(list);
  $('hero-score').textContent = pct(score(k));
  $('ring-legend').innerHTML = list.map(g => `<li><i class="sw ${g.cls}"></i><div><b>${g.label} <span class="val">${pct(g.value)}</span></b><span>${esc(g.sub)}</span></div></li>`).join('');

  const kcal = kcalOf(d), focus = FOCUS.reduce((s, f) => s + focusMins(d, f.id, k), 0), focusGoal = FOCUS.reduce((s, f) => s + f.goal, 0);
  const over = kcal > GOALS.kcal;
  const tiles = [
    { label: 'Prayers', v: d.prayers.filter(Boolean).length / 5, c: `${d.prayers.filter(Boolean).length}/5`, sub: 'today', cls: 's1' },
    { label: 'Quran', v: d.quran / GOALS.quran, c: `${d.quran}/${GOALS.quran}`, sub: 'pages', cls: 's1' },
    { label: 'Tasbih', v: d.tasbih / GOALS.tasbih, c: String(d.tasbih), sub: `of ${GOALS.tasbih}`, cls: 's1' },
    { label: 'Steps', v: d.steps / GOALS.steps, c: compact(d.steps), sub: `of ${compact(GOALS.steps)}`, cls: 's2' },
    { label: 'Calories', v: kcal / GOALS.kcal, c: num(kcal), sub: over ? `▲ ${num(kcal - GOALS.kcal)} over` : `${num(GOALS.kcal - kcal)} left`, cls: over ? 'crit' : 's2', warn: over },
    { label: 'Sleep', v: (d.sleep || 0) / GOALS.sleep, c: d.sleep != null ? `${d.sleep}h` : '–', sub: `of ${GOALS.sleep}h`, cls: 's2' },
    { label: 'Focus', v: focus / focusGoal, c: `${r1(focus / 60)}h`, sub: `of ${focusGoal / 60}h`, cls: 's3' },
    { label: 'Gym', v: gymThisWeek() / GOALS.gymPerWeek, c: `${gymThisWeek()}/${GOALS.gymPerWeek}`, sub: 'this week', cls: 's3' },
  ];
  $('gauges').innerHTML = tiles.map(t => {
    const done = !t.warn && t.v >= 1;
    return `<div class="gauge-tile" data-tip="${esc(`${t.label}: ${t.c} ${t.sub}`)}">${C.gauge({ value: t.v, center: t.c, cls: t.cls })}
      <div class="g-label">${done ? `<span class="ok-mark">${icon('check')}</span> ` : ''}${t.label}</div><div class="g-sub ${t.warn ? 'warn' : ''}">${esc(t.sub)}</div></div>`;
  }).join('');
}

let trendRange = (() => { try { return localStorage.getItem('takeover.range') || '14'; } catch { return '14'; } })();
let trendPeriod = (() => {
  try {
    const value = localStorage.getItem('takeover.period');
    return ['day', 'week', 'month'].includes(value) ? value : 'day';
  } catch { return 'day'; }
})();
/* ---------- Today: the 40-day goals in the shared hero / week / habit-list layout ---------- */
// Same markup as the personal routine dashboard, so both get one design and one motion system.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// One colour per category, repeated for every goal in it: Deen indigo, Work orange, Body teal.
const FOCUS_ICONS = { study: ['exams', 'coral'], drop: ['wallet', 'coral'], fullstack: ['code', 'coral'], video: ['video', 'coral'] };
function todayGoals(k = todayKey()) {
  const d = day(k), kcal = kcalOf(d), prayed = d.prayers.filter(Boolean).length, nextPrayer = d.prayers.findIndex(p => !p);
  const r = state.running, gymWeek = gymThisWeek();
  return [
    { group: 'Deen', id: 'prayers', title: 'Prayers', icon: 'spirit', tone: 'violet', frac: prayed / 5, done: prayed === 5,
      text: `${prayed} / 5 prayed`, act: nextPrayer >= 0 ? `data-quick="pray" data-i="${nextPrayer}"` : 'data-open-checkin',
      label: nextPrayer >= 0 ? `Mark ${PRAYERS[nextPrayer]} prayed` : 'Edit prayers', next: nextPrayer >= 0 && `Pray ${PRAYERS[nextPrayer]}` },
    { group: 'Deen', id: 'quran', title: 'Quran', icon: 'book', tone: 'violet', frac: Math.min(d.quran / GOALS.quran, 1), done: d.quran >= GOALS.quran,
      text: `${d.quran} / ${GOALS.quran} pages`, act: 'data-quick="quran"', label: 'Add one Quran page', next: 'Read a page of Quran' },
    { group: 'Deen', id: 'tasbih', title: 'Tasbih', icon: 'spark', tone: 'violet', frac: Math.min(d.tasbih / GOALS.tasbih, 1), done: d.tasbih >= GOALS.tasbih,
      text: `${d.tasbih} / ${GOALS.tasbih}`, act: 'data-quick="tasbih33"', label: 'Add 33 tasbih', next: 'Tasbih' },
    { group: 'Deen', id: 'call', title: 'Call parents', icon: 'phone', tone: 'violet', frac: d.call ? 1 : 0, done: d.call,
      text: d.call ? 'Called today' : 'Not yet', act: 'data-quick="call-toggle"', label: d.call ? 'Undo call parents' : 'Mark parents called', pressed: d.call, next: 'Call your parents' },
    ...FOCUS.map(f => {
      const m = focusMins(d, f.id, k), on = r?.id === f.id;
      return { group: 'Work', id: f.id, title: f.label, icon: FOCUS_ICONS[f.id][0], tone: FOCUS_ICONS[f.id][1], frac: Math.min(m / f.goal, 1), done: m >= f.goal,
        text: `${fmtMin(m)} / ${fmtMin(f.goal)}${on ? ' · in session' : ''}`, act: `data-start="${f.id}"`, label: `${on ? 'Stop' : 'Start'} ${f.label} session`,
        glyph: on ? 'stop' : null, running: on, next: `Start ${f.label}` };
    }),
    { group: 'Body', id: 'steps', title: 'Steps', icon: 'steps', tone: 'mint', frac: Math.min(d.steps / GOALS.steps, 1), done: d.steps >= GOALS.steps,
      text: `${num(d.steps)} / ${num(GOALS.steps)}`, act: 'data-open-checkin data-focus-field="#steps-form input"', label: 'Log steps', next: 'Log your steps' },
    { group: 'Body', id: 'kcal', title: 'Calories', icon: 'food', tone: 'mint', frac: Math.min(kcal / GOALS.kcal, 1), done: kcal > 0 && kcal <= GOALS.kcal, over: kcal > GOALS.kcal,
      text: kcal > GOALS.kcal ? `${num(kcal)} kcal · ${num(kcal - GOALS.kcal)} over` : `${num(kcal)} / ${num(GOALS.kcal)} kcal max`,
      act: 'data-open-checkin data-focus-field="#food-form input"', label: 'Add food', next: 'Log a meal' },
    { group: 'Body', id: 'gym', title: 'Gym', icon: 'body', tone: 'mint', frac: Math.min(gymWeek / GOALS.gymPerWeek, 1), done: d.gym,
      text: `${gymWeek} / ${GOALS.gymPerWeek} this week${d.gym ? ' · today' : ''}`, act: 'data-quick="gym-toggle"', label: d.gym ? 'Undo gym today' : 'Log gym today', pressed: d.gym, weekly: true },
    { group: 'Body', id: 'sleep', title: 'Sleep', icon: 'sleep', tone: 'mint', frac: d.sleep != null ? Math.min(d.sleep / GOALS.sleep, 1) : 0, done: d.sleep != null && d.sleep >= GOALS.sleep,
      text: d.sleep != null ? `${d.sleep} / ${GOALS.sleep} h` : 'Not logged', act: 'data-open-checkin data-focus-field="#sleep-form input"', label: 'Log sleep', next: 'Log last night’s sleep' },
  ];
}
let todayFractions = null, lastPress = 0;
document.addEventListener('pointerdown', () => { lastPress = performance.now(); }, true);
function renderToday() {
  const root = $('legacy-today');
  if (!root || state.experience === 'personal') return;
  const k = todayKey(), goals = todayGoals(k), sc = score(k), scored = goals.filter(g => !g.weekly);
  const done = scored.filter(g => g.done).length, n = Math.max(1, diffDays(state.startDate, k) + 1);
  // Next step: the current schedule block if it is unfinished, otherwise the first open goal.
  const cur = blockAt(parsePlan(state.plan), nowMin());
  const linked = cur?.link && goals.find(g => g.id === cur.link || (cur.link === 'pray' && g.id === 'prayers'));
  const next = (linked && !linked.done && linked.next ? linked : null) || scored.find(g => !g.done && g.next && !g.running);
  const monday = weekStart(k), stk = streak();
  const row = g => `<div class="personal-habit ${g.done ? 'is-done' : ''} ${g.over ? 'is-over' : ''} ${g.running ? 'is-running' : ''}" data-habit-row="${g.id}" data-log-date="${k}" data-category="${g.group.toLowerCase()}">
    <span class="profile-feature-icon ${g.tone}">${icon(g.icon)}</span>
    <div class="habit-copy"><b>${esc(g.title)}</b><span>${esc(g.text)}</span><div class="habit-meter" role="progressbar" aria-label="${esc(g.title)}" aria-valuenow="${Math.round(g.frac * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${g.frac * 100}%"></i></div></div>
    <button type="button" class="habit-check" ${g.act} aria-label="${esc(g.label)}" ${g.pressed !== undefined ? `aria-pressed="${g.pressed}"` : ''}>${icon(g.glyph || (g.done ? 'check' : 'plus'))}</button></div>`;
  const groups = ['Deen', 'Work', 'Body'].map(name => `<p class="habit-group" data-category="${name.toLowerCase()}">${name}</p>${goals.filter(g => g.group === name).map(row).join('')}`).join('');
  const groupFrac = name => { const list = scored.filter(g => g.group === name); return list.reduce((sum, g) => sum + g.frac, 0) / Math.max(1, list.length); };
  const strip = window.TakeoverHome?.categoryStrip([['Deen', 'spirit', 'violet'], ['Work', 'focus', 'coral'], ['Body', 'body', 'mint']]
    .map(([title, glyph, tone]) => ({ id: title.toLowerCase(), title, icon: glyph, tone, frac: groupFrac(title) })), sc) || '';
  root.innerHTML = `<section class="personal-hero hero-centered" aria-label="Today's progress">
      <p class="hero-label">Day ${Math.min(n, GOALS.days)} of ${GOALS.days}${stk ? ` · ${stk}-day streak` : ''}</p>
      <div class="personal-ring hero-score" style="--completion:${Math.round(sc * 100)}%"><b>${pct(sc)}</b><span class="hero-meter" aria-hidden="true"><i></i></span></div>
      <p class="hero-sub">${done === scored.length ? `All ${scored.length} goals done. You showed up.` : `${done} of ${scored.length} goals done today${cur ? ` · Now: ${esc(cur.title)}` : ''}`}</p>
      ${next ? `<button type="button" class="hero-next" ${next.act}>Next: ${esc(next.next)} ${icon('arrowRight')}</button>` : ''}</section>
    <div class="personal-week" aria-label="This week">${Array.from({ length: 7 }, (_, i) => {
      const dk = addDays(monday, i), future = dk > k, counted = dk >= state.startDate && !future, s = counted ? score(dk) : null;
      return `<button type="button" data-week-day="${dk}" ${future ? 'disabled' : ''} aria-label="${parseKey(dk).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${future ? 'upcoming' : s === null ? 'before the challenge' : pct(s)}" ${dk === k ? 'aria-current="date"' : ''}><span>${DAY_NAMES[parseKey(dk).getDay()]}</span><b class="${s >= 0.8 ? 'week-done' : ''}">${s >= 1 ? icon('check') : Number(dk.slice(-2))}</b><i class="${s > 0 ? 'has-progress' : ''}"></i></button>`;
    }).join('')}</div>
    ${strip}
    <section class="profile-card"><div class="personal-card-head"><h2 class="habit-list-title">Your habits</h2><button type="button" class="account-secondary" data-open-checkin>${icon('edit')} Check in</button></div>${groups}
      <div class="personal-card-foot"><button type="button" class="link" data-open-checkin>Detailed check-in ${icon('chevronRight')}</button><span>A day counts at 80%+</span></div></section>
    <div class="personal-shortcuts"><button type="button" data-goto="progress">${icon('progress')} Your reports ${icon('chevronRight')}</button><button type="button" data-goto="profile" data-goto-tab="friends">${icon('users')} Your circle ${icon('chevronRight')}</button></div>`;
  window.TakeoverHome?.applyFilter(root);
  // Spring from the previous values only after a deliberate tap, never on background renders.
  const fractions = Object.fromEntries(goals.map(g => [g.id, g.frac]));
  if (todayFractions?.k === k && performance.now() - lastPress < 1500 && window.TakeoverMotion) {
    const before = todayFractions;
    requestAnimationFrame(() => goals.forEach(g => {
      if (before.f[g.id] === g.frac) return;
      window.TakeoverMotion.progress(g.id, k, before.f[g.id], g.frac, before.score, sc);
      if (g.frac >= 1 && before.f[g.id] < 1) window.TakeoverMotion.complete(g.id, k, before.score, sc);
    }));
  }
  todayFractions = { k, f: fractions, score: sc };
}

function rangeKeys() {
  const k = todayKey();
  if (trendRange === 'all') {
    const n = Math.max(1, Math.min(diffDays(state.startDate, k) + 1, GOALS.days));
    return Array.from({ length: n }, (_, i) => addDays(state.startDate, i));
  }
  const n = Number(trendRange);
  return Array.from({ length: n }, (_, i) => addDays(k, i - n + 1)).filter(date => date >= state.startDate);
}
function axisLabels(keys) {
  const n = keys.length;
  return keys.map((k, i) => {
    const d = parseKey(k);
    if (n <= 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    const step = n <= 14 ? 2 : 5;
    return (n - 1 - i) % step === 0 ? String(d.getDate()) : '';
  });
}

function hasProgress(d) {
  return !!d && (
    d.prayers?.some(Boolean) || d.quran > 0 || d.tasbih > 0 || d.food?.length > 0 || d.steps > 0 || d.gym || d.call ||
    d.sleep != null || d.screen != null || Object.values(d.mins || {}).some(v => v > 0)
  );
}

function progressPeriodCount(mode) {
  const today = todayKey();
  const loggedKeys = Object.keys(state.days || {}).filter(k => k >= state.startDate && k <= today && hasProgress(state.days[k])).sort();
  const historyStart = loggedKeys[0] || (state.startDate <= today ? state.startDate : today);
  if (mode === 'day') return Math.max(1, Math.min(14, diffDays(historyStart, today) + 1));
  if (mode === 'week') return Math.max(1, Math.min(12, Math.floor(diffDays(weekStart(historyStart), weekStart(today)) / 7) + 1));
  const a = parseKey(historyStart), b = parseKey(today);
  return Math.max(1, Math.min(12, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1));
}

function progressPeriods(mode, count, offset = 0) {
  const today = todayKey();
  return Array.from({ length: count }, (_, i) => {
    const age = count - i - 1 + offset;
    let start, end;
    if (mode === 'day') {
      start = addDays(today, -age); end = start;
    } else if (mode === 'week') {
      start = addDays(weekStart(today), -age * 7); end = addDays(start, 6);
    } else {
      const first = parseKey(`${today.slice(0, 7)}-01`);
      first.setMonth(first.getMonth() - age);
      start = keyOf(first);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      end = keyOf(last);
    }
    if (end > today) end = today;
    const keys = [];
    for (let k = start; k <= end; k = addDays(k, 1)) keys.push(k);
    const loggedKeys = keys.filter(k => k >= state.startDate && hasProgress(state.days[k]));
    const scores = loggedKeys.map(k => score(k) * 100);
    const focusMinutes = loggedKeys.reduce((sum, k) => sum + FOCUS.reduce((n, f) => n + focusMins(state.days[k], f.id, k), 0), 0);
    return {
      start, end, loggedKeys, scores,
      average: scores.length ? avg(scores) : null,
      focusMinutes,
      goalDays: scores.filter(value => value >= 80).length,
    };
  });
}

function isoWeek(k) {
  const d = parseKey(k);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function periodAxisLabel(mode, period) {
  const d = parseKey(period.start);
  if (mode === 'day') return String(d.getDate());
  if (mode === 'week') return `W${isoWeek(period.start)}`;
  return d.toLocaleDateString(undefined, { month: 'short' });
}

function periodTitle(mode, period) {
  if (mode === 'day') return shortDate(period.start);
  if (mode === 'week') return `Week of ${parseKey(period.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  return parseKey(period.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function renderPeriodSummary() {
  document.querySelectorAll('[data-period]').forEach(b => {
    const active = b.dataset.period === trendPeriod;
    b.classList.toggle('on', active);
    b.setAttribute('aria-pressed', String(active));
  });
  const count = progressPeriodCount(trendPeriod);
  const periods = progressPeriods(trendPeriod, count);
  const previous = progressPeriods(trendPeriod, count, count);
  const currentDays = periods.flatMap(p => p.loggedKeys.map((k, i) => ({ key: k, score: p.scores[i] })));
  const previousDays = previous.flatMap(p => p.loggedKeys.map((k, i) => ({ key: k, score: p.scores[i] })));
  const averageScore = currentDays.length ? avg(currentDays.map(d => d.score)) : null;
  const previousAverage = previousDays.length ? avg(previousDays.map(d => d.score)) : null;
  const goalDays = currentDays.filter(d => d.score >= 80).length;
  const totalFocus = periods.reduce((sum, p) => sum + p.focusMinutes, 0);
  const periodLabel = trendPeriod === 'day' ? 'days' : `${trendPeriod}s`;
  const windowLabel = `last ${count} ${periodLabel}`;
  const stats = [
    ['Average score', averageScore == null ? '—' : `${Math.round(averageScore)}%`, windowLabel],
    ['Days at 80%+', `${goalDays}/${currentDays.length}`, 'recorded days'],
    ['Active periods', `${periods.filter(p => p.loggedKeys.length).length}/${count}`, periodLabel],
    ['Focus time', fmtMin(totalFocus), windowLabel],
  ];
  $('period-summary').innerHTML = stats.map(([label, value, sub], i) => `<div class="period-stat" data-tone="${['violet', 'mint', 'blue', 'coral'][i]}"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`).join('');

  const noun = trendPeriod === 'day' ? 'daily score' : trendPeriod === 'week' ? 'weekly average' : 'monthly average';
  $('period-chart-title').textContent = `${noun[0].toUpperCase()}${noun.slice(1)}`;
  const labels = periods.map(p => periodAxisLabel(trendPeriod, p));
  const tips = periods.map(p => {
    const scoreText = p.average == null ? 'No activity logged' : `Average score ${Math.round(p.average)}% · ${p.loggedKeys.length} active day${p.loggedKeys.length === 1 ? '' : 's'}`;
    return `${periodTitle(trendPeriod, p)}\n${scoreText}\nFocus ${fmtMin(p.focusMinutes)}`;
  });
  $('period-chart').innerHTML = C.columns({
    labels, tips, series: [{ cls: 's3', vals: periods.map(p => p.average || 0) }],
    goal: 80, goalLabel: '80%', fmtAxis: v => `${Math.round(v)}%`, fixedTop: 100,
  });

  let insight;
  if (!currentDays.length) {
    insight = ['spark', 'Your story starts here', `Log a day to see your ${trendPeriod} trend.`];
  } else if (previousAverage == null) {
    insight = ['spark', 'Building your baseline', 'Keep logging to unlock a period comparison.'];
  } else {
    const change = Math.round(averageScore - previousAverage);
    const direction = change > 1 ? 'arrowUp' : change < -1 ? 'arrowDown' : 'arrowRight';
    const title = change > 1 ? `Up ${change} points` : change < -1 ? `Down ${Math.abs(change)} points` : 'Holding steady';
    insight = [direction, title, `Compared with the previous ${count} ${periodLabel}.`];
  }
  $('period-insight').innerHTML = `<span class="insight-symbol" aria-hidden="true">${icon(insight[0])}</span><div><small>The trend</small><b>${insight[1]}</b><span>${insight[2]}</span></div>`;
}

function renderTrends() {
  renderPeriodSummary();
  document.querySelectorAll('[data-range]').forEach(b => {
    const active = b.dataset.range === trendRange;
    b.classList.toggle('on', active);
    b.setAttribute('aria-pressed', String(active));
  });
  const keys = rangeKeys(), labels = axisLabels(keys);
  const D = keys.map(k => state.days[k]);
  const mins = (d, k, id) => (d ? focusMins(d, id, k) : 0);

  const scores = keys.map(k => score(k) * 100);
  const logged = keys.filter(k => state.days[k]);
  const stepsArr = D.map(d => d?.steps || 0);
  const focusTotal = keys.reduce((s, k, i) => s + FOCUS.reduce((t, f) => t + mins(D[i], k, f.id), 0), 0);
  const kcalDays = D.filter(d => d && kcalOf(d) > 0);
  $('trend-stats').innerHTML = [
    ['Avg score', logged.length ? `${Math.round(avg(logged.map(k => score(k) * 100)))}%` : '–'],
    ['Days at 80%+', `${scores.filter(s => s >= 80).length}`],
    ['Avg steps', logged.length ? compact(avg(logged.map(k => state.days[k].steps))) : '–'],
    ['Focus total', fmtMin(focusTotal)],
    ['Under 1,400 kcal', `${kcalDays.filter(d => kcalOf(d) <= GOALS.kcal).length}/${kcalDays.length || 0} days`],
  ].map(([l, v]) => `<div class="stat"><span>${l}</span><b>${v}</b></div>`).join('');

  $('c-score').innerHTML = C.columns({
    labels, series: [{ cls: 's1', vals: scores }], goal: 80, goalLabel: '80%', fmtAxis: v => `${Math.round(v)}%`, fixedTop: 100,
    tips: keys.map((k, i) => `${shortDate(k)}\nScore ${Math.round(scores[i])}%`),
  });

  const fcls = ['s1', 's2', 's3', 's4'];
  $('focus-legend').innerHTML = FOCUS.map((f, j) => `<span><i class="sw ${fcls[j]}"></i>${esc(f.label)} <b>${fmtMin(keys.reduce((s, k, i) => s + mins(D[i], k, f.id), 0))}</b></span>`).join('');
  $('c-focus').innerHTML = C.columns({
    labels, goal: 8, goalLabel: '8h', fmtAxis: v => `${r1(v)}h`,
    series: FOCUS.map((f, j) => ({ cls: fcls[j], vals: keys.map((k, i) => mins(D[i], k, f.id) / 60) })),
    tips: keys.map((k, i) => `${shortDate(k)}\n${FOCUS.map(f => `${f.label}: ${fmtMin(mins(D[i], k, f.id))}`).join('\n')}\nTotal: ${fmtMin(FOCUS.reduce((s, f) => s + mins(D[i], k, f.id), 0))}`),
  });

  $('c-steps').innerHTML = C.columns({
    labels, series: [{ cls: 's2', vals: stepsArr }], goal: GOALS.steps, goalLabel: '20K', fmtAxis: compact,
    tips: keys.map((k, i) => `${shortDate(k)}\n${num(stepsArr[i])} steps (${pct(stepsArr[i] / GOALS.steps)})`),
  });

  const kcalArr = D.map(d => (d ? kcalOf(d) : 0));
  $('c-kcal').innerHTML = C.columns({
    labels, series: [{ cls: 's2', vals: kcalArr }], goal: GOALS.kcal, goalLabel: '1,400', fmtAxis: compact, overGoalCrit: true,
    tips: keys.map((k, i) => `${shortDate(k)}\n${num(kcalArr[i])} kcal${kcalArr[i] > GOALS.kcal ? `\n▲ ${num(kcalArr[i] - GOALS.kcal)} over the limit` : kcalArr[i] ? `\n${num(GOALS.kcal - kcalArr[i])} under` : ''}`),
  });

  const sleepArr = D.map(d => d?.sleep || 0);
  $('c-sleep').innerHTML = C.columns({
    labels, series: [{ cls: 's2', vals: sleepArr }], goal: GOALS.sleep, goalLabel: '7h', fmtAxis: v => `${r1(v)}h`, minTop: 8,
    tips: keys.map((k, i) => `${shortDate(k)}\n${sleepArr[i] ? `${sleepArr[i]}h sleep` : 'not logged'}`),
  });

  const pk = keys.slice(-14), pD = pk.map(k => state.days[k]);
  $('prayer-range').textContent = `· last ${pk.length} days`;
  $('c-prayers').innerHTML = C.dotMatrix({
    rows: PRAYERS, cols: axisLabels(pk), grid: PRAYERS.map((_, r) => pD.map(d => !!d?.prayers[r])),
    tips: pk.map((k, i) => `${shortDate(k)}\n${PRAYERS.map((p, r) => `${pD[i]?.prayers[r] ? '✓' : '·'} ${p}`).join('\n')}`),
  });
}

function renderWeight() {
  const w = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const start = state.startWeight ?? w[0]?.kg;
  const cur = w.at(-1)?.kg;
  if (start == null) {
    $('weight-summary').textContent = '— add first log';
    $('weight-chart').innerHTML = '';
    return;
  }
  const goal = start - GOALS.weightLoss;
  const lost = cur != null ? start - cur : 0;
  $('weight-summary').textContent = `${cur ?? start} kg now · ${lost >= 0 ? '−' : '+'}${Math.abs(lost).toFixed(1)} kg · ${Math.max((cur ?? start) - goal, 0).toFixed(1)} kg to go`;
  const short = k => parseKey(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  $('weight-chart').innerHTML = C.line({
    pts: w.map(p => ({ x: diffDays(w[0].date, p.date), v: p.kg, label: `${p.kg} kg`, date: short(p.date), tip: `${shortDate(p.date)}\n${p.kg} kg` })),
    goal, goalLabel: `goal ${goal.toFixed(0)}`, fmtAxis: v => `${Math.round(v)}`,
  });
}

function renderTimeline() {
  const k = todayKey(), d = day(k);
  const plan = parsePlan(state.plan);
  $('timeline-count').textContent = `${plan.length} blocks`;
  const t = nowMin(), cur = blockAt(plan, t);
  $('timeline').innerHTML = plan.map(b => {
    const cls = b === cur ? 'now' : (b.e <= t ? 'past' : '');
    const done = linkDone(b.link, d, k);
    return `<li class="${cls}"><span class="t">${esc(b.from)}<span class="to">–${esc(b.to)}</span></span><span>${esc(b.title)}</span><span class="ok">${done ? `${icon('check')}<span class="sr-only">Complete</span>` : ''}</span></li>`;
  }).join('');
}

function renderExams() {
  const k = todayKey();
  const list = state.exams.map((e, i) => ({ ...e, i, left: diffDays(k, e.date) })).sort((a, b) => a.date.localeCompare(b.date));
  $('exam-list').innerHTML = list.length ? list.map(e => {
    const cls = e.left < 0 ? '' : e.left <= 3 ? 'soon' : e.left <= 7 ? 'near' : '';
    const label = e.left < 0 ? 'done' : e.left === 0 ? 'TODAY' : e.left === 1 ? 'tomorrow' : `in ${e.left} days`;
    return `<li><span class="grow">${esc(e.name)} <span class="muted small">${parseKey(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></span><span class="badge ${cls}">${label}</span><button class="x" data-delexam="${e.i}" aria-label="Remove ${esc(e.name)}">${icon('close')}</button></li>`;
  }).join('') : '<li class="muted">Add exams for countdowns.</li>';
}

function renderMoney() {
  const c = state.currency ? ` ${state.currency}` : '';
  const total = state.debts.reduce((s, d) => s + d.amount, 0);
  const back = state.debts.reduce((s, d) => s + Math.min(d.paid, d.amount), 0);
  $('money-summary').textContent = `${num(back)} / ${num(total)}${c} recovered`;
  $('debt-list').innerHTML = state.debts.map((d, i) => {
    const left = Math.max(d.amount - d.paid, 0);
    return `<li class="${left === 0 ? 'paid' : ''}">
      <span class="grow"><button class="link" data-rename="${i}" style="padding:0;color:inherit;text-decoration:none">${esc(d.name)}</button> <span class="muted small">${d.paid ? `paid ${num(d.paid)} of ${num(d.amount)}` : ''}</span></span>
      <span class="badge">${num(left)}${c}</span>
      ${left ? `<button data-pay="${i}" aria-label="Record payment from ${esc(d.name)}">${icon('check')} Paid</button>` : ''}
      <button class="x" data-deldebt="${i}" aria-label="Remove ${esc(d.name)}">${icon('close')}</button></li>`;
  }).join('');
}

/* ---------- Calendar ---------- */
let calMonth = todayKey().slice(0, 7); // YYYY-MM shown
let calSel = todayKey();

// Events and exams for one day, in time order.
function itemsOn(k) {
  const ev = (state.events || []).map((e, i) => ({ ...e, kind: 'event', i })).filter(e => e.date === k);
  const ex = state.exams.map((e, i) => ({ title: e.name, date: e.date, time: e.time || '', kind: 'exam', i })).filter(e => e.date === k);
  return [...ex, ...ev].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}
function upcomingItems(limit = 6) {
  const k = todayKey();
  return [
    ...(state.events || []).map((e, i) => ({ ...e, kind: 'event', i })),
    ...state.exams.map((e, i) => ({ title: e.name, date: e.date, time: e.time || '', kind: 'exam', i })),
  ].filter(e => e.date >= k).sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99'))).slice(0, limit);
}
const inDays = n => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

function renderCalendar() {
  const personal = state.experience === 'personal';
  const k = todayKey();
  const end = addDays(state.startDate, GOALS.days - 1);
  const dayN = diffDays(state.startDate, k) + 1;
  $('cal-progress').textContent = personal ? '' : dayN >= 1 && dayN <= GOALS.days
    ? `· challenge day ${dayN} of ${GOALS.days}, ends ${parseKey(end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
    : dayN < 1 ? `· challenge starts ${shortDate(state.startDate)}` : '· challenge complete';

  const first = parseKey(`${calMonth}-01`);
  $('cal-title').textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const gridStart = addDays(`${calMonth}-01`, -((first.getDay() + 6) % 7)); // Monday
  const weekdays = Array.from({ length: 7 }, (_, i) => parseKey(addDays(gridStart, i)).toLocaleDateString(undefined, { weekday: 'narrow' }));
  let html = weekdays.map(w => `<div class="cal-wd">${w}</div>`).join('');
  const weeks = Math.ceil((diffDays(gridStart, `${calMonth}-01`) + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  for (let i = 0; i < weeks * 7; i++) {
    const dk = addDays(gridStart, i), dd = parseKey(dk);
    const out = dk.slice(0, 7) !== calMonth;
    const hasData = dk <= k && state.days[dk];
    const sc = hasData ? score(dk) : 0;
    const items = itemsOn(dk);
    const ch = !personal && dk >= state.startDate && dk <= end;
    const cls = ['cal-cell', out && 'out', hasData && level(sc), dk === k && 'today', dk === calSel && 'sel', ch && 'ch'].filter(Boolean).join(' ');
    const tip = [shortDate(dk), ch ? `Challenge day ${diffDays(state.startDate, dk) + 1}` : '', hasData ? `Score ${pct(sc)}` : '', ...items.map(e => `${e.kind === 'exam' ? 'Exam: ' : ''}${e.time ? e.time + ' ' : ''}${e.title}`)].filter(Boolean).join('\n');
    html += `<button class="${cls}" data-day="${dk}" aria-label="${esc(tip.replace(/\n/g, ', '))}">
      <span class="n">${dd.getDate()}</span>
      <span class="dots">${items.slice(0, 3).map(e => `<i class="${e.kind === 'exam' ? 's2' : 's1'}"></i>`).join('')}${items.length > 3 ? '<b>+</b>' : ''}</span></button>`;
  }
  $('cal-grid').innerHTML = html;

  // Selected day panel
  const items = itemsOn(calSel);
  const sd = state.days[calSel];
  const chN = diffDays(state.startDate, calSel) + 1;
  $('cal-day').innerHTML = `<div class="cal-day-head"><b>${esc(parseKey(calSel).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</b>
    <span class="muted small">${[calSel === k ? 'Today' : calSel > k ? inDays(diffDays(k, calSel)) : '', !personal && chN >= 1 && chN <= GOALS.days ? `Challenge day ${chN}` : '', sd && calSel <= k ? `Score ${pct(score(calSel))}` : ''].filter(Boolean).join(' · ')}</span></div>
    <ul class="list">${items.length ? items.map(e => `<li><i class="dot-key ${e.kind === 'exam' ? 's2' : 's1'}"></i><span class="grow">${e.time ? `<span class="muted mono">${esc(e.time)}</span> ` : ''}${esc(e.title)}${e.kind === 'exam' ? ' <span class="badge">exam</span>' : ''}</span><button class="x" data-del-item="${e.kind}:${e.i}" aria-label="Remove ${esc(e.title)}">${icon('close')}</button></li>`).join('') : '<li class="muted small">No events</li>'}</ul>`;

  const up = upcomingItems();
  $('upcoming').innerHTML = up.length ? up.map(e => {
    const n = diffDays(k, e.date);
    return `<li><i class="dot-key ${e.kind === 'exam' ? 's2' : 's1'}"></i><button class="link up-item grow" data-day="${e.date}">${esc(e.title)} <span class="muted small">${esc(parseKey(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }))}${e.time ? ` · ${esc(e.time)}` : ''}</span></button><span class="badge ${n <= 3 ? 'soon' : n <= 7 ? 'near' : ''}">${inDays(n)}</span></li>`;
  }).join('') : '<li class="muted small">No upcoming events</li>';
}

function renderSettings() {
  setIfIdle($('start-date'), state.startDate);
  setIfIdle($('start-weight'), state.startWeight ?? '');
  setIfIdle($('currency'), state.currency);
  $('shortcut-url').textContent = `${location.origin}${location.pathname}?steps=`;
}

function render() {
  document.body.classList.toggle('personal-mode', state.experience === 'personal');
  if (state.experience === 'personal') {
    renderHeader(); renderExams(); renderMoney(); renderCalendar(); renderSettings();
    $('session-dock').hidden = true;
    window.TakeoverPersonalUI?.render();
    return;
  }
  renderHeader(); renderNow(); renderDeen(); renderFocus(); renderBody();
  renderGlance(); renderToday(); renderWeight(); renderTimeline(); renderTrends(); renderExams(); renderMoney(); renderCalendar(); renderSettings();
  renderSessionDock();
}

/* Lightweight per-second refresh: only the live numbers. */
let lastMinute = -1, lastDay = todayKey();
function tick() {
  const now = new Date();
  if (state.experience === 'personal') {
    if (todayKey() !== lastDay) { lastDay = todayKey(); render(); }
    if (now.getMinutes() !== lastMinute) { lastMinute = now.getMinutes(); renderHeader(); window.TakeoverPersonalUI?.tick(); }
    return;
  }
  if (todayKey() !== lastDay) { lastDay = todayKey(); render(); return; }
  if (now.getMinutes() !== lastMinute) { lastMinute = now.getMinutes(); renderHeader(); renderNow(); renderTimeline(); renderGlance(); renderToday(); }
  const r = state.running;
  if (r) {
    renderFocusSummary();
    const dockClock = $('session-clock'); if (dockClock) dockClock.textContent = fmtClock((Date.now() - r.start) / 1000);
    const rc = $('run-clock'); if (rc) rc.textContent = fmtClock((Date.now() - r.start) / 1000);
    const f = FOCUS.find(x => x.id === r.id), d = day(r.day);
    const m = focusMins(d, f.id, r.day);
    const ft = document.querySelector(`[data-ftime="${f.id}"]`); if (ft) ft.textContent = `${fmtMin(m)} / ${fmtMin(f.goal)}`;
    const fb = document.querySelector(`[data-fbar="${f.id}"]`); if (fb) fb.style.width = pct(Math.min(m / f.goal, 1));
    const minutes = document.querySelector(`[data-fminutes="${f.id}"]`); if (minutes) minutes.textContent = fmtMin(m);
  }
}

/* ---------- Events ---------- */
function commit(msg) { save(); render(); if (msg) toast(msg); }

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const ds = b.dataset;
  if (ds.personalAction) return;
  if (ds.dailyTab) return activateDailyTab(ds.dailyTab);
  if ('openCheckin' in ds) {
    activateDailyTab('checkin', { focus: !ds.focusField, reveal: true });
    if (ds.focusField) document.querySelector(ds.focusField)?.focus({ preventScroll: true });
    return;
  }
  if (ds.goto) { window.Takeover.navigate(ds.goto); if (ds.gotoTab) selectDestination(ds.goto, ds.gotoTab); return; }
  if (ds.weekDay) { calSel = ds.weekDay; calMonth = ds.weekDay.slice(0, 7); window.Takeover.navigate('planner'); return renderCalendar(); }
  const d = day();
  if (ds.start) return startTimer(ds.start);
  if (ds.day) { calSel = ds.day; calMonth = ds.day.slice(0, 7); return renderCalendar(); }
  if (ds.cal) {
    if (ds.cal === 'today') { calSel = todayKey(); calMonth = calSel.slice(0, 7); }
    else { const d = parseKey(`${calMonth}-01`); d.setMonth(d.getMonth() + Number(ds.cal)); calMonth = keyOf(d).slice(0, 7); }
    return renderCalendar();
  }
  if (ds.delItem) {
    const [kind, i] = ds.delItem.split(':');
    const list = kind === 'exam' ? state.exams : state.events;
    const name = kind === 'exam' ? list[i].name : list[i].title;
    if (confirm(`Remove "${name}"?`)) { list.splice(Number(i), 1); commit(); }
    return;
  }
  if (ds.range) {
    trendRange = ds.range;
    try { localStorage.setItem('takeover.range', trendRange); } catch { /* per-device preference only */ }
    return renderTrends();
  }
  if (ds.period) {
    trendPeriod = ds.period;
    try { localStorage.setItem('takeover.period', trendPeriod); } catch { /* per-device preference only */ }
    return renderTrends();
  }
  if (ds.prayer != null) { d.prayers[ds.prayer] = !d.prayers[ds.prayer]; return commit(); }
  if (ds.adj) { d.mins[ds.adj] = Math.max(0, (d.mins[ds.adj] || 0) + Number(ds.v)); return commit(); }
  if (ds.delfood != null) { d.food.splice(ds.delfood, 1); return commit(); }
  if (ds.delexam != null) { state.exams.splice(ds.delexam, 1); return commit(); }
  if (ds.deldebt != null) { if (confirm(`Remove ${state.debts[ds.deldebt].name}?`)) { state.debts.splice(ds.deldebt, 1); commit(); } return; }
  if (ds.rename != null) {
    const n = prompt('Name', state.debts[ds.rename].name);
    if (n && n.trim()) { state.debts[ds.rename].name = n.trim(); commit(); }
    return;
  }
  if (ds.pay != null) {
    const debt = state.debts[ds.pay], left = debt.amount - debt.paid;
    const v = prompt(`How much did ${debt.name} pay back?`, left);
    const n = Number(v);
    if (v != null && n > 0) { debt.paid = Math.min(debt.amount, debt.paid + n); commit(debt.paid >= debt.amount ? `${debt.name} is fully paid 🎉` : 'Payment logged'); }
    return;
  }
  if (ds.quick === 'quran') { d.quran++; return commit(); }
  if (ds.quick === 'call') { d.call = true; return commit('Parents called ❤️'); }
  if (ds.quick === 'gym') { d.gym = true; return commit('Gym logged 💪'); }
  if (ds.quick === 'pray') { d.prayers[ds.i] = true; return commit(); }
  if (ds.quick === 'tasbih33') { d.tasbih += 33; return commit(d.tasbih >= GOALS.tasbih && d.tasbih - 33 < GOALS.tasbih ? '100 tasbihat — SubhanAllah 🤍' : ''); }
  if (ds.quick === 'call-toggle') { d.call = !d.call; return commit(d.call ? 'Parents called ❤️' : ''); }
  if (ds.quick === 'gym-toggle') { d.gym = !d.gym; return commit(d.gym ? 'Gym logged 💪' : ''); }
  if (ds.step && b.parentElement.dataset.field === 'quran') { d.quran = Math.max(0, d.quran + Number(ds.step)); return commit(); }

  switch (b.id) {
    case 'call-btn': d.call = !d.call; return commit();
    case 'gym-btn': d.gym = !d.gym; return commit(d.gym ? 'Gym logged 💪' : '');
    case 'tasbih-btn':
      d.tasbih++;
      if (navigator.vibrate) navigator.vibrate(d.tasbih % 33 === 0 ? 60 : 10);
      save(); renderDeen(); renderHeader(); renderGlance(); renderToday();
      if (d.tasbih === GOALS.tasbih) toast('100 tasbihat — SubhanAllah 🤍');
      return;
    case 'tasbih-undo': d.tasbih = Math.max(0, d.tasbih - 1); return commit();
    case 'tasbih-33': d.tasbih += 33; return commit();
    case 'edit-plan': {
      const ed = $('plan-editor'); ed.hidden = !ed.hidden;
      if (!ed.hidden) { $('plan-text').value = state.plan; $('timeline-details').open = true; }
      b.innerHTML = `${icon(ed.hidden ? 'edit' : 'close')} ${ed.hidden ? 'Edit' : 'Close'}`;
      b.setAttribute('aria-label', ed.hidden ? 'Edit plan' : 'Close plan editor');
      return;
    }
    case 'plan-save': {
      const text = $('plan-text').value;
      const n = parsePlan(text).length;
      if (!n) return toast('No valid lines — use HH:MM-HH:MM | Title | link');
      state.plan = text; $('plan-editor').hidden = true; $('edit-plan').innerHTML = `${icon('edit')} Edit`; $('edit-plan').setAttribute('aria-label', 'Edit plan');
      return commit(`Plan saved (${n} blocks)`);
    }
    case 'plan-reset': $('plan-text').value = DEFAULT_PLAN; return;
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `takeover-backup-${todayKey()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
  }
});

function onSubmit(id, fn) {
  $(id).addEventListener('submit', e => { e.preventDefault(); fn(e.target); });
}
onSubmit('food-form', f => {
  const kcal = Math.round(Number(f.kcal.value));
  if (!(kcal >= 0)) return;
  day().food.push({ name: f.name.value.trim(), kcal });
  f.reset(); f.name.focus();
  commit();
});
onSubmit('steps-form', f => { day().steps = Math.max(0, Math.round(Number(f.steps.value) || 0)); f.steps.blur(); commit('Steps saved'); });
onSubmit('sleep-form', f => { const v = f.sleep.value; day().sleep = v === '' ? null : Number(v); f.sleep.blur(); commit('Sleep saved'); });
onSubmit('screen-form', f => { const v = f.screen.value; day().screen = v === '' ? null : Number(v); f.screen.blur(); commit('Screen time saved'); });
onSubmit('weight-form', f => {
  const kg = Number(f.kg.value);
  if (!(kg > 0)) return;
  const k = todayKey();
  state.weights = state.weights.filter(w => w.date !== k).concat({ date: k, kg });
  if (state.startWeight == null) state.startWeight = kg;
  f.reset(); commit('Weight logged');
});
onSubmit('event-form', f => {
  const title = f.title.value.trim(), time = f.time.value;
  if (!title) return;
  if (f.type.value === 'exam') state.exams.push({ name: title, date: calSel, ...(time ? { time } : {}) });
  else (state.events ||= []).push({ title, date: calSel, time });
  f.title.value = ''; f.time.value = ''; f.type.value = 'event';
  commit(`Added to ${shortDate(calSel)}`);
});
onSubmit('exam-form', f => { state.exams.push({ name: f.name.value.trim(), date: f.date.value }); f.reset(); commit(); });
onSubmit('debt-form', f => { state.debts.push({ name: f.name.value.trim(), amount: Number(f.amount.value), paid: 0 }); f.reset(); commit(); });

$('start-date').addEventListener('change', e => { if (e.target.value) { state.startDate = e.target.value; commit(); } });
$('start-weight').addEventListener('change', e => { state.startWeight = e.target.value === '' ? null : Number(e.target.value); commit(); });
$('currency').addEventListener('change', e => { state.currency = e.target.value.trim(); commit(); });
$('import').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.days !== 'object') throw new Error();
    if (!confirm('Replace everything on this device with the backup?')) return;
    state = restoreState(data);
    commit('Backup restored');
  } catch { toast('That file is not a Takeover backup'); }
  e.target.value = '';
});

/* ---------- iOS Shortcut sync: ?steps=12345&sleep=7.5&screen=180 ---------- */
function applyUrlParams() {
  const p = new URLSearchParams(location.search);
  if (!['steps', 'sleep', 'screen'].some(name => p.has(name))) return;
  const k = /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') || '') ? p.get('date') : todayKey();
  const d = day(k), got = [];
  const n = name => { const v = Number(p.get(name)); return p.has(name) && Number.isFinite(v) && v >= 0 ? v : null; };
  if (n('steps') != null) { d.steps = Math.round(n('steps')); got.push(`${num(d.steps)} steps`); }
  if (n('sleep') != null) { d.sleep = Math.round(n('sleep') * 4) / 4; got.push(`${d.sleep}h sleep`); }
  if (n('screen') != null) { d.screen = Math.round(n('screen')); got.push(`${d.screen}m screen`); }
  ['steps', 'sleep', 'screen', 'date'].forEach(name => p.delete(name));
  history.replaceState(null, '', `${location.pathname}${p.size ? '?' + p.toString() : ''}${location.hash}`);
  if (got.length) { save(); setTimeout(() => toast(`Synced: ${got.join(', ')}`), 300); }
}

// Hooks for sync.js
window.Takeover = {
  get state() { return state; },
  set state(v) { state = restoreState(v); },
  save, render, toast,
};

C.initTooltip();
applyUrlParams();
save(false);
render();
setInterval(tick, 1000);

/* Five focused views replace the old page-long section dock. */
const viewNames = {
  today: 'Today', focus: 'Focus', progress: 'Progress', planner: 'Plan', more: 'Money', profile: 'Profile',
};
const legacyViews = {
  overview: 'today', 'now-card': 'today', deen: 'today', body: 'today',
  focus: 'focus', plan: 'focus', trends: 'progress', weight: 'progress',
  calendar: 'planner', exams: 'planner', debts: 'more', settings: 'profile',
};
const viewLinks = [...document.querySelectorAll('[data-view-target]')];
const viewPanels = [...document.querySelectorAll('.view-panel')];
const pageTitle = $('page-title');

function activateDailyTab(name, { focus = false, reveal = false } = {}) {
  const selected = name === 'checkin' ? 'checkin' : 'overview';
  document.querySelectorAll('[data-daily-tab]').forEach(tab => {
    const active = tab.dataset.dailyTab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !active;
  });
  if (selected === 'overview') renderGlance();
  if (focus) $(`daily-${selected}-tab`).focus({ preventScroll: true });
  if (reveal) document.querySelector('.today-toolbar').scrollIntoView({ block: 'start', behavior: 'instant' });
}

document.querySelector('.daily-switch').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = event.target.closest('[data-daily-tab]');
  if (!current) return;
  const next = event.key === 'Home' ? 'overview' : event.key === 'End' ? 'checkin'
    : current.dataset.dailyTab === 'overview' ? 'checkin' : 'overview';
  activateDailyTab(next, { focus: true });
});

function applyDailyHash() {
  if (['#deen', '#body'].includes(location.hash)) activateDailyTab('checkin');
  else if (['#overview', '#now-card'].includes(location.hash)) activateDailyTab('overview');
}

function viewFromHash() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('view-') && viewNames[hash.slice(5)]) return hash.slice(5);
  return legacyViews[hash] || 'today';
}

// Profile opens from the header avatar, so it gets an iOS back button to the tab you came from.
let returnView = 'today';
function activateView(name, { focus = false, skip = false } = {}) {
  const view = viewNames[name] ? name : 'today';
  const previousView = document.body.dataset.view;
  if (view === 'profile' && previousView && previousView !== 'profile' && viewNames[previousView]) returnView = previousView;
  $('view-back').hidden = view !== 'profile';
  $('view-back-label').textContent = viewNames[returnView];
  $('view-back').setAttribute('aria-label', `Back to ${viewNames[returnView]}`);
  viewPanels.forEach(panel => { panel.hidden = panel.dataset.view !== view; });
  viewLinks.forEach(link => {
    const active = link.dataset.viewTarget === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  pageTitle.textContent = viewNames[view];
  document.body.dataset.view = view;
  document.title = `${viewNames[view]} · Takeover`;

  // SVG charts need a measured panel width before they can be drawn.
  if (view === 'progress' && state.experience !== 'personal') { renderTrends(); renderWeight(); }
  window.TakeoverPersonalUI?.render();
  if (previousView && previousView !== view) window.TakeoverMotion?.reveal(document.getElementById(`view-${view}`));
  window.dispatchEvent(new CustomEvent('takeover:view', { detail: { view } }));
  if (focus) {
    if (skip) document.getElementById(`view-${view}`).focus();
    else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      pageTitle.focus({ preventScroll: true });
    }
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[data-view-target]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const view = link.dataset.viewTarget;
  const hash = `#view-${view}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  activateView(view, { focus: true, skip: link.classList.contains('skip-link') });
});

activateView(viewFromHash());
applyDailyHash();
if (location.hash && !location.hash.startsWith('#view-') && !/(access_token|refresh_token|error|type)=/.test(location.hash)) {
  history.replaceState(null, '', `${location.pathname}${location.search}#view-${viewFromHash()}`);
}
$('trend-details').addEventListener('toggle', event => {
  if (event.currentTarget.open) renderTrends();
});
$('sync-indicator').addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.Takeover.navigate('profile');
  selectDestination('profile', 'account');
});
window.addEventListener('hashchange', () => {
  activateView(viewFromHash(), { focus: true });
  applyDailyHash();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  state = load(); render();
});

$('view-back').addEventListener('click', () => window.Takeover.navigate(returnView));
window.Takeover.navigate = view => {
  history.pushState(null, '', `#view-${view}`);
  activateView(view, { focus: true });
};
function selectDestination(group, name, focus = false) {
  document.querySelectorAll(`[data-${group}-tab]`).forEach(tab => {
    const selected = tab.dataset[`${group}Tab`] === name;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  });
  if (group === 'progress' && name === 'personal') {
    if (state.experience === 'personal') window.TakeoverPersonalUI?.render();
    else { renderTrends(); renderWeight(); }
  }
  window.dispatchEvent(new CustomEvent('takeover:section', { detail: { group, name } }));
}
['profile', 'progress'].forEach(group => {
  document.querySelectorAll(`[data-${group}-tab]`).forEach(tab => {
    tab.addEventListener('click', () => selectDestination(group, tab.dataset[`${group}Tab`]));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll(`[data-${group}-tab]`)];
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectDestination(group, tabs[next].dataset[`${group}Tab`], true);
    });
  });
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-open-preferences]')) selectDestination('profile', 'preferences', true);
  if (event.target.closest('[data-open-friends]')) { window.Takeover.navigate('profile'); selectDestination('profile', 'friends', true); }
  if (event.target.closest('[data-open-account]')) { window.Takeover.navigate('profile'); selectDestination('profile', 'account', true); }
});
