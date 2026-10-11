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

Plus weight vs. a −15 kg goal, exam countdowns, money owed to you, and a 40-day grid colored by each day's completion. A day counts toward the streak at 80%+. The day rolls over at 4am.

The schedule in **Today's plan** is editable (`HH:MM-HH:MM | Title | link`); the top card shows the current block and the running timer.

## Use it on your phone

Host it with GitHub Pages: repo **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`. Open the URL in Safari → Share → **Add to Home Screen**.

## Sync steps from Apple Health

Websites can't read Apple Health directly, but an iOS Shortcut can send the numbers in a URL:

`https://<your-pages-url>/?steps=12345&sleep=7.5&screen=180`

Shortcut: **Find Health Samples** (Steps, today) → **Calculate Statistics** (Sum) → **URL** (`…?steps=` + result) → **Open URLs**. Run it from an evening automation. The full steps are under *Settings & data* in the app.

Screen time (iOS Screen Time / Flora) isn't exposed to apps or Shortcuts, so it's entered by hand.
