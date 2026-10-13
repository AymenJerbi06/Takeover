/* Goals and daily scoring, shared by the dashboard (browser) and the email report (api/report.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TakeoverMetrics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHALLENGE_START_DATE = '2026-10-13';
  // Apply this reset once to each saved copy, preserving logs and sync timestamps.
  // Later edits to Challenge start remain valid because the marker is retained.
  function normalizeChallenge(state) {
    if (state.challengeReset === CHALLENGE_START_DATE) return state;
    return { ...state, startDate: CHALLENGE_START_DATE, challengeReset: CHALLENGE_START_DATE };
  }
  const GOALS = { kcal: 1400, steps: 20000, gymPerWeek: 3, quran: 3, tasbih: 100, sleep: 7, days: 40, weightLoss: 15 };
  const FOCUS = [
    { id: 'study', label: 'University study', goal: 240 },
    { id: 'drop', label: 'Dropshipping course', goal: 120 },
    { id: 'fullstack', label: 'Full-stack dev', goal: 60 },
    { id: 'video', label: 'Video basics', goal: 60 },
  ];
  const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  const kcalOf = d => (d.food || []).reduce((s, f) => s + f.kcal, 0);

  // Each part is [label, 0..1]. `minsOf` lets the dashboard include a running timer.
  function dayParts(d, minsOf = id => (d.mins && d.mins[id]) || 0) {
    const kcal = kcalOf(d);
    return [
      ['Prayers', d.prayers.filter(Boolean).length / 5],
      ['Quran', Math.min(d.quran / GOALS.quran, 1)],
      ['Tasbih', Math.min(d.tasbih / GOALS.tasbih, 1)],
      ['Steps', Math.min(d.steps / GOALS.steps, 1)],
      ['Calories', kcal > 0 && kcal <= GOALS.kcal ? 1 : 0],
      ...FOCUS.map(f => [f.label, Math.min(minsOf(f.id) / f.goal, 1)]),
      ['Call parents', d.call ? 1 : 0],
      ['Sleep', d.sleep != null ? Math.min(d.sleep / GOALS.sleep, 1) : 0],
    ];
  }
  const avgParts = p => p.reduce((s, [, v]) => s + v, 0) / p.length;
  const dayScore = (d, minsOf) => (d ? avgParts(dayParts(d, minsOf)) : 0);

  return { GOALS, FOCUS, PRAYERS, kcalOf, dayParts, dayScore, CHALLENGE_START_DATE, normalizeChallenge };
});
