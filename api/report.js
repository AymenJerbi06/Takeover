'use strict';
/* Every-3-days progress email.
   Vercel Cron calls this once a day (see vercel.json); it only sends on challenge days 4, 7, 10, …
   covering the three days before. Reads the dashboard from Supabase, sends through Resend.

   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, REPORT_TO, CRON_SECRET,
        REPORT_FROM (default onboarding@resend.dev), REPORT_TZ (default UTC, e.g. Africa/Tunis)

   Manual:  /api/report?key=CRON_SECRET&preview=1   → show the email in the browser
            /api/report?key=CRON_SECRET&force=1     → send it now */
const { GOALS, FOCUS, PRAYERS, kcalOf, dayParts, dayScore } = require('../metrics.js');

const DAY_START_HOUR = 4; // same rollover as the dashboard
const pad = n => String(n).padStart(2, '0');
const toKey = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (k, n) => { const d = parseKey(k); d.setUTCDate(d.getUTCDate() + n); return toKey(d); };
const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
const todayIn = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() - DAY_START_HOUR * 3600000));
const label = k => parseKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const pct = x => `${Math.round(x * 100)}%`;
const num = n => Math.round(n).toLocaleString('en-US');
const fmtMin = m => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}h${m % 60 ? ` ${pad(m % 60)}m` : ''}` : `${m}m`; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = s => (s >= 0.8 ? '#0f9d6b' : s >= 0.5 ? '#d97706' : '#dc2626');

const AYAT = [
  ['Indeed, with hardship comes ease.', 'Ash-Sharh 94:6'],
  ['Indeed, Allah will not change the condition of a people until they change what is in themselves.', "Ar-Ra'd 13:11"],
  ['Allah does not burden a soul beyond that it can bear.', 'Al-Baqarah 2:286'],
  ['So remember Me; I will remember you.', 'Al-Baqarah 2:152'],
];

function analyze(state, today) {
  const keys = [-3, -2, -1].map(n => addDays(today, n));
  const prevKeys = [-6, -5, -4].map(n => addDays(today, n));
  const days = keys.map(k => ({ k, d: state.days?.[k] || null }));
  const scores = days.map(x => dayScore(x.d));
  const avg = scores.reduce((a, b) => a + b, 0) / 3;
  const prevAvg = prevKeys.reduce((a, k) => a + dayScore(state.days?.[k]), 0) / 3;
  const hasPrev = prevKeys.some(k => state.days?.[k]);

  // Average completion per area, to find what's slipping.
  const areas = {};
  for (const { d } of days) {
    const parts = d ? dayParts(d) : dayParts({ prayers: [], quran: 0, tasbih: 0, steps: 0, food: [], mins: {}, call: false, sleep: null });
    for (const [name, v] of parts) areas[name] = (areas[name] || 0) + v / 3;
  }
  const ranked = Object.entries(areas).sort((a, b) => a[1] - b[1]);

  const sum = f => days.reduce((s, x) => s + (x.d ? f(x.d) : 0), 0);
  const logged = days.filter(x => x.d);
  const kcalDays = logged.filter(x => kcalOf(x.d) > 0);
  const sleepDays = logged.filter(x => x.d.sleep != null);

  const weights = [...(state.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
  const startW = state.startWeight ?? weights[0]?.kg;
  const lastW = weights.filter(w => w.date < today).at(-1);
  const beforeW = weights.filter(w => w.date < keys[0]).at(-1);

  let streak = 0;
  for (let k = addDays(today, -1); dayScore(state.days?.[k]) >= 0.8; k = addDays(k, -1)) streak++;

  const debts = state.debts || [];
  return {
    keys, days, scores, avg, prevAvg, hasPrev, ranked, streak,
    challengeDay: diffDays(state.startDate, keys[2]) + 1,
    rows: [
      ['Prayers', `${sum(d => d.prayers.filter(Boolean).length)} / 15`, sum(d => d.prayers.filter(Boolean).length) / 15],
      ['Quran pages', `${sum(d => d.quran)} / ${GOALS.quran * 3}`, sum(d => d.quran) / (GOALS.quran * 3)],
      ['Tasbih', `${num(sum(d => d.tasbih))} / ${GOALS.tasbih * 3}`, sum(d => d.tasbih) / (GOALS.tasbih * 3)],
      ['Called parents', `${sum(d => (d.call ? 1 : 0))} / 3 days`, sum(d => (d.call ? 1 : 0)) / 3],
      ['Steps', `${num(sum(d => d.steps) / 3)} avg / day`, sum(d => d.steps) / (GOALS.steps * 3)],
      ['Calories', kcalDays.length ? `${num(kcalDays.reduce((s, x) => s + kcalOf(x.d), 0) / kcalDays.length)} avg · ${kcalDays.filter(x => kcalOf(x.d) <= GOALS.kcal).length}/3 days under ${num(GOALS.kcal)}` : 'not logged', kcalDays.filter(x => kcalOf(x.d) <= GOALS.kcal).length / 3],
      ['Gym', `${sum(d => (d.gym ? 1 : 0))} session(s)`, Math.min(sum(d => (d.gym ? 1 : 0)), 1)],
      ['Sleep', sleepDays.length ? `${(sleepDays.reduce((s, x) => s + x.d.sleep, 0) / sleepDays.length).toFixed(1)}h avg` : 'not logged', areas.Sleep || 0],
      ...FOCUS.map(f => [f.label, `${fmtMin(sum(d => d.mins?.[f.id] || 0))} / ${fmtMin(f.goal * 3)}`, sum(d => d.mins?.[f.id] || 0) / (f.goal * 3)]),
      ...(sum(d => d.screen || 0) ? [['Screen time', `${fmtMin(sum(d => d.screen || 0) / logged.filter(x => x.d.screen != null).length)} avg / day`, null]] : []),
    ],
    weight: startW != null && lastW ? {
      now: lastW.kg,
      period: beforeW ? lastW.kg - beforeW.kg : null,
      total: lastW.kg - startW,
      left: lastW.kg - (startW - GOALS.weightLoss),
    } : null,
    exams: [
      ...(state.exams || []).map(e => ({ name: `${e.name} (exam)`, date: e.date })),
      ...(state.events || []).map(e => ({ name: e.title, date: e.date })),
    ].map(e => ({ ...e, left: diffDays(today, e.date) })).filter(e => e.left >= 0 && e.left <= 10).sort((a, b) => a.left - b.left),
    money: { back: debts.reduce((s, d) => s + Math.min(d.paid || 0, d.amount), 0), total: debts.reduce((s, d) => s + d.amount, 0), currency: state.currency || '' },
  };
}

function render(a) {
  const range = `${label(a.keys[0])} – ${label(a.keys[2])}`;
  const delta = a.hasPrev ? Math.round((a.avg - a.prevAvg) * 100) : null;
  const weak = a.ranked.filter(([, v]) => v < 0.8).slice(0, 3);
  const best = a.ranked.at(-1);
  const [ayah, ref] = AYAT[Math.floor(a.challengeDay / 3) % AYAT.length];
  const verdict = a.avg >= 0.8 ? 'Excellent three days. Keep the same rhythm.'
    : a.avg >= 0.5 ? 'Solid base — a few areas are holding you back.'
    : 'Tough stretch. Reset tomorrow morning with the basics: prayers, Quran, walking, calories.';

  const td = 'padding:8px 10px;border-bottom:1px solid #eee;font-size:14px;';
  const bar = v => v == null ? '' : `<div style="background:#eee;border-radius:4px;height:6px;width:64px;display:inline-block;vertical-align:middle"><div style="background:${color(v)};height:6px;border-radius:4px;width:${Math.round(Math.min(v, 1) * 64)}px"></div></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#15171c">
<div style="max-width:600px;margin:0 auto;padding:20px 16px">
  <div style="font-size:13px;color:#6b7280">Takeover · ${esc(range)}</div>
  <h1 style="margin:4px 0 2px;font-size:22px">Day ${a.challengeDay} of ${GOALS.days} — ${pct(a.avg)} average</h1>
  <div style="font-size:14px;color:#6b7280;margin-bottom:16px">${delta == null ? '' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pt${Math.abs(delta) === 1 ? "" : "s"} vs the 3 days before · `}streak: ${a.streak} day${a.streak === 1 ? '' : 's'} at 80%+</div>

  <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:12px">
    <table style="width:100%;border-collapse:collapse;text-align:center"><tr>
      ${a.keys.map((k, i) => `<td style="padding:6px"><div style="font-size:12px;color:#6b7280">${esc(label(k))}</div><div style="font-size:24px;font-weight:700;color:${color(a.scores[i])}">${a.days[i].d ? pct(a.scores[i]) : '—'}</div></td>`).join('')}
    </tr></table>
    <p style="margin:12px 0 0;font-size:15px">${verdict}</p>
  </div>

  ${weak.length ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin-bottom:12px;font-size:14px">
    <b>Focus for the next 3 days</b><ul style="margin:6px 0 0;padding-left:18px">${weak.map(([n, v]) => `<li>${esc(n)} — ${pct(v)} done</li>`).join('')}</ul>
    ${best && best[1] >= 0.8 ? `<div style="margin-top:6px;color:#6b7280">Strongest: ${esc(best[0])} (${pct(best[1])}).</div>` : ''}
  </div>` : ''}

  <div style="background:#fff;border-radius:12px;padding:8px 6px;margin-bottom:12px">
    <table style="width:100%;border-collapse:collapse">
      ${a.rows.map(([n, v, p]) => `<tr><td style="${td}">${esc(n)}</td><td style="${td}text-align:right">${esc(v)}</td><td style="${td}text-align:right;width:70px">${bar(p)}</td></tr>`).join('')}
    </table>
  </div>

  <div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:12px;font-size:14px;line-height:1.6">
    ${a.weight ? `<div><b>Weight:</b> ${a.weight.now} kg${a.weight.period != null ? ` (${a.weight.period <= 0 ? '−' : '+'}${Math.abs(a.weight.period).toFixed(1)} kg these 3 days)` : ''} · ${a.weight.total <= 0 ? '−' : '+'}${Math.abs(a.weight.total).toFixed(1)} kg since start · ${Math.max(a.weight.left, 0).toFixed(1)} kg to goal</div>` : '<div><b>Weight:</b> no weigh-in logged — step on the scale tomorrow morning.</div>'}
    ${a.exams.length ? `<div><b>Coming up:</b> ${a.exams.map(e => `${esc(e.name)} ${e.left === 0 ? 'today' : e.left === 1 ? 'tomorrow' : `in ${e.left} days`}`).join(' · ')}</div>` : ''}
    ${a.money.total ? `<div><b>Money recovered:</b> ${num(a.money.back)} / ${num(a.money.total)}${a.money.currency ? ` ${esc(a.money.currency)}` : ''}</div>` : ''}
  </div>

  <p style="font-size:14px;color:#6b7280;font-style:italic;text-align:center;margin:20px 8px">“${esc(ayah)}” — ${esc(ref)}</p>
</div></body></html>`;

  const text = [`Takeover · ${range}`, `Day ${a.challengeDay}/${GOALS.days} — ${pct(a.avg)} average`, verdict, '',
    ...a.rows.map(([n, v]) => `${n}: ${v}`),
    weak.length ? `\nFocus next: ${weak.map(([n]) => n).join(', ')}` : '',
    `\n“${ayah}” — ${ref}`].join('\n');

  return { subject: `Takeover · Day ${a.challengeDay}/${GOALS.days} — ${pct(a.avg)} over the last 3 days`, html, text };
}

async function loadState() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy JWT keys
  const r = await fetch(`${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/takeover_state?select=data&order=updated_at.desc&limit=1`, { headers });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0]?.data || null;
}

async function send({ subject, html, text }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || 'Takeover <onboarding@resend.dev>',
      to: process.env.REPORT_TO.split(',').map(s => s.trim()),
      subject, html, text,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const q = new URL(req.url, 'http://localhost').searchParams;
  if (!secret || (req.headers.authorization !== `Bearer ${secret}` && q.get('key') !== secret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const state = await loadState();
    if (!state) return res.status(200).json({ skipped: 'no data in Supabase yet' });
    const today = todayIn(process.env.REPORT_TZ || 'UTC');
    const since = diffDays(state.startDate, today);
    const due = since >= 3 && (since % 3 === 0 || since === GOALS.days);
    const preview = q.get('preview') === '1';
    if (!due && q.get('force') !== '1' && !preview) return res.status(200).json({ skipped: `not a report day (day ${since + 1})` });

    const email = render(analyze(state, today));
    if (preview) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(email.html);
    }
    const sent = await send(email);
    return res.status(200).json({ sent: true, id: sent.id, subject: email.subject });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.analyze = analyze;
module.exports.render = render;
