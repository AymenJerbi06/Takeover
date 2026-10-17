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
  // ---- Per-area planning: what someone wants to improve + the time they have -> habit options ----
  const UNITS = ['times', 'minutes', 'pages', 'steps', 'hours', 'sessions', 'glasses'];
  // Quick answers to "What do you want to improve in ...?" (tap to fill in).
  const aims = {
    fitness: ['Lose weight', 'Build strength', 'Have more energy', 'Move more every day'],
    learning: ['Do well in my exams', 'Learn to code', 'Learn a language', 'Finish an online course'],
    reading: ['Read more books', 'Read every day', 'Read instead of scrolling'],
    faith: ['Pray on time', 'Read Quran every day', 'Make more dhikr', 'Feel calmer and grateful'],
    money: ['Save money', 'Pay off debt', 'Spend less', 'Earn extra income'],
    wellbeing: ['Sleep better', 'Less screen time', 'Feel less stressed', 'Drink more water'],
    connection: ['Stay close to my family', 'See friends more', 'Be kinder to people'],
  };
  const daysFor = n => ({ 7: [0,1,2,3,4,5,6], 6: [1,2,3,4,5,6], 5: [1,2,3,4,5], 4: [1,2,4,5], 3: [1,3,5], 2: [2,5], 1: [6] })[Math.max(1, Math.min(7, Math.round(n) || 7))];
  const round5 = n => Math.max(5, Math.round(n / 5) * 5);
  // Each idea: [keywords (empty = fits any aim), title, unit, target from minutes m, days per week (null = the person's choice), group (ideas in a group are alternatives)].
  const catalog = {
    fitness: [
      [['weight', 'lose', 'fat', 'slim'], 'Walk every day', 'steps', m => Math.min(20000, 6000 + m * 150), 7, 'walk'],
      [['weight', 'lose', 'fat', 'slim', 'eat'], 'Log everything you eat', 'times', () => 3, 7],
      [['weight', 'lose', 'sugar', 'eat'], 'Skip sugary drinks', 'times', () => 1, 7],
      [['strength', 'strong', 'muscle', 'gym'], 'Strength training', 'sessions', () => 1, 3],
      [['strength', 'strong', 'muscle'], 'Push-ups', 'times', m => Math.min(100, 10 + m), null],
      [['energy', 'tired'], 'Morning stretch', 'minutes', () => 10, 7],
      [[], 'Workout', 'minutes', m => round5(m), null],
      [[], 'Walk', 'steps', m => Math.min(15000, 5000 + m * 100), 7, 'walk'],
      [[], 'Stretch', 'minutes', () => 10, null],
      [[], 'Drink water', 'glasses', () => 8, 7],
    ],
    learning: [
      [['exam', 'university', 'school', 'class', 'study', 'grade'], 'Focused study block', 'minutes', m => round5(m), null, 'study'],
      [['exam', 'university', 'school', 'class', 'grade'], 'Practice questions', 'times', m => Math.max(5, Math.min(30, Math.round(m / 4))), null],
      [['exam', 'university', 'school', 'class'], 'Review today’s notes', 'minutes', () => 15, 5],
      [['code', 'coding', 'program', 'developer', 'dev', 'web'], 'Code on a project', 'minutes', m => round5(m), null],
      [['code', 'coding', 'program', 'developer', 'dev'], 'Solve a coding exercise', 'times', () => 1, null],
      [['language', 'english', 'french', 'arabic', 'spanish'], 'Language practice', 'minutes', m => round5(Math.min(m, 30)), 7],
      [['language', 'english', 'french', 'arabic', 'spanish'], 'Learn new words', 'times', () => 10, 7],
      [['course', 'online'], 'Watch a course lesson', 'times', () => 1, null],
      [[], 'Focused learning', 'minutes', m => round5(m), null, 'study'],
      [[], 'Write down one thing you learned', 'times', () => 1, 7],
      [[], 'Review what you learned', 'minutes', () => 10, null],
    ],
    reading: [
      [[], 'Read', 'pages', m => Math.max(5, Math.round(m * 0.8)), 7],
      [[], 'Read before bed', 'minutes', m => round5(Math.min(m, 30)), 7],
      [['book', 'books', 'finish'], 'Finish a chapter', 'times', () => 1, null],
      [['scroll', 'phone'], 'Read instead of your phone in the morning', 'minutes', () => 10, 7],
      [[], 'Note one idea from what you read', 'times', () => 1, null],
    ],
    faith: [
      [['pray', 'prayer', 'salah', 'salat', 'time'], 'Pray the five daily prayers', 'times', () => 5, 7],
      [['quran', 'koran'], 'Read Quran', 'pages', m => Math.max(1, Math.min(20, Math.round(m / 4))), 7],
      [['dhikr', 'tasbih', 'zikr', 'remember'], 'Dhikr / tasbih', 'times', () => 100, 7],
      [['calm', 'grateful', 'gratitude', 'peace'], 'Write three things you’re grateful for', 'times', () => 3, 7],
      [[], 'Quiet reflection', 'minutes', m => round5(Math.min(m, 20)), 7],
      [[], 'Learn about your faith', 'minutes', m => round5(Math.min(m, 30)), null],
      [[], 'Do one good deed', 'times', () => 1, 7],
    ],
    money: [
      [['save', 'saving'], 'Put money aside', 'times', () => 1, null],
      [['debt', 'owe', 'loan'], 'Pay something toward a debt', 'times', () => 1, 1],
      [['spend', 'less', 'budget'], 'No-spend day', 'times', () => 1, 3],
      [['earn', 'income', 'side', 'business'], 'Work on extra income', 'minutes', m => round5(m), null],
      [[], 'Write down today’s spending', 'times', () => 1, 7],
      [[], 'Learn about money', 'minutes', m => round5(Math.min(m, 20)), null],
      [[], 'Check your budget', 'minutes', () => 10, 1],
    ],
    wellbeing: [
      [['sleep', 'tired', 'rest'], 'Sleep', 'hours', () => 8, 7, 'sleep'],
      [['sleep', 'screen', 'phone'], 'No screens before bed', 'minutes', () => 30, 7],
      [['screen', 'phone', 'social'], 'Phone-free time', 'minutes', m => round5(Math.max(m, 30)), 7],
      [['stress', 'calm', 'anxious', 'anxiety'], 'Breathing or meditation', 'minutes', m => round5(Math.min(m, 15)), 7],
      [['water', 'hydrate'], 'Drink water', 'glasses', () => 8, 7],
      [[], 'Time outside', 'minutes', m => round5(Math.min(m, 30)), null],
      [[], 'Journal for a few minutes', 'minutes', () => 5, 7],
      [[], 'Sleep', 'hours', () => 7, 7, 'sleep'],
      [[], 'Stretch and unwind', 'minutes', () => 10, 7],
    ],
    connection: [
      [['family', 'parents', 'mom', 'dad'], 'Call your family', 'times', () => 1, 7],
      [['friend', 'friends'], 'Message a friend', 'times', () => 1, 7],
      [['friend', 'friends', 'see'], 'Spend time with friends', 'sessions', () => 1, 2],
      [['kind', 'help'], 'Do something kind for someone', 'times', () => 1, 7],
      [[], 'Check in with someone you care about', 'times', () => 1, 7],
      [[], 'Phone-free time with people', 'minutes', m => round5(Math.min(m, 60)), null],
    ],
  };
  // Five options for one area, fitted to the person's own words and time. Used when AI suggestions are unavailable.
  function areaOptions({ category: id, title = '', aim = '', minutes = 15, daysPerWeek = 7 }) {
    const words = String(aim).toLowerCase(), m = Math.max(5, Math.min(240, Number(minutes) || 15));
    const ideas = catalog[id] || [
      [[], `Work on ${title}`, 'minutes', mm => round5(mm), null],
      [[], `One small step for ${title}`, 'times', () => 1, 7],
      [[], `Learn about ${title}`, 'minutes', mm => round5(Math.min(mm, 20)), null],
      [[], `Plan tomorrow’s ${title} step`, 'minutes', () => 5, 7],
      [[], `Practise ${title}`, 'sessions', () => 1, null],
    ];
    const matches = ideas.filter(([keys]) => keys.some(k => words.includes(k)));
    const general = ideas.filter(([keys]) => !keys.length);
    const key = idea => idea[5] || idea[1];
    const picked = [...matches, ...general].filter((idea, i, list) => list.findIndex(x => key(x) === key(idea)) === i).slice(0, 5);
    return picked.map(([, name, unit, target, perWeek]) => ({ title: name, unit, target: target(m), days: daysFor(perWeek || daysPerWeek) }));
  }
  // Clean up options from any source (AI or local) before they reach the screen.
  function cleanOption(o) {
    const title = String(o?.title || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const unit = UNITS.includes(o?.unit) ? o.unit : 'times';
    const target = Math.max(0.1, Math.min(100000, Math.round((Number(o?.target) || 1) * 10) / 10));
    const given = Array.isArray(o?.days) ? [...new Set(o.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    return title ? { title, unit, target, days: given.length ? given : daysFor(o?.daysPerWeek), why: String(o?.why || '').slice(0, 120) } : null;
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
  return { dateKey, shift, categories, category, scheduledHabits, dayParts, dayScore, value, suggestions, bounds, report, streak, commitment, UNITS, aims, daysFor, areaOptions, cleanOption };
});
