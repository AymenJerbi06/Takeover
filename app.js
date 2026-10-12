'use strict';

/* ---------- Goals ---------- */
const { GOALS, FOCUS, PRAYERS, kcalOf, dayParts, dayScore } = window.TakeoverMetrics;
// The "day" rolls over at 4am, so a late night still counts toward the day you were living.
const DAY_START_HOUR = 4;
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
const todayKey = () => { const d = new Date(); d.setHours(d.getHours() - DAY_START_HOUR); return keyOf(d); };
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
    startDate: todayKey(),
    startWeight: null,
    currency: '',
    plan: DEFAULT_PLAN,
    days: {},
    weights: [],
    running: null,
    exams: [],
    events: [],
    debts: DEFAULT_DEBTS.map(d => ({ ...d, paid: 0 })),
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch (e) { /* fall through */ }
  return freshState();
}
let state = load();
function save(touch = true) {
  if (touch) state.updatedAt = Date.now();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage is blocked in this browser'); }
  if (touch) window.TakeoverSync?.schedule();
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
  const d = state.days[k];
  return d ? dayParts(d, id => focusMins(d, id, k)) : null;
}
function score(k) {
  const d = state.days[k];
  return dayScore(d, d && (id => focusMins(d, id, k)));
}
function streak() {
  let k = todayKey(), n = 0;
  if (score(k) < 0.8) k = addDays(k, -1); // today still in progress doesn't break it
  while (score(k) >= 0.8) { n++; k = addDays(k, -1); }
  return n;
}
function gymThisWeek() {
  const ws = weekStart(todayKey());
  let n = 0;
  for (let i = 0; i < 7; i++) if (state.days[addDays(ws, i)]?.gym) n++;
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
  const now = new Date();
  $('today-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  $('clock').textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const n = diffDays(state.startDate, todayKey()) + 1;
  $('challenge-day').textContent = n < 1 ? `–${1 - n}` : `${Math.min(n, GOALS.days)}/${GOALS.days}`;
  $('streak').textContent = streak();
  $('today-score').textContent = pct(score(todayKey()));
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
    left = `<div class="label">NOW · ${esc(cur.from)}–${esc(cur.to)}</div>
      <div class="title">${esc(cur.title)}</div>
      <div class="meta">${fmtMin(remain)} left${next && next !== cur ? ` · Next ${esc(next.from)} ${esc(next.title)}` : ''}</div>`;
  } else {
    left = `<div class="label">FREE</div><div class="title">Open time</div>
      <div class="meta">${next ? `Next ${esc(next.from)} · ${esc(next.title)}` : 'Edit plan to add a block'}</div>`;
  }
  const curFocus = cur && FOCUS.find(f => f.id === cur.link);
  let actions = '';
  if (curFocus && r?.id !== curFocus.id) actions += `<button class="primary" data-start="${curFocus.id}" aria-label="Start ${esc(curFocus.label)} timer">▶ Start</button>`;
  if (cur?.link === 'quran' && d.quran < GOALS.quran) actions += `<button data-quick="quran">+ Quran</button>`;
  if (cur?.link === 'call' && !d.call) actions += `<button data-quick="call">✓ Call</button>`;
  if (cur?.link === 'gym' && !d.gym) actions += `<button data-quick="gym">✓ Gym</button>`;
  if (cur?.link === 'pray') {
    const i = d.prayers.findIndex(p => !p);
    if (i >= 0) actions += `<button data-quick="pray" data-i="${i}">✓ ${PRAYERS[i]}</button>`;
  }

  const right = runF
    ? `<div class="label">FOCUS TIMER</div><div class="title">${esc(runF.label)}</div>
       <div class="running" id="run-clock">${fmtClock((Date.now() - r.start) / 1000)}</div>
       <div class="actions"><button data-start="${runF.id}" aria-label="Stop ${esc(runF.label)} timer">■ Stop</button></div>`
    : `<div class="label">FOCUS TIMER</div><div class="title muted">No timer</div>`;

  const remainingItems = (parts(k) || []).filter(([, v]) => v < 1).map(([n]) => n);
  const remaining = remainingItems.slice(0, 4).map(n => `<li>${esc(n)}</li>`).join('');
  const more = remainingItems.length > 4 ? `<li class="left-more">+${remainingItems.length - 4}</li>` : '';
  $('now-card').innerHTML = `<div class="now-grid"><div>${left}${actions ? `<div class="actions">${actions}</div>` : ''}</div><div>${right}</div></div>
    <div class="row-label">${remainingItems.length ? `${remainingItems.length} TO GO` : '✓ All done · Alhamdulillah'}</div>
    ${remainingItems.length ? `<ul class="left-list">${remaining}${more}</ul>` : ''}`;
}

function renderDeen() {
  const d = day();
  $('prayers').innerHTML = PRAYERS.map((p, i) => `<button class="chip ${d.prayers[i] ? 'on' : ''}" data-prayer="${i}">${d.prayers[i] ? '✓ ' : ''}${p}</button>`).join('');
  $('quran-val').textContent = d.quran;
  const call = $('call-btn');
  call.textContent = d.call ? '✓ Called' : '○ Call';
  call.classList.toggle('on', d.call);
  $('tasbih-val').textContent = d.tasbih;
  $('tasbih-label').textContent = `/ ${GOALS.tasbih}`;
  $('tasbih-btn').classList.toggle('done', d.tasbih >= GOALS.tasbih);
}

function renderFocus() {
  const k = todayKey(), d = day(k);
  $('focus-list').innerHTML = FOCUS.map(f => {
    const m = focusMins(d, f.id, k);
    const on = state.running?.id === f.id;
    return `<div class="focus ${on ? 'running' : ''}">
      <div><div class="name">${esc(f.label)}</div><div class="time" data-ftime="${f.id}">${fmtMin(m)} / ${fmtMin(f.goal)}</div></div>
      <div class="ctrls"><button data-adj="${f.id}" data-v="-15" aria-label="Subtract 15 minutes from ${esc(f.label)}">−15</button><button data-adj="${f.id}" data-v="15" aria-label="Add 15 minutes to ${esc(f.label)}">+15</button><button class="play" data-start="${f.id}" aria-label="${on ? 'Stop' : 'Start'} ${esc(f.label)} timer">${on ? '■' : '▶'}</button></div>
      <div class="bar"><i data-fbar="${f.id}" style="width:${pct(Math.min(m / f.goal, 1))}"></i></div>
    </div>`;
  }).join('');
}

function renderBody() {
  const k = todayKey(), d = day(k);
  const kcal = kcalOf(d);
  $('kcal-total').textContent = `${num(kcal)} · ${kcal <= GOALS.kcal ? `${num(GOALS.kcal - kcal)} left` : `${num(kcal - GOALS.kcal)} over`}`;
  const kb = $('kcal-bar'); kb.style.width = pct(Math.min(kcal / GOALS.kcal, 1)); kb.classList.toggle('over', kcal > GOALS.kcal);
  $('food-list').innerHTML = d.food.map((f, i) => `<li><span>${esc(f.name || 'Food')}</span><span>${num(f.kcal)} <button class="x" data-delfood="${i}" aria-label="Remove ${esc(f.name || 'food')}">✕</button></span></li>`).join('');

  $('steps-total').textContent = `${num(d.steps)} · ${pct(Math.min(d.steps / GOALS.steps, 1))}`;
  $('steps-bar').style.width = pct(Math.min(d.steps / GOALS.steps, 1));

  const ws = weekStart(k);
  $('gym-dots').innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
    const dk = addDays(ws, i);
    return `<span class="${state.days[dk]?.gym ? 'on' : ''} ${dk === k ? 'today' : ''}">${l}</span>`;
  }).join('');
  const g = gymThisWeek();
  $('gym-week').textContent = `${g}/${GOALS.gymPerWeek} this week`;
  const gb = $('gym-btn'); gb.textContent = d.gym ? '✓ Done' : '+ Log session'; gb.setAttribute('aria-label', d.gym ? 'Gym session complete' : 'Log gym session'); gb.classList.toggle('on', d.gym);

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
      <div class="g-label">${done ? '<span class="ok-mark">✓</span> ' : ''}${t.label}</div><div class="g-sub ${t.warn ? 'warn' : ''}">${esc(t.sub)}</div></div>`;
  }).join('');
}

let trendRange = (() => { try { return localStorage.getItem('takeover.range') || '14'; } catch { return '14'; } })();
let trendPeriod = (() => {
  try {
    const value = localStorage.getItem('takeover.period');
    return ['day', 'week', 'month'].includes(value) ? value : 'day';
  } catch { return 'day'; }
})();
function rangeKeys() {
  const k = todayKey();
  if (trendRange === 'all') {
    const n = Math.max(1, Math.min(diffDays(state.startDate, k) + 1, GOALS.days));
    return Array.from({ length: n }, (_, i) => addDays(state.startDate, i));
  }
  const n = Number(trendRange);
  return Array.from({ length: n }, (_, i) => addDays(k, i - n + 1));
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
  const loggedKeys = Object.keys(state.days || {}).filter(k => k <= today && hasProgress(state.days[k])).sort();
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
    const loggedKeys = keys.filter(k => hasProgress(state.days[k]));
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
  $('period-summary').innerHTML = stats.map(([label, value, sub]) => `<div class="period-stat"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`).join('');

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
    insight = ['✦', 'Your story starts here', `Log a day to see your ${trendPeriod} trend.`];
  } else if (previousAverage == null) {
    insight = ['✦', 'Building your baseline', 'Keep logging to unlock a period comparison.'];
  } else {
    const change = Math.round(averageScore - previousAverage);
    const direction = change > 1 ? '↗' : change < -1 ? '↘' : '→';
    const title = change > 1 ? `Up ${change} points` : change < -1 ? `Down ${Math.abs(change)} points` : 'Holding steady';
    insight = [direction, title, `Compared with the previous ${count} ${periodLabel}.`];
  }
  $('period-insight').innerHTML = `<span class="insight-symbol" aria-hidden="true">${insight[0]}</span><div><small>THE TREND</small><b>${insight[1]}</b><span>${insight[2]}</span></div>`;
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
  const t = nowMin(), cur = blockAt(plan, t);
  $('timeline').innerHTML = plan.map(b => {
    const cls = b === cur ? 'now' : (b.e <= t ? 'past' : '');
    const done = linkDone(b.link, d, k);
    return `<li class="${cls}"><span class="t">${esc(b.from)}<span class="to">–${esc(b.to)}</span></span><span>${esc(b.title)}</span><span class="ok">${done ? '✓' : ''}</span></li>`;
  }).join('');
}

function renderExams() {
  const k = todayKey();
  const list = state.exams.map((e, i) => ({ ...e, i, left: diffDays(k, e.date) })).sort((a, b) => a.date.localeCompare(b.date));
  $('exam-list').innerHTML = list.length ? list.map(e => {
    const cls = e.left < 0 ? '' : e.left <= 3 ? 'soon' : e.left <= 7 ? 'near' : '';
    const label = e.left < 0 ? 'done' : e.left === 0 ? 'TODAY' : e.left === 1 ? 'tomorrow' : `in ${e.left} days`;
    return `<li><span class="grow">${esc(e.name)} <span class="muted small">${parseKey(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></span><span class="badge ${cls}">${label}</span><button class="x" data-delexam="${e.i}" aria-label="remove">✕</button></li>`;
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
      ${left ? `<button data-pay="${i}" aria-label="Record payment from ${esc(d.name)}">✓ Paid</button>` : ''}
      <button class="x" data-deldebt="${i}" aria-label="remove">✕</button></li>`;
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
  const k = todayKey();
  const end = addDays(state.startDate, GOALS.days - 1);
  const dayN = diffDays(state.startDate, k) + 1;
  $('cal-progress').textContent = dayN >= 1 && dayN <= GOALS.days
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
    const ch = dk >= state.startDate && dk <= end;
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
    <span class="muted small">${[calSel === k ? 'Today' : calSel > k ? inDays(diffDays(k, calSel)) : '', chN >= 1 && chN <= GOALS.days ? `Challenge day ${chN}` : '', sd && calSel <= k ? `Score ${pct(score(calSel))}` : ''].filter(Boolean).join(' · ')}</span></div>
    <ul class="list">${items.length ? items.map(e => `<li><i class="dot-key ${e.kind === 'exam' ? 's2' : 's1'}"></i><span class="grow">${e.time ? `<span class="muted mono">${esc(e.time)}</span> ` : ''}${esc(e.title)}${e.kind === 'exam' ? ' <span class="badge">exam</span>' : ''}</span><button class="x" data-del-item="${e.kind}:${e.i}" aria-label="Remove">✕</button></li>`).join('') : '<li class="muted small">No events</li>'}</ul>`;

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
  renderHeader(); renderNow(); renderDeen(); renderFocus(); renderBody();
  renderGlance(); renderWeight(); renderTimeline(); renderTrends(); renderExams(); renderMoney(); renderCalendar(); renderSettings();
}

/* Lightweight per-second refresh: only the live numbers. */
let lastMinute = -1, lastDay = todayKey();
function tick() {
  const now = new Date();
  if (todayKey() !== lastDay) { lastDay = todayKey(); render(); return; }
  if (now.getMinutes() !== lastMinute) { lastMinute = now.getMinutes(); renderHeader(); renderNow(); renderTimeline(); renderGlance(); return; }
  const r = state.running;
  if (r) {
    const rc = $('run-clock'); if (rc) rc.textContent = fmtClock((Date.now() - r.start) / 1000);
    const f = FOCUS.find(x => x.id === r.id), d = day(r.day);
    const m = focusMins(d, f.id, r.day);
    const ft = document.querySelector(`[data-ftime="${f.id}"]`); if (ft) ft.textContent = `${fmtMin(m)} / ${fmtMin(f.goal)}`;
    const fb = document.querySelector(`[data-fbar="${f.id}"]`); if (fb) fb.style.width = pct(Math.min(m / f.goal, 1));
  }
}

/* ---------- Events ---------- */
function commit(msg) { save(); render(); if (msg) toast(msg); }

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = day();
  const ds = b.dataset;
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
  if (ds.step && b.parentElement.dataset.field === 'quran') { d.quran = Math.max(0, d.quran + Number(ds.step)); return commit(); }

  switch (b.id) {
    case 'call-btn': d.call = !d.call; return commit();
    case 'gym-btn': d.gym = !d.gym; return commit(d.gym ? 'Gym logged 💪' : '');
    case 'tasbih-btn':
      d.tasbih++;
      if (navigator.vibrate) navigator.vibrate(d.tasbih % 33 === 0 ? 60 : 10);
      save(); renderDeen(); renderHeader(); renderGlance();
      if (d.tasbih === GOALS.tasbih) toast('100 tasbihat — SubhanAllah 🤍');
      return;
    case 'tasbih-undo': d.tasbih = Math.max(0, d.tasbih - 1); return commit();
    case 'tasbih-33': d.tasbih += 33; return commit();
    case 'edit-plan': {
      const ed = $('plan-editor'); ed.hidden = !ed.hidden;
      if (!ed.hidden) $('plan-text').value = state.plan;
      b.textContent = ed.hidden ? 'edit' : 'close';
      return;
    }
    case 'plan-save': {
      const text = $('plan-text').value;
      const n = parsePlan(text).length;
      if (!n) return toast('No valid lines — use HH:MM-HH:MM | Title | link');
      state.plan = text; $('plan-editor').hidden = true; $('edit-plan').textContent = 'edit';
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
    state = { ...freshState(), ...data };
    commit('Backup restored');
  } catch { toast('That file is not a Takeover backup'); }
  e.target.value = '';
});

/* ---------- iOS Shortcut sync: ?steps=12345&sleep=7.5&screen=180 ---------- */
function applyUrlParams() {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].length) return;
  const k = /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') || '') ? p.get('date') : todayKey();
  const d = day(k), got = [];
  const n = name => { const v = Number(p.get(name)); return p.has(name) && Number.isFinite(v) && v >= 0 ? v : null; };
  if (n('steps') != null) { d.steps = Math.round(n('steps')); got.push(`${num(d.steps)} steps`); }
  if (n('sleep') != null) { d.sleep = Math.round(n('sleep') * 4) / 4; got.push(`${d.sleep}h sleep`); }
  if (n('screen') != null) { d.screen = Math.round(n('screen')); got.push(`${d.screen}m screen`); }
  history.replaceState(null, '', location.pathname);
  if (got.length) { save(); setTimeout(() => toast(`Synced: ${got.join(', ')}`), 300); }
}

// Hooks for sync.js
window.Takeover = {
  get state() { return state; },
  set state(v) { state = { ...freshState(), ...v }; },
  save, render, toast,
};

C.initTooltip();
applyUrlParams();
save(false);
render();
setInterval(tick, 1000);

/* Keep the compact section dock in sync with the section on screen. */
const quickLinks = [...document.querySelectorAll('.quick-nav a')];
function activateQuickLink(hash) {
  quickLinks.forEach(link => {
    const active = link.hash === hash;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
activateQuickLink(location.hash || '#overview');
const observedSections = new Map();
if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => observedSections.set(entry.target, entry.isIntersecting));
    const visible = [...observedSections].filter(([, shown]) => shown).map(([section]) => section)
      .sort((a, b) => Math.abs(a.getBoundingClientRect().top - innerHeight * .23) - Math.abs(b.getBoundingClientRect().top - innerHeight * .23));
    if (visible[0]) activateQuickLink(`#${visible[0].id}`);
  }, { rootMargin: '-18% 0px -72% 0px', threshold: 0 });
  quickLinks.forEach(link => {
    const section = document.querySelector(link.hash);
    if (section) sectionObserver.observe(section);
  });
}
window.addEventListener('hashchange', () => activateQuickLink(location.hash || '#overview'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  state = load(); render();
  window.TakeoverSync?.pull();
});
