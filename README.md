# Takeover — 40-day dashboard

A personal daily tracker: what to do today, what's done, and what you're doing right now.

Open `index.html` in any browser (no build step, no server). Everything is saved in the browser on that device; use **Export backup** in Settings to keep a copy.

## What it tracks

| Area | Daily target |
| --- | --- |
| Prayers | 5 |
| Quran | 3 pages |
| Tasbih | 100 (tap counter) |
| Call parents | every day |
| Calories | ≤ 1,400 kcal |
| Steps | 20,000 |
| Gym | 3× per week |
| Sleep | 7h+ |
| University study | 4h (timer) |
| Dropshipping course | 2h (timer) |
| Full-stack dev | 1h (timer) |
| Video basics | 1h (timer) |

Plus weight vs. a −15 kg goal, exam countdowns, money owed to you, and a 40-day grid colored by each day's completion. A day counts toward the streak at 80%+. Days follow the local calendar and roll over at midnight.

The challenge restarts on **October 13, 2026 (Day 1)** and ends on **November 21, 2026 (Day 40)**. Existing saves receive this start date once, including cloud copies and imported backups. Earlier logs stay available in the calendar and backups; challenge streaks and progress counters begin with the new start date. You can still adjust **Challenge start** in Settings afterward.

The schedule in **Today's plan** is editable (`HH:MM-HH:MM | Title | link`); the top card shows the current block and the running timer.

## Use it on your phone

Host it with GitHub Pages: repo **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`. Open the URL in Safari → Share → **Add to Home Screen**.

## Sync steps from Apple Health

Websites can't read Apple Health directly, but an iOS Shortcut can send the numbers in a URL:

`https://<your-pages-url>/?steps=12345&sleep=7.5&screen=180`

Shortcut: **Find Health Samples** (Steps, today) → **Calculate Statistics** (Sum) → **URL** (`…?steps=` + result) → **Open URLs**. Run it from an evening automation. The full steps are under *Settings & data* in the app.

Screen time (iOS Screen Time / Flora) isn't exposed to apps or Shortcuts, so it's entered by hand.

## Cloud sync with Supabase (optional)

Without it, data lives only in the browser on one device. With it, you sign in and the dashboard is saved to your Supabase database and shared across your devices.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste the contents of [`supabase.sql`](supabase.sql), **Run**.
3. Give the app your keys, either way works:
   - **Easiest:** link Supabase to the project in Vercel (Integrations / Storage), or add `SUPABASE_URL` and `SUPABASE_ANON_KEY` under Vercel → Settings → Environment Variables, then redeploy. `api/config.js` passes the public values to the page. Check by opening `https://<your-app>.vercel.app/api/config`: it should show your Supabase URL.
   - Or copy the **Project URL** and **anon public** key from **Project Settings → API** into [`config.js`](config.js) and push.
4. **Authentication → URL Configuration**: set **Site URL** to your Vercel URL.
5. Optional: **Authentication → Sign In / Providers → Email**, turn off **Confirm email** if you don't want to click a confirmation link.
6. Open the app → **Settings & data → Cloud sync** → **Create account**, then **Sign in**. Do this on every device with the same account.

The anon key is designed to be public; Row Level Security in `supabase.sql` makes sure only your account can read or write your row. Never put the `service_role` key in `config.js`.

When a device signs in for the first time and the cloud already has data, the cloud copy is used (it asks first if that device already has its own data). After that, the most recent change wins.

## Progress email every 3 days (Resend)

`api/report.js` runs on Vercel Cron once a day (`vercel.json`, 06:00 UTC) and sends an email on challenge days 4, 7, 10, … (and day 41) covering the three days before: daily scores, every goal vs. target, what to focus on next, weight, upcoming exams and money recovered. It needs Supabase sync set up, because it reads your data from there.

1. Create an account at [resend.com](https://resend.com) → **API Keys** → create one.
2. In Vercel → your project → **Settings → Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `RESEND_API_KEY` | the Resend key (`re_…`) |
   | `REPORT_TO` | the email you signed up to Resend with |
   | `SUPABASE_URL` | same Project URL as in `config.js` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** / secret key. Keep it secret: only here, never in `config.js` |
   | `CRON_SECRET` | any long random string |
   | `REPORT_TZ` | your time zone; defaults to `America/Vancouver` |

3. Redeploy (Deployments → … → Redeploy) so the variables and the cron take effect.
4. Test it: open `https://<your-app>.vercel.app/api/report?key=<CRON_SECRET>&preview=1` to see the email, or `&force=1` instead of `&preview=1` to send it now.

Without your own domain, Resend's `onboarding@resend.dev` sender can only email the address on your Resend account. To send from your own address, verify a domain in Resend and set `REPORT_FROM`, e.g. `Takeover <report@yourdomain.com>`.
