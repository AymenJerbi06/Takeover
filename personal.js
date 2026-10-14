'use strict';
/* Personal onboarding and routines use the existing account, sync and design system. */
(() => {
  const T = window.Takeover, P = window.TakeoverPersonal, A = window.TakeoverAccount;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => window.TakeoverIcons.svg(name);
  const today = () => P.dateKey(new Date());
  const percent = value => value === null ? '—' : `${Math.round(value * 100)}%`;
  const label = key => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const uid = () => `h_${crypto.randomUUID().replace(/-/g, '')}`;
  const dialog = $('routine-dialog'), welcome = $('welcome-root');
  let authEntry = !!new URLSearchParams(location.search).get('account') || /access_token|error_description/.test(location.hash);
  let owner = A.user?.id || null, autoOpened = null, opener = null, wizard = null;
  let period = 'week', reportAnchor = today(), selectedDay = today(), timer = null;
  let syncMessage = 'Opening your saved progress…';
  const writable = () => A.user && T.state.syncUser === A.user.id && window.TakeoverSync?.readyUser === A.user.id;
  const commit = text => { T.save(); T.render(); if (text) T.toast(text); };
  const action = (name, text, extra = '', cls = 'account-secondary') => `<button type="button" class="${cls}" data-personal-action="${name}" ${extra}>${text}</button>`;
  const heading = (kicker, title, copy = '') => `<p class="account-eyebrow">${kicker}</p><h2>${title}</h2>${copy ? `<p class="account-note">${copy}</p>` : ''}`;
  const card = (content, cls = '') => `<section class="profile-card ${cls}">${content}</section>`;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Keep existing charts in the document for the original personal dashboard.
  const reportRoot = document.createElement('div'); reportRoot.id = 'personal-progress'; reportRoot.className = 'personal-root';
  $('progress-personal').prepend(reportRoot);
  const back = document.createElement('button'); back.type = 'button'; back.className = 'account-secondary entry-back';
  back.textContent = 'Back to Takeover'; back.onclick = () => { authEntry = false; reconcile(); };
  $('account-root').before(back);

  function drawWelcome() {
    welcome.innerHTML = `<div class="welcome-inner"><header class="welcome-top"><a class="brand" href="#"><span class="brand-icon">${icon('brand')}</span><b>Takeover</b></a><div class="account-actions">${action('theme', icon('sun'), 'aria-label="Switch color theme"')}${action('signin', 'Sign in')}</div></header>
      <div class="welcome-grid"><div class="welcome-copy"><p class="account-eyebrow">YOUR LIFE. YOUR RHYTHM.</p><h1>Small habits.<br>A life that<br>feels like you.</h1><p>Choose what matters. Make a little room for it every day. See how far you’ve come.</p><div class="account-actions">${action('signup', `Make it yours ${icon('arrowRight')}`, '', 'account-primary')}</div><p class="account-note">Your own goals. A little encouragement from friends.</p></div>
      <div class="welcome-preview" aria-label="Example dashboard"><div class="preview-heading"><span>YOUR DAY, SIMPLIFIED</span><span class="demo-badge">Example</span></div><div class="preview-score"><b>75<span>%</span></b><span>A little better, every day.</span></div><div class="preview-habits">${[['exams','Learn something','20 min','blue'],['body','Get moving','15 min','mint'],['plan','Read a few pages','5 pages','violet']].map(([i,t,v,c],n) => `<div><span class="profile-feature-icon ${c}">${icon(i)}</span><b>${t}</b><span>${v}</span><span class="preview-check">${icon(n < 2 ? 'check' : 'plus')}</span></div>`).join('')}</div><div class="preview-footer">${icon('progress')} Progress that belongs to you.</div></div></div>
      <div class="welcome-features">${[['plan','A routine that fits','Start with your goals and the time you actually have.'],['progress','See the bigger picture','Daily check-ins. Weekly insights. Monthly reflections.'],['users','Grow with your circle','Compare completion, while keeping personal details private.']].map(([i,t,c]) => `<div><span class="profile-feature-icon">${icon(i)}</span><h2>${t}</h2><p>${c}</p></div>`).join('')}</div><footer class="welcome-foot">Takeover · One day at a time.</footer></div>`;
  }

  function reconcile() {
    const user = A.user;
    if (owner !== (user?.id || null)) {
      owner = user?.id || null; autoOpened = null; wizard = null; timer = null;
      if (dialog.open) dialog.close();
      if (user) authEntry = false;
    }
    const originalLocal = T.state.experience === 'legacy' && !T.state.syncUser;
    const showWelcome = !user && !authEntry && !originalLocal;
    welcome.hidden = !showWelcome;
    document.body.classList.toggle('welcome-mode', showWelcome);
    document.body.classList.toggle('entry-mode', !user && authEntry);
    document.body.classList.toggle('account-connecting', !!user && !writable());
    back.hidden = !!user;
    if (showWelcome && !welcome.childElementCount) drawWelcome();
    if ((!user && authEntry) || (user && !writable())) {
      if (document.body.dataset.view !== 'profile') T.navigate('profile');
      $('profile-account-tab').click();
    }
    if (user && writable() && T.state.experience === 'personal' && !T.state.personalPlan && autoOpened !== user.id && !A.recovering) {
      autoOpened = user.id; openSetup();
    }
    render();
  }

  function showDialog(html) {
    if (!dialog.open) opener = document.activeElement;
    dialog.innerHTML = `<div class="routine-sheet"><div class="sheet-handle" aria-hidden="true"></div><button class="sheet-close" type="button" data-personal-action="close" aria-label="Close">${icon('close')}</button>${html}</div>`;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('h2')?.focus({ preventScroll: true });
  }
  function sheetTitle(title) { return `<h2 id="routine-dialog-title" tabindex="-1">${title}</h2>`; }
  function showDay(date) {
    const habits = P.scheduledHabits(T.state,date);
    showDialog(`${sheetTitle(label(date))}<p class="account-note">Your scheduled habits · ${percent(P.dayScore(T.state,date))}</p>${habits.map(h=>habitRow(h,date)).join('') || '<p class="account-note">A rest day.</p>'}`);
  }
  dialog.addEventListener('close', () => { wizard = null; if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  function openSetup() {
    if (!writable()) {
      if (!A.user) { authEntry = true; A.openAuth(); reconcile(); }
      else { T.navigate('profile'); T.toast('Wait for your account to sync before editing your routine.'); }
      return;
    }
    const draft = T.state.onboardingDraft || T.state.personalPlan || {};
    wizard = { step: 1, goals: structuredClone(draft.goals || []), context: { dailyMinutes: 30, preferredTime: 'Flexible', ...draft.context } };
    drawSetup();
  }
  function drawSetup() {
    const w = wizard;
    if (!w) return;
    const progress = `<div class="setup-progress" aria-label="Step ${w.step} of 3">${[1,2,3].map(n => `<span class="${n <= w.step ? 'active' : ''}"></span>`).join('')}</div><p class="account-eyebrow">MAKE IT YOURS · ${w.step} / 3</p>`;
    if (w.step === 1) {
      showDialog(`${progress}${sheetTitle('What matters to you?')}<p class="account-note">Choose up to four areas. You can change them later.</p><form id="personal-goals-form"><div class="goal-choices">${P.categories.map(c => `<label class="goal-choice"><input type="checkbox" name="category" value="${c.id}" ${w.goals.some(g => g.category === c.id) ? 'checked' : ''}><span class="profile-feature-icon ${c.tone}">${icon(c.icon)}</span><b>${c.title}</b><span class="choice-check">${icon('check')}</span></label>`).join('')}</div><label class="personal-field">What would you like to work toward?<input name="goalTitle" maxlength="160" placeholder="e.g. Feel stronger and finish two books" value="${esc(w.context.goalTitle || '')}"></label><p class="account-status" role="status"></p><button class="account-primary sheet-primary">Continue ${icon('arrowRight')}</button></form>`);
      $('personal-goals-form').onsubmit = event => {
        event.preventDefault(); const form = event.currentTarget, selected = [...form.querySelectorAll('input:checked')].map(i => i.value);
        if (!selected.length || selected.length > 4) { form.querySelector('[role=status]').textContent = 'Choose between one and four areas.'; return; }
        w.goals = selected.map(category => ({ id: category, category, title: P.category(category).title }));
        w.context.goalTitle = form.elements.goalTitle.value.trim(); w.step = 2; wizard = w; drawSetup();
      };
    } else if (w.step === 2) {
      showDialog(`${progress}${sheetTitle('Make it fit your day.')}<p class="account-note">A small routine you can repeat is a good place to start.</p><form id="personal-context-form" class="account-form"><label>Time for your routine<select name="dailyMinutes">${[10,20,30,45,60,90,120].map(n => `<option value="${n}" ${Number(w.context.dailyMinutes) === n ? 'selected' : ''}>${n} minutes a day</option>`).join('')}</select></label><label>Best time of day<select name="preferredTime">${['Flexible','Morning','Afternoon','Evening'].map(t => `<option ${w.context.preferredTime === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>What should your routine make room for?<textarea name="notes" maxlength="500" rows="3" placeholder="Classes, shifts, family time, rest days…">${esc(w.context.notes || '')}</textarea></label><details class="personal-details"><summary>Optional personal context</summary><p class="account-note">Private to your account. Skip anything you don’t want to share. This does not create a medical or financial plan.</p><label class="personal-field">Current weight (kg)<input name="weight" type="number" min="20" max="500" step="0.1" inputmode="decimal" value="${esc(w.context.weight ?? '')}"></label><label class="personal-field">Monthly income<input name="income" type="number" min="0" max="100000000" step="0.01" inputmode="decimal" value="${esc(w.context.income ?? '')}"></label><label class="personal-field">Currency<input name="currency" maxlength="5" placeholder="USD, CAD…" value="${esc(w.context.currency || '')}"></label></details><div class="account-actions">${action('setup-back','Back')}<button class="account-primary">See my options ${icon('arrowRight')}</button></div></form>`);
      $('personal-context-form').onsubmit = event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        w.context = { ...w.context, dailyMinutes: Number(data.get('dailyMinutes')), preferredTime: data.get('preferredTime'), notes: data.get('notes').trim(), weight: data.get('weight') ? Number(data.get('weight')) : null, income: data.get('income') ? Number(data.get('income')) : null, currency: data.get('currency').trim() };
        T.state.onboardingDraft = { goals: w.goals, context: w.context }; T.save(); w.step = 3; wizard = w; drawSetup();
      };
    } else {
      const examples = P.suggestions(w.goals, w.context);
      showDialog(`${progress}${sheetTitle('Your direction, made clear.')}<p class="account-note">${esc(w.context.goalTitle || w.goals.map(g => g.title).join(' · '))}<br>${w.context.dailyMinutes} minutes · ${esc(w.context.preferredTime.toLowerCase())}</p><div class="plan-preview"><span class="demo-badge">Example habits · preview</span>${examples.map(h => `<div class="preview-idea">${icon(P.category(h.category).icon)}<span>${esc(h.title)}</span><small>${h.target} ${esc(h.unit)}</small></div>`).join('')}</div><div class="billing-lock">${icon('lock')}<div><b>A tailored plan</b><p class="account-note">A complete schedule built around your goals and constraints. Paid plans are coming soon; checkout isn’t available yet.</p><button class="account-primary" disabled>Paid plan · not available yet</button></div></div><div class="manual-option"><h3>Prefer to build your own?</h3><p class="account-note">Create your own habits for free, track progress, and join your friends. You choose each target and schedule.</p>${action('manual',`Create my own routine ${icon('arrowRight')}`, '', 'account-secondary')}</div>${action('setup-back','Back')}`);
    }
  }

  function createManual() {
    if (!wizard || !writable()) return;
    if (!T.state.personalPlan) {
      // Preserve the original dashboard's logs, plan and dates in the same backup.
      if (T.state.experience === 'legacy') T.state.legacyArchive = structuredClone({ startDate: T.state.startDate, plan: T.state.plan, days: T.state.days, weights: T.state.weights, debts: T.state.debts });
      T.state.personalPlan = { version: 1, startedOn: today(), createdAt: new Date().toISOString(), habits: [], commitments: [], source: 'manual' };
      T.state.startDate = today(); T.state.plan = ''; T.state.running = null;
    }
    T.state.experience = 'personal';
    T.state.personalPlan.goals = structuredClone(wizard.goals); T.state.personalPlan.context = structuredClone(wizard.context);
    delete T.state.onboardingDraft;
    dialog.close(); commit('Your space is ready. Add your first habit.'); T.navigate('today'); editHabit();
  }

  function editHabit(id, suggestion) {
    if (!writable()) return;
    if (!T.state.personalPlan) return openSetup();
    const old = T.state.personalPlan.habits.find(h => h.id === id);
    const h = old || { title: '', category: T.state.personalPlan.goals?.[0]?.category || 'other', target: 1, unit: 'times', days: [0,1,2,3,4,5,6] };
    const hasHabits = T.state.personalPlan.habits.length > 0;
    const starts = hasHabits ? P.shift(today(), 1) : today();
    showDialog(`${sheetTitle(old ? 'Adjust your habit' : 'A small step, your way.')}<p class="account-note">${hasHabits ? `Changes start ${label(starts)}. Today’s targets and past scores stay the same.` : 'Choose a realistic target. You can make it bigger later.'}</p><form id="habit-form" class="account-form"><label>Habit name<input name="title" maxlength="70" placeholder="e.g. Read before bed" value="${esc(h.title)}" required></label><div class="personal-form-row"><label class="personal-field">Target<input name="target" type="number" min="0.1" max="100000" step="0.1" inputmode="decimal" value="${suggestion || h.target}" required></label><label class="personal-field">Measure<select name="unit">${['times','minutes','pages','steps','hours','sessions'].map(u => `<option ${h.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div><label>Area<select name="category">${P.categories.map(c => `<option value="${c.id}" ${c.id === h.category ? 'selected' : ''}>${c.title}</option>`).join('')}</select></label><fieldset class="habit-days"><legend>Repeat on</legend>${[1,2,3,4,5,6,0].map(n => `<label><input type="checkbox" name="days" value="${n}" ${h.days.includes(n) ? 'checked' : ''}><span>${dayNames[n]}</span></label>`).join('')}</fieldset><p class="account-status" role="status"></p><button class="account-primary">${old ? 'Save adjustment' : 'Add habit'}</button></form>`);
    $('habit-form').onsubmit = event => {
      event.preventDefault(); if (!writable()) return;
      const form = event.currentTarget, data = new FormData(form), days = data.getAll('days').map(Number), title = data.get('title').trim();
      if (!days.length || !title) { form.querySelector('[role=status]').textContent = 'Add a name and at least one day.'; return; }
      const activeHabits = T.state.personalPlan.habits.filter(h => !h.endsOn || h.endsOn > starts);
      if (!old && activeHabits.length >= 12) { form.querySelector('[role=status]').textContent = 'Keep your routine focused with up to 12 active habits.'; return; }
      if (old) old.endsOn = starts;
      T.state.personalPlan.habits.push({ id: uid(), title, target: Number(data.get('target')), unit: data.get('unit'), category: data.get('category'), days, startsOn: starts });
      dialog.close(); commit(`Habit ${old ? 'updated' : 'added'} · starts ${label(starts)}`);
    };
  }

  function logHabit(id, date = today()) {
    if (!writable() || date > today()) return;
    const h = P.scheduledHabits(T.state, date).find(h => h.id === id); if (!h) return;
    showDialog(`${sheetTitle(esc(h.title))}<p class="account-note">${label(date)} · target ${h.target} ${esc(h.unit)}</p><form id="habit-log-form" class="account-form"><label>How much did you do?<input autofocus name="value" type="number" inputmode="decimal" step="0.1" min="0" max="1000000" value="${P.value(T.state, date, id)}" required></label><button class="account-primary">Save check-in ${icon('check')}</button><p class="account-note">You can correct a log at any time. Scores and demo totals will recalculate.</p></form>`);
    $('habit-log-form').onsubmit = event => { event.preventDefault(); setLog(h.id, date, Number(event.currentTarget.elements.value.value)); dialog.close(); };
  }
  function setLog(id, date, value) {
    if (!writable()) return;
    if (!T.state.days[date]) T.state.days[date] = { habits: {} };
    T.state.days[date].habits ||= {}; T.state.days[date].habits[id] = Math.max(0, value);
    commit('Check-in saved');
  }

  function habitRow(h, date, editable = true) {
    const v = P.value(T.state, date, h.id), done = v >= h.target, c = P.category(h.category);
    return `<div class="personal-habit ${done ? 'is-done' : ''}"><span class="profile-feature-icon ${c.tone}">${icon(c.icon)}</span><div class="habit-copy"><b>${esc(h.title)}</b><span>${v.toLocaleString()} / ${h.target.toLocaleString()} ${esc(h.unit)}</span><div class="habit-meter" role="progressbar" aria-label="${esc(h.title)}" aria-valuenow="${Math.round(Math.min(1, v / h.target) * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, v / h.target * 100)}%"></i></div></div>${editable ? action(h.unit === 'times' && h.target === 1 ? 'toggle-habit' : 'log', icon(done ? 'check' : 'plus'), `data-habit="${h.id}" data-date="${date}" aria-label="${done ? 'Edit' : 'Log'} ${esc(h.title)}" ${h.unit === 'times' && h.target === 1 ? `aria-pressed="${done}"` : ''}`, 'habit-check') : `<span class="muted">${percent(Math.min(1,v / h.target))}</span>`}</div>`;
  }

  function renderToday() {
    const s = T.state, p = s.personalPlan, date = today(), habits = P.scheduledHabits(s, date), score = P.dayScore(s, date);
    const done = habits.filter(h => P.value(s, date, h.id) >= h.target).length;
    const next = habits.find(h => P.value(s, date, h.id) < h.target);
    const name = A.profile?.display_name?.split(/\s+/)[0] || 'you';
    const day = new Date().getDay(), monday = P.shift(date, -((day + 6) % 7));
    $('personal-today').innerHTML = `<section class="personal-hero"><div><p class="account-eyebrow">A LITTLE TIME FOR ${esc(name.toUpperCase())}</p><h2>${habits.length ? done === habits.length ? 'You showed up.' : 'Make today yours.' : 'Room to recharge.'}</h2><p>${habits.length ? `${done} of ${habits.length} habits complete. ${done === habits.length ? 'Enjoy the rest of your day.' : 'One small step at a time.'}` : 'No habits scheduled today. Your next day is ready when you are.'}</p>${next ? action('log',`Next: ${esc(next.title)} ${icon('arrowRight')}`,`data-habit="${next.id}"`, 'account-primary') : action('manage','Your routine', '', 'account-primary')}</div><div class="personal-ring" style="--completion:${Math.round((score || 0) * 100)}%"><div><b>${percent(score)}</b><span>today</span></div></div></section>
      <div class="personal-week" aria-label="This week">${Array.from({length:7}, (_,i) => { const k = P.shift(monday,i), sc = P.dayScore(s,k); return `<button type="button" data-personal-action="day" data-date="${k}" ${k > date ? 'disabled' : ''} aria-label="${label(k)}: ${k > date ? 'upcoming' : sc === null ? 'rest day' : percent(sc)}" ${k === date ? 'aria-current="date"' : ''}><span>${dayNames[new Date(`${k}T12:00:00`).getDay()]}</span><b class="${sc >= .8 ? 'week-done' : ''}">${sc >= 1 && k <= date ? icon('check') : Number(k.slice(-2))}</b><i class="${sc > 0 && k <= date ? 'has-progress' : ''}"></i></button>`; }).join('')}</div>
      ${card(`<div class="personal-card-head"><h2>Your habits</h2>${action('add',`${icon('plus')} Add`)}</div>${habits.length ? habits.map(h => habitRow(h,date)).join('') : '<p class="account-note">Rest days count as rest, not missed goals.</p>'}<div class="personal-card-foot">${action('manage',`Manage routine ${icon('chevronRight')}`, '', 'link')}<span>${p.context?.dailyMinutes || 30} min available / day</span></div>`)}
      <div class="personal-shortcuts">${action('reports',`${icon('progress')} Your reports ${icon('chevronRight')}`)}${action('friends',`${icon('users')} Your circle ${icon('chevronRight')}`)}</div>`;
  }

  function renderFocus() {
    const habits = P.scheduledHabits(T.state,today()).filter(h => h.unit === 'minutes');
    $('personal-focus').innerHTML = card(`${heading('ONE THING AT A TIME','A little space to focus.','Choose a timed habit. Your session is saved when you finish.')}<div class="personal-timer" id="personal-timer">${timer ? timerMarkup() : `${icon('focus')}<b>Ready when you are.</b><p class="account-note">A quieter moment for your next small step.</p>`}</div>${habits.map(h => `<div class="personal-habit"><span class="profile-feature-icon ${P.category(h.category).tone}">${icon(P.category(h.category).icon)}</span><div class="habit-copy"><b>${esc(h.title)}</b><span>${h.target} minutes · ${P.value(T.state,today(),h.id)} logged</span></div>${action('timer',timer?.id === h.id ? 'Finish' : 'Start', `data-habit="${h.id}" ${timer && timer.id !== h.id ? 'disabled' : ''}`)}</div>`).join('') || `<p class="account-note">Add a habit measured in minutes to use focus sessions.</p>${action('add',`${icon('plus')} Add a timed habit`)}`}<p class="account-note">Keep this tab open during a session. Check-ins can also be entered manually.</p>`);
  }
  function timerText() { const elapsed = Math.max(0, Math.floor((Date.now()-timer.start)/1000)); return `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2,'0')}`; }
  function timerMarkup() { return `<span class="account-eyebrow">${esc(timer.title)}</span><b id="personal-elapsed">${timerText()}</b>${action('timer','Finish & save',`data-habit="${timer.id}"`,'account-primary')}`; }
  function renderTimerDock() {
    const dock = $('session-dock'); dock.hidden = !timer;
    if (timer) dock.innerHTML = `<a class="session-return" href="#view-focus" data-view-target="focus"><span class="session-indicator">${icon('focus')}</span><span><small>FOCUSING</small><b>${esc(timer.title)}</b></span></a><span class="session-clock" id="personal-dock-clock">${timerText()}</span>${action('timer','Finish',`data-habit="${timer.id}"`,'account-secondary')}`;
  }

  function renderPlan() {
    const p = T.state.personalPlan;
    $('personal-plan').innerHTML = card(`<div class="personal-card-head"><div>${heading('BUILT BY YOU','Your routine',esc(p.context?.goalTitle || 'Small steps toward what matters.'))}</div>${action('manage','Edit routine')}</div><div class="goal-pills">${(p.goals || []).map(g => `<span>${icon(P.category(g.category).icon)}${esc(g.title)}</span>`).join('')}</div><p class="account-note">${p.context?.dailyMinutes || 30} minutes available · ${esc(p.context?.preferredTime || 'Flexible')}</p>${action('setup','Edit goals & availability', '', 'link')}`);
  }

  function renderReports() {
    const r = P.report(T.state,period,reportAnchor), prev = P.report(T.state,period,P.shift(r.start,-1)), delta = r.average !== null && prev.average !== null ? Math.round((r.average - prev.average)*100) : null;
    const selected = r.days.find(d => d.key === selectedDay) || r.days.findLast(d => !d.future) || r.days[0];
    selectedDay = selected.key;
    const previousWeek = P.report(T.state,'week',P.shift(P.bounds('week',today()).start,-1));
    const previousMonth = P.report(T.state,'month',P.shift(P.bounds('month',today()).start,-1));
    const archive = [previousWeek,previousMonth];
    reportRoot.innerHTML = card(`<div class="personal-card-head"><div>${heading('YOUR PROGRESS','Small steps add up.')}</div><div class="destination-tabs" role="group" aria-label="Report period">${[['day','Day'],['week','Week'],['month','Month']].map(([id,title]) => action('period',title,`data-period="${id}" aria-pressed="${period === id}"`)).join('')}</div></div><div class="report-navigation">${action('previous',icon('chevronLeft'),'aria-label="Previous period"')}<div><b>${label(r.start)}${r.start !== r.end ? ` – ${label(r.end)}` : ''}</b><span>${r.complete ? 'Completed report' : 'In progress'}</span></div>${action('next',icon('chevronRight'),`aria-label="Next period" ${r.end >= today() ? 'disabled' : ''}`)}</div><div class="personal-report-stats"><div><span>Completion</span><b>${percent(r.average)}</b><small>${delta === null ? 'Your own scheduled habits' : `${delta >= 0 ? '+' : ''}${delta} pts vs previous period`}</small></div><div><span>Strong days</span><b>${r.wins}<small> / ${r.scheduled}</small></b><small>At least 80% complete</small></div><div><span>Progress points</span><b>${r.points}</b><small>Up to 100 per scheduled day</small></div></div><div class="personal-bars" role="group" aria-label="Daily completion in this period">${r.days.map(d => `<button type="button" data-personal-action="report-day" data-date="${d.key}" aria-label="${label(d.key)}: ${d.future ? 'upcoming' : d.score === null ? 'rest day' : percent(d.score)}" aria-pressed="${d.key === selectedDay}" ${d.future ? 'disabled' : ''}><span><i style="height:${d.score === null ? 0 : Math.max(2, d.score*100)}%"></i></span><small>${Number(d.key.slice(-2))}</small></button>`).join('')}</div><div class="report-day-detail" aria-live="polite"><b>${label(selectedDay)} · ${selected.future ? 'Upcoming' : selected.score === null ? 'No scheduled habits' : percent(selected.score)}</b><span>Rest days are excluded. Unlogged scheduled habits count as zero.</span></div><div class="report-habits">${r.habits.map(h => `<div><span>${esc(h.title)}</span><b>${h.completed}/${h.scheduled}</b><small>completed</small></div>`).join('') || '<p class="account-note">Your first report starts with your first scheduled habit.</p>'}</div>`) +
      card(`${heading('PAUSE & REFLECT','Your completed reports')}<div class="completed-reports">${archive.map((a,i) => `<button type="button" data-personal-action="archive" data-period="${i ? 'month' : 'week'}" data-date="${a.start}"><span class="profile-feature-icon ${i ? 'violet' : 'mint'}">${icon('progress')}</span><span><b>Last ${i ? 'month' : 'week'}</b><small>${label(a.start)} – ${label(a.end)}</small></span><strong>${percent(a.average)}</strong>${icon('chevronRight')}</button>`).join('')}</div><p class="account-note">Reports update automatically from your saved logs. A full review is available after each week and month ends.</p>`) +
      (r.complete && r.scheduled ? card(`${heading('YOUR NEXT SMALL STEP',r.average >= .85 ? 'Ready for a little more?' : 'Find your sustainable pace.', r.average >= .85 ? 'Keep your routine, or review one small adjustment. You stay in control.' : 'Try keeping your targets manageable and making room for the habits you enjoy.')}<div>${r.recommendations.slice(0,2).map(h => `<div class="personal-habit"><div class="habit-copy"><b>${esc(h.title)}</b><span>Try ${h.target} minutes on the same days</span></div>${action('recommend','Review',`data-habit="${h.id}" data-target="${h.target}"`)}</div>`).join('') || action('manage','Review my routine')}</div><p class="account-note">Suggestions use your logged completion. They never change your plan automatically.</p>`) : '') + renderCommitmentCard();
  }

  function renderCommitmentCard() {
    const total = P.commitment(T.state), active = T.state.personalPlan?.commitments?.find(c => !c.endsOn);
    return card(`<div class="personal-card-head"><h2>Show up for yourself</h2><span class="demo-badge">Demo · no real money</span></div><p class="account-note">Try a pretend $5 or $10 commitment on scheduled days. Reach 100% to keep it. This is a simulation, not a wallet.</p><div class="demo-totals"><span><small>Kept in demo</small><b>$${total.kept}</b></span><span><small>Missed in demo</small><b>$${total.lost}</b></span><span><small>Today’s demo</small><b>$${total.pending}</b></span></div><p class="account-note">${active ? `$${active.amount}/day · starts ${label(active.startedOn)}${active.startedOn > today() ? ' (tomorrow)' : ''}` : 'Optional. Your real balance is always $0.'}</p>${action('billing',active ? 'Manage demo' : 'Explore the demo')}`);
  }
  function openBilling() {
    const active = T.state.personalPlan?.commitments?.find(c => !c.endsOn);
    showDialog(`${sheetTitle('Plans & commitments')}<div class="billing-lock">${icon('lock')}<div><h3>Tailored plans</h3><p class="account-note">A paid plan built around your goals, availability and constraints. Pricing and Stripe checkout are not available yet.</p><button disabled class="account-primary">Checkout coming soon</button></div></div><div class="manual-option"><span class="demo-badge">Simulation only</span><h3>A little accountability</h3><p class="account-note">Choose a pretend daily amount. On scheduled days, 100% completion keeps it; lower scores mark it missed after midnight on your device. Rest days are skipped. Editing a log recalculates the demo. No deposits, charges, payouts or losses occur.</p>${!T.state.personalPlan ? `<p class="account-note">Create your routine to try the demo.</p>${action('setup','Create routine')}` : active ? `<p><b>$${active.amount}/day demo is ${active.startedOn > today() ? 'scheduled' : 'active'}.</b></p>${action('stop-demo','Stop after today')}` : `<div class="account-actions">${action('start-demo','$5 / scheduled day','data-amount="5"')}${action('start-demo','$10 / scheduled day','data-amount="10"')}</div><p class="account-note">Starts tomorrow. Cancel any time. Demo totals stay private.</p>`}</div>`);
  }

  function manage() {
    if (!T.state.personalPlan) return openSetup();
    const tomorrow = P.shift(today(),1), list = T.state.personalPlan.habits.filter(h => !h.endsOn || h.endsOn > today());
    showDialog(`${sheetTitle('Your routine')}<p class="account-note">Targets are yours to choose. Updates apply tomorrow; your history stays intact.</p><div class="routine-list">${list.map(h => `<div class="personal-habit"><span class="profile-feature-icon ${P.category(h.category).tone}">${icon(P.category(h.category).icon)}</span><div class="habit-copy"><b>${esc(h.title)}</b><span>${h.target} ${esc(h.unit)} · ${h.days.map(d => dayNames[d]).join(', ')}</span>${h.startsOn > today() ? '<small>Starts tomorrow</small>' : ''}${h.endsOn ? '<small>Ends after today</small>' : ''}</div>${!h.endsOn ? `${action('edit',icon('edit'),`data-habit="${h.id}" aria-label="Edit ${esc(h.title)}"`)}${action('remove',icon('close'),`data-habit="${h.id}" aria-label="Stop ${esc(h.title)} after today"`)}` : ''}</div>`).join('') || '<p class="account-note">Your first habit can be a very small one.</p>'}</div><div class="account-actions">${action('add',`${icon('plus')} Add a habit`)}${action('setup','Goals & availability')}</div>${T.state.legacyArchive ? '<p class="account-note">Your previous dashboard is preserved in your exported backup under legacyArchive.</p>' : ''}`);
  }

  function render() {
    const personal = T.state.experience === 'personal';
    ['personal-today','personal-focus','personal-plan','personal-progress'].forEach(id => $(id).hidden = !personal);
    if (!personal) return;
    if (!T.state.personalPlan) {
      const empty = card(`${heading('YOUR OWN STARTING POINT','Let’s make room for your goals.',A.user ? writable() ? 'Start with what matters to you and the time you have.' : esc(syncMessage) : 'Sign in to create your own routine.')}<div class="account-actions">${action('setup','Set up my goals', '', 'account-primary')}</div>`);
      ['personal-today','personal-focus','personal-plan','personal-progress'].forEach(id => $(id).innerHTML = empty); return;
    }
    // Background sync must not destroy a form or a focused check-in control.
    const focused = document.activeElement?.closest('[data-personal-action]');
    const focusKey = focused && { action: focused.dataset.personalAction, habit: focused.dataset.habit, date: focused.dataset.date };
    renderToday(); renderFocus(); renderPlan(); renderReports(); renderTimerDock();
    if (focused && !focused.isConnected && focusKey) {
      const candidates = [...document.querySelectorAll('[data-personal-action]')];
      candidates.find(b => b.dataset.personalAction === focusKey.action && b.dataset.habit === focusKey.habit && b.dataset.date === focusKey.date)?.focus({preventScroll:true});
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-personal-action]'); if (!button || button.disabled) return;
    const name = button.dataset.personalAction, id = button.dataset.habit, date = button.dataset.date || today();
    if (name === 'close') { dialog.close(); return; }
    if (name === 'theme') { $('theme-toggle').click(); return; }
    if (name === 'signup' || name === 'signin') { authEntry = true; A.openAuth(name); reconcile(); return; }
    if (['setup','billing'].includes(name)) { if (name === 'setup') openSetup(); else openBilling(); return; }
    if (name === 'setup-back' && wizard) { wizard.step--; drawSetup(); return; }
    if (name === 'manual') { createManual(); return; }
    if (!T.state.personalPlan) return;
    if (['add','edit','recommend','remove','log','toggle-habit','start-demo','stop-demo','timer'].includes(name) && !writable()) { T.toast('Sign in and sync before changing your routine.'); return; }
    const h = T.state.personalPlan.habits.find(h => h.id === id);
    if (name === 'manage') manage();
    if (name === 'add') editHabit();
    if (name === 'edit' || name === 'recommend') editHabit(id, Number(button.dataset.target) || undefined);
    if (name === 'remove' && h) { h.endsOn = P.shift(today(),1); commit('Habit stops after today. Past scores are kept.'); manage(); }
    if (name === 'log') logHabit(id,date);
    if (name === 'toggle-habit' && h) {
      const inDaySheet = dialog.contains(button);
      setLog(id,date,P.value(T.state,date,id) >= h.target ? 0 : h.target);
      if (inDaySheet) {
        showDay(date);
        [...dialog.querySelectorAll('[data-personal-action="toggle-habit"]')].find(b => b.dataset.habit === id)?.focus({preventScroll:true});
      }
    }
    if (name === 'day') showDay(date);
    if (name === 'reports') T.navigate('progress');
    if (name === 'friends') { T.navigate('progress'); $('progress-friends-tab').click(); }
    if (name === 'period') { period = button.dataset.period; reportAnchor = today(); renderReports(); }
    if (name === 'previous' || name === 'next') { const r = P.bounds(period,reportAnchor); reportAnchor = P.shift(name === 'previous' ? r.start : r.end,name === 'previous' ? -1 : 1); renderReports(); }
    if (name === 'report-day') { selectedDay = date; renderReports(); }
    if (name === 'archive') { period = button.dataset.period; reportAnchor = date; renderReports(); }
    if (name === 'start-demo') {
      const amount = Number(button.dataset.amount); if (![5,10].includes(amount)) return;
      const rounds = T.state.personalPlan.commitments ||= [];
      if (!rounds.some(c => !c.endsOn)) rounds.push({ amount, startedOn: P.shift(today(),1) });
      commit('Demo starts tomorrow. No real money is involved.'); openBilling();
    }
    if (name === 'stop-demo') { const c = T.state.personalPlan.commitments.find(c=>!c.endsOn); if(c)c.endsOn=P.shift(today(),1); commit('Demo ends after today.'); openBilling(); }
    if (name === 'timer' && h) {
      if (timer?.id === id) { const minutes = Math.round((Date.now()-timer.start)/6000)/10; const session = timer; timer=null; setLog(id,session.day,P.value(T.state,session.day,id)+minutes); }
      else if (!timer) { timer={id, title:h.title,day:today(),start:Date.now()}; renderFocus(); }
      renderTimerDock();
    }
  });
  window.addEventListener('takeover:account', reconcile);
  window.addEventListener('takeover:sync-ready', reconcile);
  window.addEventListener('takeover:sync-choice', () => { T.navigate('profile'); $('profile-account-tab').click(); });
  window.addEventListener('takeover:sync-status', event => { syncMessage = event.detail.text; if (!T.state.personalPlan) render(); });
  window.addEventListener('takeover:section', event => { if (event.detail.group === 'progress' && event.detail.name === 'personal') renderReports(); });
  window.addEventListener('hashchange', () => { if (!A.user && authEntry && !location.hash.includes('profile')) reconcile(); });
  window.addEventListener('beforeunload', event => { if (timer) { event.preventDefault(); event.returnValue = ''; } });
  setInterval(() => { if (timer) { if ($('personal-elapsed')) $('personal-elapsed').textContent = timerText(); if ($('personal-dock-clock')) $('personal-dock-clock').textContent = timerText(); } },1000);
  window.TakeoverPersonalUI = { render, tick: render };
  reconcile();
  delete document.documentElement.dataset.personalEntry;
})();
