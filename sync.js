'use strict';
/* One cloud row per account. Sync cycles are serialized and compare the remote row
   revision before writing; the dashboard with the newer updatedAt still wins. */
(() => {
  const T = window.Takeover;
  // config.js wins when filled in; otherwise use the keys Vercel serves from its env vars (api/config.js).
  const local = window.TAKEOVER_CONFIG || {}, env = window.TAKEOVER_ENV || {};
  const cfg = local.supabaseUrl && local.supabaseAnonKey ? local : env;
  const box = document.getElementById('sync-box');
  const indicator = document.getElementById('sync-indicator');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  function setStatus(kind, text, label) {
    const dot = box.querySelector('.sync-dot'), msg = box.querySelector('.sync-msg');
    if (dot) dot.className = `sync-dot ${kind}`;
    if (msg) msg.textContent = text;
    if (indicator) {
      indicator.dataset.status = kind;
      indicator.querySelector('[data-sync-label]').textContent = label || ({ ok: 'Synced', busy: 'Syncing', err: 'Sync paused' }[kind] || 'This device only');
      indicator.title = text;
    }
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    box.innerHTML = '<b>Saved on this device only</b><p class="muted">Cloud sync is not connected. Changes on this phone or computer will not appear on your other devices.</p><p class="muted">Connect the website to Supabase, then sign in with the same email on each device. Export a backup below to keep a copy of your current progress.</p>';
    setStatus('', 'Cloud sync is not connected. Your progress stays in this browser.');
    return;
  }
  if (!window.supabase?.createClient) {
    box.innerHTML = '<b>Cloud sync</b> <span class="muted">— could not load Supabase (offline?). Your data is still saved on this device.</span>';
    setStatus('err', 'Cloud sync could not load. Reload when you are online.');
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let user = null;
  let timer = null, active = null, pending = false, sessionVersion = 0;
  let deferredRemote = false;
  let firstChoice = null, needsChoice = false;
  const POLL_MS = 10000;
  const editing = () => !document.hidden && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');

  function draw() {
    if (user) {
      box.innerHTML = `<div><b>Cloud sync</b> · ${esc(user.email)}</div>
        <div class="small" role="status"><span class="sync-dot" aria-hidden="true"></span><span class="sync-msg"></span></div>
        <p class="muted">Use this same email on your other devices. Updates refresh automatically.</p>
        <div class="tiny-actions"><button type="button" id="sync-now">Sync now</button><button type="button" class="link" id="sync-out">Sign out</button></div>
        <div id="sync-choice" hidden><p><b>Choose the progress to keep</b></p><p class="muted">This device and your account have separate saves. Export a backup below before replacing either copy.</p><div class="tiny-actions"><button type="button" id="sync-use-cloud">Use account progress</button><button type="button" id="sync-use-device">Use this device’s progress</button></div></div>`;
      box.querySelector('#sync-now').onclick = () => pull();
      const choose = choice => {
        firstChoice = choice; needsChoice = false;
        box.querySelector('#sync-choice').hidden = true;
        pull();
      };
      box.querySelector('#sync-use-cloud').onclick = () => choose('cloud');
      box.querySelector('#sync-use-device').onclick = () => choose('device');
      box.querySelector('#sync-out').onclick = async () => {
        const { error } = await sb.auth.signOut();
        if (error) setStatus('err', error.message);
      };
    } else {
      box.innerHTML = `<div><b>Cloud sync</b> <span class="muted small">— sign in to keep your data safe and use it on every device</span></div>
        <form id="sync-form">
          <input name="email" type="email" placeholder="Email" aria-label="Sync account email" autocomplete="email" required>
          <input name="password" type="password" placeholder="Password (6+ chars)" aria-label="Sync account password" autocomplete="current-password" minlength="6" required>
          <div class="tiny-actions"><button name="in">Sign in</button><button name="up" class="link">Create account</button></div>
        </form>
        <div class="small" role="status"><span class="sync-dot" aria-hidden="true"></span><span class="sync-msg"></span></div>`;
      setStatus('', 'Sign in with the same email on your phone and desktop.', 'Sign in to sync');
      const f = box.querySelector('#sync-form');
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const creds = { email: f.email.value.trim(), password: f.password.value };
        setStatus('busy', 'Working…');
        try {
          if (e.submitter?.name === 'up') {
            const { data, error } = await sb.auth.signUp(creds);
            if (error) return setStatus('err', error.message);
            if (!data.session) setStatus('', 'Account created — confirm the email we sent you, then sign in here.', 'Confirm email');
          } else {
            const { error } = await sb.auth.signInWithPassword(creds);
            if (error) setStatus('err', error.message);
          }
        } catch { setStatus('err', 'Could not connect. Please try again when you are online.'); }
      });
    }
  }

  function requestSync(delay = 0) {
    if (!user || needsChoice) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; sync(); }, delay);
  }

  function pull() { requestSync(); }

  async function sync() {
    if (!user || active || needsChoice) return;
    pending = false;
    const account = user.id, version = sessionVersion;
    const current = () => user?.id === account && sessionVersion === version;
    const controller = new AbortController();
    active = controller;
    let retry = false;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      if (navigator.onLine === false) {
        setStatus('err', 'Offline. Your changes stay on this device and will retry when you reconnect.', 'Offline');
        return;
      }
      const { data: row, error } = await sb.from('takeover_state').select('data, updated_at')
        .eq('user_id', account).maybeSingle().abortSignal(controller.signal);
      if (!current()) return;
      if (error) throw error;
      const local = T.state, remote = row?.data;
      const firstTimeHere = local.syncUser !== account;
      let useRemote = remote && (remote.updatedAt || 0) > (local.updatedAt || 0);
      if (remote && firstTimeHere) {
        if (local.updatedAt && !firstChoice) {
          needsChoice = true;
          clearTimeout(timer); timer = null; pending = false;
          box.querySelector('#sync-choice').hidden = false;
          setStatus('busy', 'Choose which progress to keep in More → Cloud sync.', 'Choose progress');
          return;
        }
        useRemote = firstChoice !== 'device';
        if (!useRemote) {
          local.updatedAt = Math.max(Date.now(), (remote.updatedAt || 0) + 1, (local.updatedAt || 0) + 1);
          T.save(false);
        }
      }
      if (useRemote) {
        if (editing()) {
          deferredRemote = true;
          setStatus('busy', 'Cloud updates are ready. Finish editing to refresh.', 'Update ready');
          return;
        }
        T.state = { ...remote, syncUser: account };
        T.save(false); T.render();
        firstChoice = null;
      }
      deferredRemote = false;
      const state = T.state;
      const needsWrite = !remote || (state.updatedAt || 0) !== (remote.updatedAt || 0)
        || state.challengeReset !== remote.challengeReset;
      if (!needsWrite) {
        if (state.syncUser !== account) { state.syncUser = account; T.save(false); }
        firstChoice = null;
        setStatus('ok', `Synced ${time()}`);
        return;
      }
      // Freeze the outgoing copy. Edits during the request trigger another cycle.
      const snapshot = JSON.parse(JSON.stringify({ ...state, syncUser: account }));
      const updatedAt = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at) || 0) + 1)).toISOString();
      const payload = { data: snapshot, updated_at: updatedAt };
      setStatus('busy', 'Saving your changes…', 'Saving');
      // Only write the row revision we read. If another device wrote first, read again.
      const query = row
        ? sb.from('takeover_state').update(payload).eq('user_id', account).eq('updated_at', row.updated_at)
        : sb.from('takeover_state').insert({ user_id: account, ...payload });
      const { data: saved, error: writeError } = await query.select('updated_at').maybeSingle().abortSignal(controller.signal);
      if (!current()) return;
      if (writeError?.code === '23505' || (!writeError && !saved)) { retry = true; return; }
      if (writeError) throw writeError;
      T.state.syncUser = account; T.save(false);
      firstChoice = null;
      if (T.state.updatedAt !== snapshot.updatedAt) {
        pending = true;
        setStatus('busy', 'Saving your latest changes…', 'Saving');
      } else {
        setStatus('ok', `Synced ${time()}`);
      }
    } catch (error) {
      if (current()) {
        retry = true;
        if (error.code === 'PGRST205' || error.code === '42P01') {
          setStatus('err', 'Cloud storage is not set up yet. Your progress is saved on this device.', 'Setup needed');
        } else {
          setStatus('err', `Sync paused. Your local progress is kept; we will retry. ${error.message || 'Connection timed out.'}`);
        }
      }
    } finally {
      clearTimeout(timeout);
      active = null;
      if (user && (pending || (current() && retry))) requestSync(retry ? POLL_MS : 0);
    }
  }

  window.TakeoverSync = {
    schedule() {
      if (!user) return;
      if (needsChoice) {
        setStatus('busy', 'Saved on this device. Choose which progress to keep in More → Cloud sync.', 'Choose progress');
        return;
      }
      setStatus('busy', 'Saved on this device. Uploading your changes…', 'Saving');
      requestSync(750);
    },
    pull,
  };

  // Poll only visible pages; failed uploads also retry through the queue.
  setInterval(() => { if (!document.hidden && !active && !timer) pull(); }, POLL_MS);
  window.addEventListener('online', pull);
  window.addEventListener('focus', () => { if (!document.hidden) pull(); });
  document.addEventListener('focusout', () => { if (deferredRemote) requestSync(100); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || pending) pull();
  });

  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user || null;
    if (u?.id === user?.id) return;
    sessionVersion++;
    active?.abort();
    clearTimeout(timer); timer = null;
    pending = false; deferredRemote = false; firstChoice = null; needsChoice = false;
    user = u;
    draw();
    if (user) { setStatus('busy', 'Connecting your account…'); requestSync(); }
  });
  draw();
})();
