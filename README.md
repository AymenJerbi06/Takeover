# Takeover — 40-day dashboard

A personal daily tracker: what to do today, what's done, and what you're doing right now.

Open `index.html` in any browser for local tracking (no build step). Host the app over HTTPS for accounts and sync. Progress is saved in the browser; use **Profile → Preferences → Export backup** to keep a copy.

## Product planning

The [product and 40-day program roadmap](docs/Takeover-Product-Roadmap.md) proposes onboarding, personalization, daily actions, reviews and a phased implementation plan. The [slide-analysis notes](docs/planning/slide-analysis-working-notes.md) preserve the supporting research. These documents describe proposed work; they do not indicate that the features are implemented.

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

The schedule in **Focus → Your schedule** is editable (`HH:MM-HH:MM | Title | link`); the top card shows the current block and the running timer.

## Find your way around

- **Today:** a short overview of your current block and progress. Open **Check in** to log Deen and Body goals; expand **All daily goals** for the full breakdown.
- **Focus:** start a session or expand **Log time** to adjust minutes. A floating timer stays available while you visit other views; **Finish** saves the session.
- **Progress:** review days, weeks, or months, with detailed charts and a friends leaderboard.
- **Plan:** calendar, events, and exams.
- **Profile:** sign in, edit your name and photo, manage security and sync, or connect with friends. **Preferences** holds challenge settings, backups, and money tracking.

Use the sun or moon button in the header to switch between dark and light mode. The choice is remembered on this browser. On phones and tablets, navigation floats at the bottom of the screen.

## Use it on your phone

Host it with GitHub Pages: repo **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`. Open the URL in Safari → Share → **Add to Home Screen**.

## Sync steps from Apple Health

Websites can't read Apple Health directly, but an iOS Shortcut can send the numbers in a URL:

`https://<your-pages-url>/?steps=12345&sleep=7.5&screen=180`

Shortcut: **Find Health Samples** (Steps, today) → **Calculate Statistics** (Sum) → **URL** (`…?steps=` + result) → **Open URLs**. Run it from an evening automation. The full steps are under **Profile → Preferences** in the app.

Screen time (iOS Screen Time / Flora) isn't exposed to apps or Shortcuts, so it's entered by hand.

## Cloud sync with Supabase (optional)

Without it, data lives only in the browser on one device. With it, you sign in and the dashboard is saved to your Supabase database and shared across your devices.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, run [`supabase.sql`](supabase.sql), then [`supabase-social.sql`](supabase-social.sql) for profiles, friends, and shared scores. Then run [`supabase-personal.sql`](supabase-personal.sql) to support scheduled rest days. These migrations leave private dashboard progress intact.
3. Give the app your keys, either way works:
   - **Easiest:** link Supabase to the project in Vercel (Integrations / Storage), or add `SUPABASE_URL` and `SUPABASE_ANON_KEY` under Vercel → Settings → Environment Variables, then redeploy. `api/config.js` passes the public values to the page. Check by opening `https://<your-app>.vercel.app/api/config`: it should show your Supabase URL.
   - Or copy the **Project URL** and **anon public** key from **Project Settings → API** into [`config.js`](config.js) and push.
4. **Authentication → URL Configuration**: set **Site URL** to your deployed URL. Allow the app's root URL and these callback URLs: `/?account=confirm`, `/?account=email`, and `/?account=recovery` on that same origin. Include a subpath if you host under one.
5. **Authentication → Sign In / Providers**: keep **Confirm email** enabled. Under **Email**, keep **Secure email change** enabled so both old and new inboxes must confirm a change, and enable **Secure password change**. The app also asks for the current password before a security change.
6. Open **Profile → Account → Create account**, confirm the email, then sign in on every device with the same account. Existing users can use the dedicated sign-in form or request a password reset.

The anon key is designed to be public; Row Level Security in `supabase.sql` makes sure only your account can read or write your row. Never put the `service_role` key in `config.js`.

The header shows **This device only** until cloud sync is configured, then **Sign in to sync**, **Saving**, or **Synced**. Both devices must use the same account. An open, visible dashboard checks for updates every 10 seconds and also when it regains focus or reconnects. Failed requests retry; local progress stays in the browser. Incoming updates wait while you are editing a form.

When a device signs in for the first time and the cloud already has data, the cloud copy is used (it asks first if that device already has its own data). Export backups from both devices before connecting existing local saves, and connect the device with the progress you want to keep first. After that, the most recent whole-dashboard change wins; edits on separate devices are not merged field by field. Requests are serialized and writes check the row revision to avoid overwriting an intervening upload without first reading it.

If the app says **Saved on this device only**, check that both `SUPABASE_URL` and a public `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` are configured, then redeploy. The plain localhost preview cannot execute Vercel's `/api/config`; use the deployed site, or fill the public values in `config.js` for local development.

## Profiles and friends

**Profile → Account** lets you change your display name, upload or remove a profile photo, change your email, and change or reset your password. Tap your avatar or open **Edit profile**, then choose **Photo library** or **Take photo**. On supported phones, Take photo opens the front camera; other browsers can show a file picker. Review the circular preview and tap **Save profile**. You can undo a photo change before saving.

Photos up to 25 MB are cropped and resized locally to a small JPEG, which strips source metadata before saving to your account. HEIC/HEIF photos work when the browser can decode them; otherwise the app asks for a JPG/PNG or a new camera photo. The original file is never uploaded. Account identity is stored separately from the dashboard backup.

**Profile → Friends** provides a private invitation code. Requests must be accepted before shared scores become visible. Friends see names and profile photos; email addresses, individual goals, and personal logs stay private. Score sharing starts off. Turning it off removes that account's shared score history without removing its private dashboard.

**Progress → Leaderboard** shows today, the current week, or the current month. Scores are self-reported overall completion, averaged across synced scheduled days; rest days are excluded, and unlogged scheduled habits count as zero. A stale device keeps its last shared snapshot until it reconnects. The app publishes at most the latest 367 days and only after the underlying dashboard has synced. The database checks the dashboard revision to reject uploads from stale device copies.

The social migration uses row-level security for owned profiles and scoped database functions for friendships and scores. A friend code grants the ability to request a connection, not to read progress.

## Progress email every 3 days (Resend)

`api/report.js` runs on Vercel Cron once a day (`vercel.json`, 06:00 UTC) and sends an email on challenge days 4, 7, 10, … (and day 41) covering the three days before: daily scores, every goal vs. target, what to focus on next, weight, upcoming exams and money recovered. It needs Supabase sync set up, because it reads your data from there.

1. Create an account at [resend.com](https://resend.com) → **API Keys** → create one.
2. In Vercel → your project → **Settings → Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `RESEND_API_KEY` | the Resend key (`re_…`) |
   | `REPORT_TO` | the email you signed up to Resend with |
   | `REPORT_USER_ID` | the specific Supabase Auth user UUID whose legacy dashboard belongs to the recipient; required |
   | `SUPABASE_URL` | same Project URL as in `config.js` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → **service_role** / secret key. Keep it secret: only here, never in `config.js` |
   | `CRON_SECRET` | any long random string |
   | `REPORT_TZ` | your time zone; defaults to `America/Vancouver` |

3. Redeploy (Deployments → … → Redeploy) so the variables and the cron take effect.
4. Test it: open `https://<your-app>.vercel.app/api/report?key=<CRON_SECRET>&preview=1` to see the email, or `&force=1` instead of `&preview=1` to send it now.

Without your own domain, Resend's `onboarding@resend.dev` sender can only email the address on your Resend account. To send from your own address, verify a domain in Resend and set `REPORT_FROM`, e.g. `Takeover <report@yourdomain.com>`.

## Personal routines

New visitors see the welcome page and account portal. New accounts start with an empty dashboard, never the original owner's debts or routine. Existing saved dashboards remain in legacy mode until their owner chooses **Profile → Preferences → Customize my routine**.

Onboarding collects up to four goal areas, a goal description, time availability, preferred time and constraints. Weight and income are optional private context. Habit suggestions are transparent category-based examples, not AI or a medical/financial prescription. A bespoke paid plan is visibly unavailable until Stripe, prices, server-side entitlements and verified webhooks are implemented. No client flag can unlock or claim a purchased plan. The free alternative is a manual routine: users write each habit, choose its target/unit and choose weekdays.

Habits have immutable IDs and date ranges. The first starts today; subsequent additions and edits begin tomorrow. Ending a habit keeps today's goal and its history. Daily scores equally weight scheduled habits and cap each at 100%. Rest days have no score. Points are daily percentages summed across scheduled days. Reports exclude future/rest days; missing logs on scheduled days count as zero. Strong-day streaks use 80% and skip rest days.

**Progress** includes Day, Week and Month, previous-period navigation, a selected-day chart, per-habit adherence, last-week and last-month reports, and optional adjustments after a completed period. Recommendations require at least three scheduled days at 85% adherence, fit inside the available minutes, and require the user to review and save. Nothing changes automatically. Reports are in-app; email delivery is not configured for general members.

The $5/$10 commitment feature is explicitly a simulation. It starts tomorrow, counts scheduled days, keeps the pretend amount at 100% completion, and marks it missed below 100% after the local day ends. Stopping takes effect tomorrow. Corrections recalculate demo totals. There is no checkout, money movement, withdrawable balance or real forfeiture. Demo amounts, goal details, weight and income are never sent to the social score table.

The legacy email cron now requires `REPORT_USER_ID` and queries only that account. With no owner configured it sends nothing. Personal routines are excluded from that old report renderer. Do not configure a recipient for another person's account.

Before public signup, finish the deferred custom SMTP/domain configuration in Supabase. Email confirmation, recovery and secure email changes remain enabled; the app cannot bypass email delivery restrictions.
