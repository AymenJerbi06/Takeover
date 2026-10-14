'use strict';
/* Home helpers shared by the 40-day and personal dashboards:
   - a category strip (one icon per category, ringed by today's progress) that filters the habit list
   - in-app notifications computed from the user's own logs: time left, strong-day distance,
     a 3-day insight and upcoming dates. Nothing leaves the device. */
(() => {
  const icon = name => window.TakeoverIcons.svg(name);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = x => `${Math.round(x * 100)}%`;
  const FILTER_KEY = 'takeover.home.filter', SEEN_KEY = 'takeover.notes.seen';
  let filter = (() => { try { return sessionStorage.getItem(FILTER_KEY) || 'all'; } catch { return 'all'; } })();

  /* ---------- Category strip (Hick's law: pick one area instead of scanning every habit) ---------- */
  function categoryStrip(categories, overall) {
    if (categories.length < 2) return '';
    // "All" is not a category: a plain grid symbol, no ring (the hero already shows the day's score).
    const tile = (id, title, glyph, tone, frac) => `<button type="button" class="home-category ${frac >= 1 ? 'is-complete' : ''}" data-home-filter="${id}" aria-pressed="${filter === id}">
      <span class="category-ring ${tone}" style="--p:${frac === null ? 0 : Math.round(Math.min(1, frac || 0) * 100)}%"><span class="profile-feature-icon ${tone}">${icon(glyph)}</span>${frac >= 1 ? `<span class="category-done" aria-hidden="true">${icon('check')}</span>` : ''}</span>
      <span class="category-label">${esc(title)}</span>${frac === null ? '' : `<span class="sr-only">, ${frac >= 1 ? 'complete' : `${pct(frac || 0)} today`}</span>`}</button>`;
    return `<nav class="home-categories" aria-label="Categories">${tile('all', 'All', 'more', 'neutral', null)}${categories.map(c => tile(c.id, c.title, c.icon, c.tone, c.frac)).join('')}</nav>`;
  }
  function applyFilter(root) {
    if (!root) return;
    const ids = [...root.querySelectorAll('[data-home-filter]')].map(b => b.dataset.homeFilter);
    const active = ids.includes(filter) ? filter : 'all';
    root.querySelectorAll('[data-home-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.homeFilter === active)));
    // With one category shown the list title names it, so its group label would only repeat it.
    root.querySelectorAll('[data-category]').forEach(node => {
      node.hidden = active !== 'all' && (node.dataset.category !== active || node.classList.contains('habit-group'));
    });
    const list = root.querySelector('.habit-list-title');
    if (list) list.textContent = active === 'all' ? 'Your habits' : root.querySelector(`[data-home-filter="${active}"] .category-label`)?.textContent || 'Your habits';
  }
  document.addEventListener('click', event => {
    const tile = event.target.closest('[data-home-filter]');
    if (!tile) return;
    filter = tile.dataset.homeFilter === filter && filter !== 'all' ? 'all' : tile.dataset.homeFilter;
    try { sessionStorage.setItem(FILTER_KEY, filter); } catch { /* per-tab preference only */ }
    const root = tile.closest('.personal-root');
    applyFilter(root);
    // Rows that just appeared settle in, in reading order.
    [...root.querySelectorAll('.personal-habit:not([hidden])')].slice(0, 6).forEach((row, i) => window.TakeoverMotion?.reveal(row, i * 35));
  });

  /* ---------- One view of either dashboard, for notifications ---------- */
  const P = () => window.TakeoverPersonal;
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d); };
  function model() {
    const s = window.Takeover?.state; if (!s) return null;
    const k = dateKey(new Date());
    if (s.experience === 'personal') {
      if (!s.personalPlan) return null;
      const habits = P().scheduledHabits(s, k);
      return {
        k, start: s.personalPlan.startedOn, score: key => P().dayScore(s, key),
        remaining: habits.filter(h => P().value(s, k, h.id) < h.target).map(h => h.title), total: habits.length,
        // [name, done] for each scheduled habit on a day
        results: key => P().scheduledHabits(s, key).map(h => [h.title, P().value(s, key, h.id) >= h.target]),
      };
    }
    if (typeof todayGoals !== 'function') return null;
    const goals = todayGoals(k).filter(g => !g.weekly);
    return {
      k, start: s.startDate, score: key => key >= s.startDate && key <= k ? score(key) : null,
      remaining: goals.filter(g => !g.done).map(g => g.title), total: goals.length,
      results: key => (parts(key) || []).map(([name, v]) => [name, v >= 1]), legacy: true,
    };
  }

  function notes() {
    const m = model(); if (!m) return [];
    const s = window.Takeover.state, out = [], now = new Date();
    const minutesLeft = 24 * 60 - (now.getHours() * 60 + now.getMinutes());
    const hoursLeft = Math.max(1, Math.ceil(minutesLeft / 60));
    const today = m.score(m.k);
    const list = names => names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');

    // 1. Time left today (Zeigarnik: name what is unfinished; Scarcity only when it is real).
    if (m.total && !m.remaining.length) {
      out.push({ id: `done-${m.k}`, tone: 'mint', glyph: 'checkCircle', title: 'You showed up today', body: `All ${m.total} goals are done. Enjoy the rest of your day.`, when: 'Today', go: 'progress', action: 'See your week' });
    } else if (m.total && now.getHours() >= 12) {
      const bucket = hoursLeft <= 1 ? 1 : hoursLeft <= 3 ? 3 : hoursLeft <= 6 ? 6 : 12;
      out.push({ id: `left-${m.k}-${bucket}`, tone: hoursLeft <= 3 ? 'coral' : 'amber', glyph: 'focus',
        title: hoursLeft <= 3 ? `Only ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} left today` : `${hoursLeft} hours left today`,
        body: `${m.remaining.length} of ${m.total} goals to go: ${list(m.remaining)}.`, when: 'Now', go: 'today', filter: 'all', action: 'Open your habits' });
    }
    // 2. Distance to a strong day (80%), which is what keeps a streak alive.
    if (today !== null && today < 0.8 && m.total) {
      out.push({ id: `strong-${m.k}`, tone: 'blue', glyph: 'streak', title: `${Math.ceil((0.8 - today) * 100)} points from a strong day`,
        body: `You're at ${pct(today)}. A day counts toward your streak at 80%.`, when: 'Today', go: 'today', filter: 'all', action: 'Pick a habit' });
    }
    // 3. Three-day insight: last three finished days against the three before.
    const days = n => Array.from({ length: 3 }, (_, i) => shift(m.k, -(n + i))).filter(key => key >= m.start);
    const recent = days(1), earlier = days(4);
    const avg = keys => { const v = keys.map(m.score).filter(x => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const a = avg(recent);
    if (a !== null) {
      const b = avg(earlier), tally = new Map();
      recent.forEach(key => m.results(key).forEach(([name, done]) => { const t = tally.get(name) || [0, 0]; t[0] += done ? 1 : 0; t[1]++; tally.set(name, t); }));
      const ranked = [...tally].sort((x, y) => y[1][0] / y[1][1] - x[1][0] / x[1][1]);
      const best = ranked[0], worst = ranked[ranked.length - 1];
      const trend = b === null ? '' : Math.abs(a - b) < 0.01 ? ', level with the 3 days before' : `, ${a > b ? 'up' : 'down'} ${Math.round(Math.abs(a - b) * 100)} points from the 3 days before`;
      out.push({ id: `insight-${m.k}`, tone: 'violet', glyph: 'progress', title: `${recent.length}-day insight`,
        body: `You averaged ${pct(a)}${trend}.${best && best[1][0] ? ` Strongest: ${best[0]} (${best[1][0]}/${best[1][1]} days).` : ''}${worst && worst !== best && worst[1][0] < worst[1][1] ? ` Needs attention: ${worst[0]} (${worst[1][0]}/${worst[1][1]} days).` : ''}`,
        when: 'Today', go: 'progress', action: 'See the details' });
    }
    // 4. Upcoming exams and events in the next week.
    const soon = [...(s.exams || []).map(e => ({ kind: 'Exam', name: e.name, date: e.date, time: e.time })), ...(s.events || []).map(e => ({ kind: e.type === 'exam' ? 'Exam' : 'Event', name: e.title, date: e.date, time: e.time }))]
      .map(e => ({ ...e, inDays: Math.round((new Date(`${e.date}T12:00:00`) - new Date(`${m.k}T12:00:00`)) / 86400000) }))
      .filter(e => e.date && e.inDays >= 0 && e.inDays <= 7).sort((x, y) => x.inDays - y.inDays).slice(0, 3);
    soon.forEach(e => out.push({ id: `date-${e.kind}-${e.name}-${e.date}`, tone: e.kind === 'Exam' ? 'amber' : 'blue', glyph: e.kind === 'Exam' ? 'exams' : 'calendar',
      title: `${e.kind}: ${e.name}`, body: e.inDays === 0 ? `Today${e.time ? ` at ${e.time}` : ''}.` : e.inDays === 1 ? `Tomorrow${e.time ? ` at ${e.time}` : ''}.` : `In ${e.inDays} days.`,
      when: e.inDays === 0 ? 'Today' : `${e.inDays}d`, go: 'planner', action: 'Open your plan' }));
    // 5. Weekly gym pace on the 40-day dashboard.
    if (m.legacy && typeof gymThisWeek === 'function') {
      const done = gymThisWeek(), left = 7 - ((now.getDay() + 6) % 7);
      if (done < GOALS.gymPerWeek && GOALS.gymPerWeek - done >= left - 1)
        out.push({ id: `gym-${m.k.slice(0, 8)}${done}-${left}`, tone: 'mint', glyph: 'body', title: `${done} of ${GOALS.gymPerWeek} gym sessions this week`,
          body: `${left} day${left === 1 ? '' : 's'} left in the week to fit in ${GOALS.gymPerWeek - done} more.`, when: 'This week', go: 'today', filter: 'body', action: 'Open Body' });
    }
    return out;
  }

  /* ---------- Bell badge and sheet ---------- */
  const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } };
  function refreshBadge() {
    const badge = document.getElementById('notify-badge'), bell = document.getElementById('notify-trigger');
    if (!badge || !bell) return;
    const items = notes(), known = seen(), unseen = items.filter(n => !known.has(n.id)).length;
    badge.hidden = !unseen; badge.textContent = unseen > 9 ? '9+' : String(unseen);
    bell.setAttribute('aria-label', unseen ? `Notifications, ${unseen} new` : 'Notifications');
  }
  function openNotifications() {
    const dialog = document.getElementById('routine-dialog'); if (!dialog) return;
    const items = notes(), known = seen();
    const opening = !dialog.open;
    dialog.innerHTML = `<div class="routine-sheet notes-sheet"><div class="sheet-handle" aria-hidden="true"></div><button class="sheet-close" type="button" data-personal-action="close" aria-label="Close">${icon('close')}</button>
      <h2 id="routine-dialog-title" tabindex="-1">Notifications</h2><p class="account-note">From your own progress, updated as you log.</p>
      <div class="notes-list">${items.length ? items.map(n => `<button type="button" class="note ${known.has(n.id) ? '' : 'is-new'}" data-note-go="${n.go}" ${n.filter ? `data-note-filter="${n.filter}"` : ''}><span class="profile-feature-icon ${n.tone}">${icon(n.glyph)}</span><span class="note-copy"><span class="note-head"><b>${esc(n.title)}</b><small>${esc(n.when)}</small></span><span class="note-body">${esc(n.body)}</span><span class="note-action">${esc(n.action)} ${icon('chevronRight')}</span></span></button>`).join('')
        : `<div class="notes-empty">${icon('bell')}<b>You're all caught up</b><p class="account-note">Reminders and insights appear here as your days fill in.</p></div>`}</div></div>`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('h2')?.focus({ preventScroll: true });
    window.TakeoverMotion?.sheet(dialog, opening);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...known, ...items.map(n => n.id)])].slice(-200))); } catch { /* badge resets next load */ }
    refreshBadge();
    // The new markers fade after a moment so the next visit reads as caught up.
    setTimeout(() => dialog.querySelectorAll('.note.is-new').forEach(n => n.classList.add('is-read')), 1600);
  }
  // Tapping a notification goes where it points (Jakob, Tesler): the open habits, Progress or Plan.
  function follow(note) {
    const dialog = document.getElementById('routine-dialog');
    const go = () => {
      if (note.dataset.noteFilter) { filter = note.dataset.noteFilter; try { sessionStorage.setItem(FILTER_KEY, filter); } catch { /* per-tab */ } }
      window.Takeover.navigate(note.dataset.noteGo);
      document.querySelectorAll('.personal-root').forEach(applyFilter);
      if (note.dataset.noteGo === 'today') requestAnimationFrame(() => document.querySelector('.personal-root:not([hidden]) .home-categories, #legacy-today .home-categories')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    };
    if (window.TakeoverMotion && dialog.open) { window.TakeoverMotion.closeSheet(dialog); setTimeout(go, 120); } else { dialog.close(); go(); }
  }
  document.addEventListener('click', event => {
    if (event.target.closest('#notify-trigger')) { event.preventDefault(); openNotifications(); return; }
    const note = event.target.closest('[data-note-go]');
    if (note) { follow(note); return; }
    clearTimeout(refreshBadge.timer); refreshBadge.timer = setTimeout(refreshBadge, 150);
  });
  setInterval(refreshBadge, 60000);
  addEventListener('load', () => setTimeout(refreshBadge, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadge(); });

  window.TakeoverHome = { categoryStrip, applyFilter, notes, refreshBadge, openNotifications };
})();
