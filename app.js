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
    left = `<div class="label">Scheduled now · ${esc(cur.from)}–${esc(cur.to)}</div>
      <div class="title">${esc(cur.title)}</div>
      <div class="meta">${fmtMin(remain)} left in this block${next && next !== cur ? ` · next: ${esc(next.from)} ${esc(next.title)}` : ''}</div>`;
  } else {
    left = `<div class="label">Free time</div><div class="title">Nothing scheduled</div>
      <div class="meta">${next ? `Next: ${esc(next.from)} ${esc(next.title)}` : 'Add blocks in Today’s plan'}</div>`;
  }
  const curFocus = cur && FOCUS.find(f => f.id === cur.link);
  let actions = '';
  if (curFocus && r?.id !== curFocus.id) actions += `<button class="primary" data-start="${curFocus.id}">▶ Start ${esc(curFocus.label)}</button>`;
  if (cur?.link === 'quran' && d.quran < GOALS.quran) actions += `<button data-quick="quran">+1 Quran page</button>`;
  if (cur?.link === 'call' && !d.call) actions += `<button data-quick="call">✓ Called parents</button>`;
  if (cur?.link === 'gym' && !d.gym) actions += `<button data-quick="gym">✓ Gym done</button>`;
  if (cur?.link === 'pray') {
    const i = d.prayers.findIndex(p => !p);
    if (i >= 0) actions += `<button data-quick="pray" data-i="${i}">✓ Prayed ${PRAYERS[i]}</button>`;
  }

  const right = runF
    ? `<div class="label">Currently doing</div><div class="title">${esc(runF.label)}</div>
       <div class="running" id="run-clock">${fmtClock((Date.now() - r.start) / 1000)}</div>
       <div class="actions"><button data-start="${runF.id}">■ Stop</button></div>`
    : `<div class="label">Currently doing</div><div class="title muted">No timer running</div>
       <div class="meta">Start one when you sit down to work — it keeps you honest.</div>`;

  const remaining = (parts(k) || []).filter(([, v]) => v < 1).map(([n]) => `<li>${esc(n)}</li>`).join('');
  $('now-card').innerHTML = `<div class="now-grid"><div>${left}${actions ? `<div class="actions">${actions}</div>` : ''}</div><div>${right}</div></div>
    <div class="row-label">${remaining ? 'Still to do today' : 'Everything done today. Alhamdulillah 🎉'}</div>
    ${remaining ? `<ul class="left-list">${remaining}</ul>` : ''}`;
}

function renderDeen() {
  const d = day();
  $('prayers').innerHTML = PRAYERS.map((p, i) => `<button class="chip ${d.prayers[i] ? 'on' : ''}" data-prayer="${i}">${d.prayers[i] ? '✓ ' : ''}${p}</button>`).join('');
  $('quran-val').textContent = d.quran;
  const call = $('call-btn');
  call.textContent = d.call ? '✓ Called today' : 'Not yet';
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
      <div class="ctrls"><button data-adj="${f.id}" data-v="-15" aria-label="minus 15 minutes">−15</button><button data-adj="${f.id}" data-v="15" aria-label="plus 15 minutes">+15</button><button class="play" data-start="${f.id}">${on ? '■' : '▶'}</button></div>
      <div class="bar"><i data-fbar="${f.id}" style="width:${pct(Math.min(m / f.goal, 1))}"></i></div>
    </div>`;
  }).join('');
}

function renderBody() {
  const k = todayKey(), d = day(k);
  const kcal = kcalOf(d);
  $('kcal-total').textContent = `${num(kcal)} · ${kcal <= GOALS.kcal ? `${num(GOALS.kcal - kcal)} left` : `${num(kcal - GOALS.kcal)} over`}`;
  const kb = $('kcal-bar'); kb.style.width = pct(Math.min(kcal / GOALS.kcal, 1)); kb.classList.toggle('over', kcal > GOALS.kcal);
  $('food-list').innerHTML = d.food.map((f, i) => `<li><span>${esc(f.name || 'Food')}</span><span>${num(f.kcal)} <button class="x" data-delfood="${i}" aria-label="remove">✕</button></span></li>`).join('');

  $('steps-total').textContent = `${num(d.steps)} · ${pct(Math.min(d.steps / GOALS.steps, 1))}`;
  $('steps-bar').style.width = pct(Math.min(d.steps / GOALS.steps, 1));

  const ws = weekStart(k);
  $('gym-dots').innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
    const dk = addDays(ws, i);
    return `<span class="${state.days[dk]?.gym ? 'on' : ''} ${dk === k ? 'today' : ''}">${l}</span>`;
  }).join('');
  const g = gymThisWeek();
  $('gym-week').textContent = `${g}/${GOALS.gymPerWeek} this week`;
  const gb = $('gym-btn'); gb.textContent = d.gym ? '✓ Trained today' : 'Mark gym session done'; gb.classList.toggle('on', d.gym);

  setIfIdle($('sleep-form').sleep, d.sleep ?? '');
  setIfIdle($('screen-form').screen, d.screen ?? '');
  setIfIdle($('steps-form').steps, d.steps || '');
}
function setIfIdle(input, v) { if (document.activeElement !== input) input.value = v; }

function renderWeight() {
  const w = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
  const start = state.startWeight ?? w[0]?.kg;
  const cur = w.at(-1)?.kg;
  const svg = $('weight-chart');
  if (start == null) {
    $('weight-summary').textContent = '— log your weight to start';
    svg.innerHTML = '';
    return;
  }
  const goal = start - GOALS.weightLoss;
  const lost = cur != null ? start - cur : 0;
  $('weight-summary').textContent = `${cur ?? start} kg now · ${lost >= 0 ? '−' : '+'}${Math.abs(lost).toFixed(1)} kg · goal ${goal.toFixed(1)} kg`;
  const pts = w.length ? w : [{ date: todayKey(), kg: start }];
  const vals = pts.map(p => p.kg).concat(start, goal);
  const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const y = v => 72 - ((v - lo) / (hi - lo)) * 64;
  const x = i => (pts.length === 1 ? 150 : 8 + (i / (pts.length - 1)) * 284);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join('');
  svg.innerHTML = `<line x1="0" x2="300" y1="${y(goal)}" y2="${y(goal)}"></line>
    <text x="4" y="${y(goal) - 3}">goal ${goal.toFixed(1)}</text>
    <path d="${path}"></path>${pts.length === 1 ? `<circle cx="150" cy="${y(pts[0].kg)}" r="3" fill="currentColor"></circle>` : ''}`;
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
  }).join('') : '<li class="muted">Add your three midterms so you can see the countdown.</li>';
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
      ${left ? `<button data-pay="${i}">Got paid</button>` : ''}
      <button class="x" data-deldebt="${i}" aria-label="remove">✕</button></li>`;
  }).join('');
}

function renderGrid() {
  const k = todayKey();
  let html = '';
  for (let i = 0; i < GOALS.days; i++) {
    const dk = addDays(state.startDate, i);
    const future = dk > k;
    const s = future ? 0 : score(dk);
    html += `<div class="${future ? 'future' : level(s)} ${dk === k ? 'today' : ''}" title="Day ${i + 1} · ${dk}${future ? '' : ` · ${pct(s)}`}">${i + 1}</div>`;
  }
  $('grid40').innerHTML = html;
}

function renderSettings() {
  setIfIdle($('start-date'), state.startDate);
  setIfIdle($('start-weight'), state.startWeight ?? '');
  setIfIdle($('currency'), state.currency);
  $('shortcut-url').textContent = `${location.origin}${location.pathname}?steps=`;
}

function render() {
  renderHeader(); renderNow(); renderDeen(); renderFocus(); renderBody();
  renderWeight(); renderTimeline(); renderExams(); renderMoney(); renderGrid(); renderSettings();
}

/* Lightweight per-second refresh: only the live numbers. */
let lastMinute = -1, lastDay = todayKey();
function tick() {
  const now = new Date();
  if (todayKey() !== lastDay) { lastDay = todayKey(); render(); return; }
  if (now.getMinutes() !== lastMinute) { lastMinute = now.getMinutes(); renderHeader(); renderNow(); renderTimeline(); return; }
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
      save(); renderDeen(); renderHeader();
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

applyUrlParams();
save(false);
render();
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  state = load(); render();
  window.TakeoverSync?.pull();
});
