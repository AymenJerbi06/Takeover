/* Pure, date-based personal routines. Versioned habits keep past targets intact. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TakeoverPersonal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parse = key => new Date(`${key}T12:00:00`);
  const shift = (key, days) => { const d = parse(key); d.setDate(d.getDate() + days); return dateKey(d); };
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const categories = [
    { id: 'fitness', title: 'Fitness', icon: 'body', tone: 'mint', idea: 'Move your body', unit: 'minutes' },
    { id: 'learning', title: 'Learning', icon: 'exams', tone: 'blue', idea: 'Focused study', unit: 'minutes' },
    { id: 'reading', title: 'Reading', icon: 'plan', tone: 'violet', idea: 'Read a few pages', unit: 'pages' },
    { id: 'faith', title: 'Faith & reflection', icon: 'spirit', tone: 'violet', idea: 'Make time for reflection', unit: 'minutes' },
    { id: 'money', title: 'Money', icon: 'wallet', tone: 'mint', idea: 'Review today’s spending', unit: 'times' },
    { id: 'wellbeing', title: 'Wellbeing', icon: 'sun', tone: 'coral', idea: 'Wind down without screens', unit: 'minutes' },
    { id: 'connection', title: 'Connection', icon: 'users', tone: 'coral', idea: 'Check in with someone', unit: 'times' },
    { id: 'other', title: 'Something else', icon: 'spark', tone: 'blue', idea: 'One small step', unit: 'times' }
  ];
  const category = id => categories.find(c => c.id === id) || categories[categories.length - 1];
  function scheduledHabits(state, key) {
    const plan = state.personalPlan;
    if (!plan || key < plan.startedOn) return [];
    return (plan.habits || []).filter(h => h.startsOn <= key && (!h.endsOn || key < h.endsOn) && h.days.includes(parse(key).getDay()));
  }
  const value = (state, key, id) => Math.max(0, Number(state.days?.[key]?.habits?.[id]) || 0);
  const dayParts = (state, key) => scheduledHabits(state, key).map(h => [h.title, clamp(value(state, key, h.id) / h.target)]);
  function dayScore(state, key) {
    const parts = dayParts(state, key);
    return parts.length ? parts.reduce((sum, [, v]) => sum + v, 0) / parts.length : null;
  }
  function suggestions(goals, context) {
    const minutes = Math.max(1, Math.min(15, Math.floor((Number(context.dailyMinutes) || 30) / Math.max(goals.length, 1))));
    return goals.map(g => {
      const c = category(g.category);
      return { category: c.id, title: c.id === 'other' && g.title ? `A small step for ${g.title}` : c.idea, target: c.unit === 'minutes' ? minutes : c.unit === 'pages' ? Math.min(5, minutes) : 1, unit: c.unit };
    });
  }
  function bounds(period, anchor) {
    const d = parse(anchor);
    if (period === 'month') {
      const start = `${anchor.slice(0, 7)}-01`;
      d.setMonth(d.getMonth() + 1, 1);
      return { start, end: shift(dateKey(d), -1) };
    }
    if (period === 'day') return { start: anchor, end: anchor };
    const start = shift(anchor, -((d.getDay() + 6) % 7));
    return { start, end: shift(start, 6) };
  }
  // Missing logs on scheduled days count as zero; future/rest days never do.
  function report(state, period, anchor = dateKey(new Date()), today = dateKey(new Date())) {
    const { start, end } = bounds(period, anchor);
    const days = [], habits = new Map();
    for (let key = start; key <= end; key = shift(key, 1)) {
      const scheduled = scheduledHabits(state, key), future = key > today;
      const score = !future && scheduled.length ? dayScore(state, key) : null;
      days.push({ key, score, future, count: scheduled.length });
      if (future) continue;
      scheduled.forEach(h => {
        const row = habits.get(h.id) || { ...h, scheduled: 0, completed: 0, total: 0 };
        row.scheduled++; row.completed += value(state, key, h.id) >= h.target ? 1 : 0;
        row.total += clamp(value(state, key, h.id) / h.target); habits.set(h.id, row);
      });
    }
    const scored = days.filter(d => d.score !== null), rows = [...habits.values()].map(h => ({ ...h, adherence: h.total / h.scheduled }));
    return { start, end, complete: end < today, days, habits: rows, scheduled: scored.length,
      average: scored.length ? scored.reduce((sum, d) => sum + d.score, 0) / scored.length : null,
      wins: scored.filter(d => d.score >= .8).length,
      points: scored.reduce((sum, d) => sum + Math.round(d.score * 100), 0),
      recommendations: rows.filter(h => h.scheduled >= 3 && h.adherence >= .85 && h.unit === 'minutes' && h.target < 60 && !h.endsOn
        && (state.personalPlan.habits || []).filter(item => !item.endsOn && item.unit === 'minutes').reduce((sum,item) => sum + item.target, 0) + 5 <= (state.personalPlan.context?.dailyMinutes || 30))
        .map(h => ({ id: h.id, title: h.title, target: Math.min(60, h.target + 5), unit: h.unit }))
    };
  }
  function streak(state, today = dateKey(new Date())) {
    let key = dayScore(state, today) >= .8 ? today : shift(today, -1), count = 0;
    const start = state.personalPlan?.startedOn || today;
    // Bound old imported plans without risking an unbounded browser loop.
    for (let i = 0; key >= start && i < 3660; i++, key = shift(key, -1)) {
      const score = dayScore(state, key);
      if (score === null) continue;
      if (score < .8) break;
      count++;
    }
    return count;
  }
  function commitment(state, today = dateKey(new Date())) {
    const rounds = state.personalPlan?.commitments || [];
    let kept = 0, lost = 0, pending = 0;
    for (const round of rounds) {
      let end = round.endsOn && round.endsOn < today ? round.endsOn : today;
      for (let key = round.startedOn, i = 0; key <= end && i < 3660; key = shift(key, 1), i++) {
        if (round.endsOn && key >= round.endsOn) continue;
        const score = dayScore(state, key);
        if (score === null) continue;
        if (key === today) pending += round.amount;
        else if (score >= 1) kept += round.amount;
        else lost += round.amount;
      }
    }
    return { kept, lost, pending };
  }
  return { dateKey, shift, categories, category, scheduledHabits, dayParts, dayScore, value, suggestions, bounds, report, streak, commitment };
});
