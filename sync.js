'use strict';
/* One cloud row per account. Sync cycles are serialized and compare the remote row
   revision before writing; the dashboard with the newer updatedAt still wins. */
(() => {
  const T = window.JourMax;
  // config.js wins when filled in; otherwise use the keys Vercel serves from its env vars (api/config.js).
  const local = window.TAKEOVER_CONFIG || {}, env = window.TAKEOVER_ENV || {};
  const cfg = local.supabaseUrl && local.supabaseAnonKey ? local : env;
  const box = document.getElementById('sync-box');
  const indicator = document.getElementById('sync-indicator');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  function setStatus(kind, text, label) {
    window.dispatchEvent(new CustomEvent('takeover:sync-status', { detail: { kind, text } }));
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

  const sb = window.TakeoverAccount?.client;
  if (!sb) return;
  let user = null;
  let timer = null, active = null, pending = false, sessionVersion = 0;
  let deferredRemote = false;
  let firstChoice = null, needsChoice = false;
  let readyUser = null;
  function ready(account) {
    readyUser = account;
    window.dispatchEvent(new CustomEvent('takeover:sync-ready', { detail: { userId: account } }));
  }
  const POLL_MS = 10000;
  const editing = () => !document.hidden && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');

  function draw() {
    if (user) {
      box.innerHTML = '<div class="small" role="status"><span class="sync-dot" aria-hidden="true"></span><span class="sync-msg"></span></div><p class="account-note">Changes refresh automatically on your signed-in devices.</p><button class="account-secondary" type="button" id="sync-now">Sync now</button><div id="sync-choice" hidden><h3>Which progress should we keep?</h3><p class="account-note" id="sync-choice-description"></p><div class="tiny-actions"><button type="button" id="sync-use-cloud">Use account progress</button><button type="button" id="sync-use-device">Use this device’s progress</button></div></div>';
      box.querySelector('#sync-now').onclick = () => pull();
      const choose = choice => {
        firstChoice = choice; needsChoice = false;
        box.querySelector('#sync-choice').hidden = true; pull();
      };
      box.querySelector('#sync-use-cloud').onclick = () => choose('cloud');
      box.querySelector('#sync-use-device').onclick = () => choose('device');
    } else {
      box.innerHTML = '<div class="small" role="status"><span class="sync-dot" aria-hidden="true"></span><span class="sync-msg"></span></div><p class="account-note">Sign in above to bring your progress to every device.</p>';
      setStatus('', 'Progress is saved in this browser.', 'Sign in to sync');
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
      // A browser can still hold the previous account's private dashboard after
      // sign-out. Never copy that dashboard into a new account implicitly.
      const belongsToAnotherAccount = local.syncUser && local.syncUser !== account;
      if (firstTimeHere && !firstChoice && ((remote && local.updatedAt) || belongsToAnotherAccount)) {
        needsChoice = true;
        clearTimeout(timer); timer = null; pending = false;
        box.querySelector('#sync-choice-description').textContent = remote
          ? 'Your account and this device have separate saves. Export a backup in Preferences before replacing either copy.'
          : 'This device holds another account’s progress. Start fresh for this account, or explicitly copy the device’s progress into it. Export a backup in Preferences before starting fresh.';
        box.querySelector('#sync-use-cloud').textContent = remote ? 'Use account progress' : 'Start fresh';
        box.querySelector('#sync-use-device').textContent = remote ? 'Use this device’s progress' : 'Copy device progress to this account';
        box.querySelector('#sync-choice').hidden = false;
        setStatus('busy', 'Choose which progress to keep in Profile → Account.', 'Choose progress');
        window.dispatchEvent(new CustomEvent('takeover:sync-choice'));
        return;
      }
      if (!remote && firstTimeHere && firstChoice === 'cloud') {
        // JourMax's state setter fills in the fresh dashboard defaults.
        T.state = { updatedAt: Date.now(), syncUser: account };
        T.save(false); T.render();
      }
      if (remote && firstTimeHere) {
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
      // Hydration has resolved ownership, even if the subsequent upload is offline.
      state.syncUser = account;
      ready(account);
      const needsWrite = !remote || (state.updatedAt || 0) !== (remote.updatedAt || 0)
        || state.challengeReset !== remote.challengeReset;
      if (!needsWrite) {
        if (state.syncUser !== account) { state.syncUser = account; T.save(false); }
        firstChoice = null;
        setStatus('ok', `Synced ${time()}`);
        window.dispatchEvent(new CustomEvent('takeover:synced', { detail: { userId: account, updatedAt: T.state.updatedAt || 0 } }));
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
        window.dispatchEvent(new CustomEvent('takeover:synced', { detail: { userId: account, updatedAt: T.state.updatedAt || 0 } }));
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
    get readyUser() { return readyUser; },
    schedule() {
      if (!user) return;
      if (needsChoice) {
        setStatus('busy', 'Saved on this device. Choose which progress to keep in Profile → Account.', 'Choose progress');
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

  function accountChanged(u) {
    if (u?.id === user?.id) return;
    sessionVersion++;
    active?.abort();
    clearTimeout(timer); timer = null;
    pending = false; deferredRemote = false; firstChoice = null; needsChoice = false;
    user = u;
    readyUser = null;
    draw();
    if (user) { setStatus('busy', 'Connecting your account…'); requestSync(); }
  }
  window.addEventListener('takeover:account', event => accountChanged(event.detail.user));
  draw();
  accountChanged(window.TakeoverAccount?.user || null);
})();
