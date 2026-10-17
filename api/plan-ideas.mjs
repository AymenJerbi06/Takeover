/* AI habit ideas for one area of someone's life, during "Make it yours".
   POST { area, aim, minutes, daysPerWeek, preferredTime, otherAreas } with the person's Supabase
   access token (Authorization: Bearer …). Returns { options: [{ title, target, unit, daysPerWeek, why }] }.
   Without ANTHROPIC_API_KEY (or on any failure) it answers 503 and the app uses its built-in ideas.

   Env: ANTHROPIC_API_KEY, optional PLAN_AI_MODEL (default claude-sonnet-5-5),
        SUPABASE_URL + SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY (to check the caller is signed in). */

const UNITS = ['times', 'minutes', 'pages', 'steps', 'hours', 'sessions', 'glasses'];

// The founder's own 40-day plan: the reference for what a complete, concrete daily plan looks like.
const EXAMPLE_PLAN = [
  { area: 'Faith & reflection', title: 'Pray the five daily prayers', target: 5, unit: 'times', daysPerWeek: 7 },
  { area: 'Faith & reflection', title: 'Read Quran', target: 3, unit: 'pages', daysPerWeek: 7 },
  { area: 'Faith & reflection', title: 'Tasbih', target: 100, unit: 'times', daysPerWeek: 7 },
  { area: 'Fitness', title: 'Walk', target: 20000, unit: 'steps', daysPerWeek: 7 },
  { area: 'Fitness', title: 'Stay under 1,400 kcal', target: 1, unit: 'times', daysPerWeek: 7 },
  { area: 'Fitness', title: 'Gym session', target: 1, unit: 'sessions', daysPerWeek: 3 },
  { area: 'Learning', title: 'University study', target: 240, unit: 'minutes', daysPerWeek: 6 },
  { area: 'Learning', title: 'Full-stack development', target: 60, unit: 'minutes', daysPerWeek: 6 },
  { area: 'Money', title: 'Dropshipping course', target: 120, unit: 'minutes', daysPerWeek: 6 },
  { area: 'Connection', title: 'Call my parents', target: 1, unit: 'times', daysPerWeek: 7 },
  { area: 'Wellbeing', title: 'Sleep', target: 7, unit: 'hours', daysPerWeek: 7 },
];

const SYSTEM = `You design daily habits for JourMax, a habit tracker that covers the whole of someone's life.
For ONE area of the person's life you suggest exactly 5 distinct habit options they could add to their routine.
Rules:
- Each habit is a concrete action someone can check off or count every day it is scheduled, with a numeric daily target.
- Fit the person's own words about what they want to improve, and fit the time they said they have for this area (time-based targets must not exceed it).
- Mix: 2-3 options that directly serve their aim, plus easier or complementary ones. Order from most to least relevant.
- Be realistic for a beginner; no medical, diet-pill or financial-product advice. Respect religious practices exactly as the person names them.
- unit must be one of: ${UNITS.join(', ')}. daysPerWeek is 1-7.
- title: short, imperative or noun phrase, max 50 characters. why: one short sentence (max 90 characters) linking it to their aim.
Here is an example of a complete, strong plan from a real member, showing the level of concreteness wanted:
${JSON.stringify(EXAMPLE_PLAN)}
Answer with JSON only: {"options":[{"title":"…","target":0,"unit":"…","daysPerWeek":0,"why":"…"}]}`;

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function signedIn(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return r.ok;
}

function clean(o) {
  const title = text(o?.title, 60);
  const target = Math.max(0.1, Math.min(100000, Math.round((Number(o?.target) || 1) * 10) / 10));
  const daysPerWeek = Math.max(1, Math.min(7, Math.round(Number(o?.daysPerWeek) || 7)));
  return title ? { title, target, unit: UNITS.includes(o?.unit) ? o.unit : 'times', daysPerWeek, why: text(o?.why, 120) } : null;
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return json({ error: 'ai unavailable' }, 503);
    try {
      if (!(await signedIn(request))) return json({ error: 'sign in first' }, 401);
      const body = await request.json().catch(() => ({}));
      const ask = {
        area: text(body.area, 40),
        whatTheyWantToImprove: text(body.aim, 300) || 'not specified',
        minutesPerDayForThisArea: Math.max(5, Math.min(480, Number(body.minutes) || 15)),
        daysPerWeek: Math.max(1, Math.min(7, Math.round(Number(body.daysPerWeek) || 7))),
        bestTimeOfDay: text(body.preferredTime, 20) || 'Flexible',
        theirOtherAreas: (Array.isArray(body.otherAreas) ? body.otherAreas : []).slice(0, 15).map(a => text(a, 40)),
      };
      if (!ask.area) return json({ error: 'bad request' }, 400);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.PLAN_AI_MODEL || 'claude-sonnet-5-5',
          max_tokens: 900,
          system: SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify(ask) }],
        }),
      }).finally(() => clearTimeout(timer));
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const reply = (await r.json()).content?.map(c => c.text || '').join('') || '';
      const parsed = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1));
      const options = (parsed.options || []).map(clean).filter(Boolean).slice(0, 5);
      if (options.length < 3) throw new Error('too few options');
      return json({ options, source: 'ai' });
    } catch (e) {
      console.error(e);
      return json({ error: 'ai unavailable' }, 503);
    }
  },
};
