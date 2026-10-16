# JourMax: twenty principles, applied deliberately

Review date: October 14, 2026. Scope: welcome, authentication, onboarding, Today, Focus, Progress, Plan, Profile, friends, and the original dashboard.

This is a source review of the implementation, informed by the supplied app references. **Existing** records the starting behavior; **implemented** identifies changes observed in this revision; **retained** means an existing behavior deliberately kept. **Follow-up** is unfinished work, not a completed feature. These labels do not imply browser testing, email delivery, or deployment confirmation. Shared visual changes apply to both the original and personalized dashboards where their selectors are used.

Each principle received a separate review window of at least ten seconds, with clock readings at its start and end. The windows ranged from 10 to 339 seconds; the long window included a session interruption. No automated or functional tests were run for this audit.

## What the references contribute

- **Shop, references 1–6:** a compact floating navigation capsule, a clear active destination, restrained circular actions, generous card corners, and short contextual controls. Borrow the layout rhythm and hierarchy; product imagery and shopping controls do not belong in a habits app.
- **Klarna, references 7–12:** grouped settings rows, a large primary action at the end of a sheet, quiet secondary choices, and a restrained dark surface system. A sheet should complete one task and have an obvious way back.
- **Revolut, references 13–20:** one prominent summary, a short row of useful actions, readable numbers, and quieter supporting lists. Color identifies a category or result; it should not compete equally across every surface.
- Across the references, text stays readable, icon weight is consistent, and large radii belong to large containers. Small controls use tighter radii or circles. Blur is reserved for floating controls above content.

## 01 · Jakob’s Law

**Intent:** use familiar navigation and control behavior so the app does not require learning a new interface language.

**Existing:** five labeled destinations in `index.html`; floating phone/tablet navigation in `experience.css`; Profile contains Account, Friends, and Preferences. Native dialogs and details disclosures provide familiar escape and keyboard behavior.

**Implemented:** the labeled destinations retain their order. Active navigation uses a raised selected surface and a filled symbol from the same icon family (`polish.css`, `icons.js`). The confirmation portal now has “Email confirmed” and a “Sign in” or “Continue to Takeover” action (`account.js`), after server validation. Back, close, and disclosure symbols use the shared icon API.

**Apply to:** shell, confirmation, onboarding sheets, profile editing. Symbols should reinforce labels; retain navigation labels on mobile.

## 02 · Hick’s Law

**Intent:** make the next decision small and clear.

**Existing:** onboarding already separates goals, daily availability, and a preview. Optional weight/income fields are disclosed rather than required. Progress separates personal reports from the leaderboard.

**Implemented:** “Create my routine” is the primary action on onboarding step three; unavailable paid plans move into “About tailored plans.” People with no commitment history see a compact “Explore a commitment demo” disclosure instead of a full totals card (`personal.js`). Optional context remains disclosed. **Follow-up:** completed-report summaries remain visible; they were not collapsed in this revision.

**Apply to:** onboarding, Reports, billing, preferences. Reduce choices in the current task rather than removing capabilities globally.

## 03 · Fitts’s Law

**Intent:** make frequent actions easy to reach and select accurately.

**Existing:** habit completion buttons are 46px; sheet close controls are 44px; account forms use 50–52px controls; phone navigation accounts for the bottom safe area.

**Implemented:** report-day buttons have a 44px minimum width in a horizontally scrollable chart, with every day label visible. Routine edit/stop buttons have a 44px minimum width and height (`polish.css`). Report rerenders preserve horizontal position, and selecting a day restores its focus (`personal.js`). **Follow-up:** physical keyboard overlap and long-sheet visibility still need a phone review.

**Apply to:** check-ins, monthly charts, calendar navigation, photo picker, sheet forms. A large visual icon alone is not a large hit area.

## 04 · Von Restorff Effect

**Intent:** reserve visual emphasis for what matters now.

**Existing:** Today has a distinct summary and next-habit action. Active and completed controls have state styling. However, colored backgrounds currently appear on many unrelated cards, statistics, icons, and navigation items.

**Implemented:** shared light and dark foundations are neutral, with blue primary actions and consistent mint, violet, coral, and amber category tokens. The Today summary carries the main expressive gradient; supporting cards and navigation are calmer (`polish.css`). Unavailable checkout no longer dominates onboarding. Success and errors retain explicit wording in addition to color.

**Apply to:** both themes, Today, Focus, reports, confirmation. Errors and success should be distinct in wording and shape as well as color.

## 05 · Zeigarnik Effect

**Intent:** help people resume unfinished work without creating nagging pressure.

**Existing:** onboarding shows step count; Today identifies the next incomplete habit; the session dock returns to a running focus session. The onboarding draft is saved after the context step.

**Implemented:** onboarding saves a cloned draft after the goal step as well as the context step; reopening restores it. The personal session dock now also sets the shared `has-session` layout state (`personal.js`). **Retained:** completed habits remain correctable and the running session can be reached from other destinations. The dock does not receive a repeating attention animation.

**Apply to:** onboarding, Today, Focus, editing. Completion indicators should explain what remains and also make the end of a task clear.

## 06 · Doherty Threshold

**Intent:** acknowledge interaction promptly so users know their action registered.

**Existing:** local check-ins save and render immediately; cloud synchronization is queued separately. Account forms disable duplicate submission and expose an `aria-busy` state. Sync distinguishes device saves from cloud completion.

**Implemented:** controls respond with short press feedback, and a real completion threshold triggers a check/meter transition (`polish.css`, `motion.js`, `personal.js`). Saving still happens before motion is scheduled. Local feedback stays independent of network completion; sync status remains managed by the existing sync code. No measured response-time claim is made.

**Apply to:** check-ins, segmented controls, form submit, photo preparation, theme switch. No performance threshold is claimed measured by this source review.

## 07 · Tesler’s Law

**Intent:** let the app handle mechanical complexity while leaving meaningful decisions with the user.

**Existing:** the personal engine handles schedules, rest days, completion arithmetic, date ranges, and report totals. Habit revisions preserve previous targets. Optional personal data stays separate from public scores.

**Implemented:** the confirmation portal translates pending, checking, expired/failed, and successful verification into clear states, with resend, email correction, and sign-in recovery (`account.js`). **Retained:** friendly dates, editable suggested values, automatic schedule calculations, and the explanation that routine updates apply tomorrow. No identity or payment decision is silently inferred.

**Apply to:** onboarding, schedule editing, reports, sync, confirmation. Keep identity verification and money-related choices explicit.

## 08 · Parkinson’s Law

**Intent:** help users choose a manageable amount of work and a clear stopping point.

**Existing:** onboarding asks for available daily minutes; category previews fit within that time; focus habits show minute targets. Progression suggestions respect available time and require review.

**Implemented:** the active timer displays its chosen minute target beside elapsed time and “stop whenever you need”; “Finish & save” stays available (`personal.js`). The empty timer panel is quiet and the active session gains emphasis (`polish.css`). **Retained:** one active personal timer at a time and a user-selected daily time budget.

**Apply to:** availability, Focus, recommendations. Treat the selected duration as a user-owned boundary, not an artificial deadline or urgency prompt.

## 09 · Peak–End Rule

**Intent:** make a successful finish feel clear and satisfying.

**Existing:** Today ends with “You showed up” and an invitation to enjoy the rest of the day; a saved check-in produces a toast; focus sessions have a finish-and-save action.

**Implemented:** crossing a habit’s target animates its check and meter; completing the day briefly emphasizes the final heading (`motion.js`, `personal.js`). The persistent completed appearance and “You showed up” message remain after the animation. Server-confirmed signup receives a persistent success portal. These effects are called from deliberate actions, not general render or sync paths.

**Apply to:** check-ins, daily completion, focus finish, signup, profile save. The success cue should not demand another task to make the finish valid.

## 10 · Response Time

**Intent:** make waits understandable and transitions continuous.

**Existing:** sync has an abort timeout and retry messaging. Account requests expose a working state. The CSS already respects reduced-motion preferences. Auth confirmation work adds pending, checking, failed, and confirmed states in the current branch.

**Implemented:** navigation, selected tabs, disclosures, sheets, and notices receive short transitions. Confirmation has checking text and a progress indicator. New Web Animations are skipped for keyboard interaction, reduced motion, or hidden documents; native keyboard Escape keeps its immediate close behavior (`motion.js`, `polish.css`). Keyboard input or a live change to reduced motion immediately settles animations already in flight. Background renders do not call entrance animations.

**Apply to:** every interactive surface. Avoid fake progress percentages, decorative loading delays, and endless movement after work finishes.

## 11 · Miller’s Law

**Intent:** group information into understandable chunks rather than asking users to hold many unrelated details in memory.

**Existing:** five main destinations, three Profile sections, and three report periods provide useful chunks. Habit rows show their own target and current value together.

**Implemented:** personal phone layouts hide the duplicate top statistics; Today remains organized around its summary, week, and habits. Unavailable plans and an unstarted commitment demo become disclosures (`polish.css`, `personal.js`). **Retained:** named report periods and Profile sections. Completed-report cards remain directly visible. This principle is not treated as a rigid numerical cap on lists.

**Apply to:** Today, Reports, Plan, preferences, legacy check-ins. Group by the user’s task rather than by implementation module.

## 12 · Law of Proximity

**Intent:** spacing should reveal which items belong together.

**Existing:** habit names, quantities, and meters live in one row; account input labels stay with fields; reports group statistics. Section spacing is generally larger than row spacing.

**Implemented:** shared card spacing, habit rows, report statistics, and headings now use calmer separation and quieter boundaries (`polish.css`). The optional commitment disclosure has its own compact region. Report period controls remain with their report, and form status remains with its form. The update uses spacing and dividers rather than adding new nested containers.

**Apply to:** all forms, dashboard cards, report headers, calendar details, friend rows. Use whitespace and subtle dividers before adding more containers.

## 13 · Law of Similarity

**Intent:** the same visual treatment should imply the same role or behavior.

**Existing:** `TakeoverIcons.svg()` provides a common symbol API; primary/secondary button classes and theme tokens are shared. Both original and personal dashboards use the same navigation.

**Implemented:** the common symbol API now uses the Phosphor family, with regular symbols and filled active navigation variants (`icons.js`, licensed local assets). Shared styles standardize button and card treatment, circular category holders, selected states, and category colors across views (`polish.css`). Existing labels remain alongside symbols where needed.

**Apply to:** icons, buttons, cards, status messages, both themes. Distinguish editable controls from decorative symbols.

## 14 · Serial Position Effect

**Intent:** place orientation first and a clear next step or ending last.

**Existing:** Today is the first destination; Profile is the last; each view has a title. Forms generally end in their save action. The landing page starts with a short purpose statement.

**Implemented:** the setup preview emphasizes its usable routine action, then quietly discloses future plans; unstarted commitment totals no longer dominate the end of reports (`personal.js`). **Retained:** Today begins with current status and the next habit, Profile begins with identity, and routine changes precede backup utilities. Navigation order stays stable.

**Apply to:** welcome, onboarding, Today, reports, Profile. Do not reorder destinations based on frequency and force users to relearn their positions.

## 15 · Aesthetic–Usability Effect

**Intent:** use visual coherence to support clarity and confidence.

**Existing:** both themes use shared surface tokens, responsive layouts, rounded containers, and one type family. The references provide a coherent direction for navigation and grouped cards.

**Implemented:** the app uses a native system font stack, a revised heading scale, charcoal dark surfaces, clean neutral light surfaces, and consistent semantic colors. Floating navigation/session surfaces receive restrained blur. Narrow layouts allocate space for the summary ring and use clearer report labels (`polish.css`, `theme.js`, `index.html`). These are source changes; visual fit and contrast have not been established by this audit.

**Apply to:** every view, especially mobile and tablet. Visual refinement must accompany a working interaction and legible content; it does not establish usability by itself.

## 16 · Anchoring Effect

**Intent:** give people useful reference points without biasing them toward an unnecessary purchase or target.

**Existing:** progress is normalized to each person’s scheduled targets; report labels explain the 80% strong-day threshold; the landing preview is labeled Example. Paid-plan prices are not invented.

**Implemented:** free manual setup is presented before unavailable paid plans (`personal.js`). **Retained:** report comparisons use the person’s own preceding period; examples are labeled as previews; users choose actual habit targets. Reports explain their 80% strong-day reference, while the optional demo separately explains its 100% rule. No prices, discounts, or universal personal targets were invented.

**Apply to:** onboarding previews, reports, leaderboards, demo. Avoid inflated comparison prices, fake discounts, and implied universal fitness or money targets.

## 17 · Loss Aversion

**Intent:** reduce accidental loss and support confidence without threatening people into engagement.

**Existing:** old habit targets and logs are preserved; photos have an undo-before-save action; check-ins can be corrected; sharing can be turned off; the stake feature is labeled simulation only.

**Implemented:** the demo is an optional disclosure before a user has commitment history, and onboarding preserves goals earlier (`personal.js`). **Retained:** private demo totals, correctable check-ins, photo undo-before-save, historical logs/targets, and neutral rest-day treatment. **Follow-up:** stopping a habit preserves history but does not yet have a one-click undo action. No real deposits or forfeitures were added.

**Apply to:** routine management, photos, backups, demo, reports. No real deposits or forfeitures are introduced by this design work.

## 18 · Scarcity Effect

**Intent:** communicate real constraints honestly and avoid manufactured urgency.

**Existing:** paid plans say unavailable; schedules describe their real effective date; the auth flow uses a resend cooldown. There are no invented places, stock levels, or expiring discounts in the inspected flow.

**Implemented:** tailored plans have a quiet, accurately labeled unavailable disclosure; confirmation resend shows its actual cooldown and offers recovery from expired or used links (`personal.js`, `account.js`). **Retained:** actual calendar dates and schedule-effective dates. There are no manufactured stock limits, expiring deals, or routine urgency timers.

**Apply to:** confirmation, calendar, paid-plan disclosure, demo. A cooldown protects delivery; it is not a scarcity promotion.

## 19 · Sunk Cost Fallacy

**Intent:** let people change direction without making previous effort a trap.

**Existing:** habits can stop after today while preserving history; the demo can stop; friend requests can be canceled or declined; sharing can be disabled; all suggestions require acceptance.

**Implemented:** optional commitment exploration explicitly says progress works with or without it; routine edit/stop controls now meet the shared 44px minimum (`personal.js`, `polish.css`). **Retained:** stop-after-today actions, preserved history, cancel/decline/remove friendship choices, opt-out sharing, and progression recommendations that require review. Prior effort is never used as a reason to block an exit.

**Apply to:** habit revisions, progression suggestions, commitments, friendships, onboarding. Preserve effort as history, not as pressure.

## 20 · Postel’s Law

**Intent:** accept reasonable user input variations and respond clearly when a value cannot be used.

**Existing:** emails and names are trimmed; friend codes accept whitespace, hyphens, and case differences; number fields use appropriate mobile keyboards; photo selection accepts multiple formats and retains a preview before saving; user text is escaped for rendering.

**Implemented:** confirmation recovery accepts a corrected, trimmed email, offers resend and sign-in, and translates common server errors into plain language. Confirmation success requires server-validated identity and confirmed email status (`account.js`). **Retained:** exact password handling, normalized friend codes, escaped user text, mobile input modes, and photo preview/retry behavior. **Follow-up:** consistent invalid-field focus across every existing form is not established by this revision.

**Apply to:** signup/sign-in, confirmation resend, goals, log values, photo upload, friend codes, backup import. Validate imported structures before they become editable state.

## Release implementation map

The following changes were inspected in the working source after implementation. Source presence is distinct from browser verification or release status.

| Change | Principles supported | Source status |
| --- | --- | --- |
| Free manual routine becomes primary on setup step three | Hick, Von Restorff, Serial Position, Anchoring | Implemented in `personal.js` |
| Persist onboarding choices after step one | Zeigarnik, Tesler, Loss Aversion | Implemented in `personal.js` |
| Optional demo becomes a disclosure before first participation | Hick, Miller, Serial Position, Loss Aversion, Sunk Cost | Implemented in `personal.js`; existing participants retain their history card |
| Wider report-day controls and routine edit/stop targets | Fitts, Aesthetic–Usability, Sunk Cost | Implemented in `polish.css` |
| Preserve report scroll and demo disclosure during refresh | Fitts, Zeigarnik, Response Time | Implemented in `personal.js` following source-review feedback |
| Target duration alongside elapsed focus time | Parkinson, Proximity | Implemented in `personal.js` |
| Coherent symbols, typography, spacing, light/dark palette | Jakob, Similarity, Proximity, Von Restorff, Aesthetic–Usability | Implemented in `icons.js`, `polish.css`, `index.html`, `theme.js` |
| Navigation, sheet, and completion motion tied to real interaction | Doherty, Response Time, Peak–End | Implemented in `motion.js` with calls from `app.js` and `personal.js` |
| Explicit signup confirmation, resend, expired-link recovery, next action | Jakob, Tesler, Response Time, Peak–End, Scarcity, Postel | Implemented in `account.js`; success checks server-confirmed identity |
| Resend delivery configuration | Tesler, Response Time | Domain setup deferred by the user; email delivery is not claimed complete |

### Source review findings

- The original scroll implementation preserved position only after selecting a report day. The minute tick and sync render could reset a monthly chart to its first days. The implementation owner added preservation inside `renderReports()` itself, along with the optional demo disclosure's open state. That correction is observed in source.
- Keyboard input and reduced-motion preference suppress new Web Animations. Escape keeps its native immediate close behavior, and the temporary tab indicator is hidden from accessibility APIs and cannot intercept pointer events.
- A reported motion gap was corrected: an active-animation set now immediately finishes in-flight Web Animations on keyboard input or a live change to reduced motion. The fix is in `motion.js`; CSS-only duration overrides would not have covered this case.
- No further blocking issue was established by this source review. Responsive rendering, real confirmation delivery, and browser interaction still require their own evidence.

### Useful follow-up checks when requested

- Complete signup and confirmation on separate devices; also try expired and reused links.
- Inspect narrow phone, tablet, desktop, keyboard navigation, and reduced motion in both themes.
- Follow a new user from welcome through the first saved habit and a completed day.
- Open a monthly report and select its first and last days with touch-sized controls.
- Confirm that background synchronization does not replay animations or replace an active form.
- Confirm that declining sharing, stopping a routine, and leaving the demo remain straightforward.

These are proposed verification steps, not completed test results.
