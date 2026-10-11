'use strict';
/* Optional cloud sync through Supabase. The whole dashboard is one JSON row per user;
   the copy with the newer `updatedAt` wins. Without keys in config.js this does nothing. */
(() => {
  const T = window.Takeover;
  const cfg = window.TAKEOVER_CONFIG || {};
  const box = document.getElementById('sync-box');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    box.innerHTML = '<b>Cloud sync</b> <span class="muted">— off. Data stays on this device. Add your Supabase keys in <code>config.js</code> to sync across devices.</span>';
    return;
  }
  if (!window.supabase?.createClient) {
    box.innerHTML = '<b>Cloud sync</b> <span class="muted">— could not load Supabase (offline?). Your data is still saved on this device.</span>';
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  let user = null;
  let pulled = false; // never push before we've seen what the cloud has
  let timer = null, pushing = false;

  function setStatus(kind, text) {
    const dot = box.querySelector('.sync-dot'), msg = box.querySelector('.sync-msg');
    if (dot) dot.className = `sync-dot ${kind}`;
    if (msg) msg.textContent = text;
  }

  function draw() {
    if (user) {
      box.innerHTML = `<div><b>Cloud sync</b> · ${esc(user.email)}</div>
        <div class="small"><span class="sync-dot"></span><span class="sync-msg"></span></div>
        <div class="tiny-actions"><button type="button" id="sync-now">Sync now</button><button type="button" class="link" id="sync-out">Sign out</button></div>`;
      box.querySelector('#sync-now').onclick = () => pull();
      box.querySelector('#sync-out').onclick = async () => { await sb.auth.signOut(); };
    } else {
      box.innerHTML = `<div><b>Cloud sync</b> <span class="muted small">— sign in to keep your data safe and use it on every device</span></div>
        <form id="sync-form">
          <input name="email" type="email" placeholder="Email" autocomplete="email" required>
          <input name="password" type="password" placeholder="Password (6+ chars)" autocomplete="current-password" minlength="6" required>
          <div class="tiny-actions"><button name="in">Sign in</button><button name="up" class="link">Create account</button></div>
        </form>
        <div class="small"><span class="sync-dot"></span><span class="sync-msg"></span></div>`;
      const f = box.querySelector('#sync-form');
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const creds = { email: f.email.value.trim(), password: f.password.value };
        setStatus('busy', 'Working…');
        if (e.submitter?.name === 'up') {
          const { data, error } = await sb.auth.signUp(creds);
          if (error) return setStatus('err', error.message);
          if (!data.session) setStatus('ok', 'Account created — confirm the email we sent you, then sign in here.');
        } else {
          const { error } = await sb.auth.signInWithPassword(creds);
          if (error) setStatus('err', error.message);
        }
      });
    }
  }

  async function pull() {
    if (!user) return;
    setStatus('busy', 'Syncing…');
    const { data, error } = await sb.from('takeover_state').select('data').eq('user_id', user.id).maybeSingle();
    if (error) return setStatus('err', error.message);
    const local = T.state, remote = data?.data;
    const firstTimeHere = local.syncUser !== user.id;
    let useRemote = false;
    if (remote && firstTimeHere) {
      // New device for this account: the cloud copy normally wins, unless this device already has data the user wants to keep.
      useRemote = !local.updatedAt || confirm('Your account already has data in the cloud.\n\nOK = use the cloud copy on this device\nCancel = replace the cloud copy with this device\'s data');
    } else if (remote) {
      useRemote = (remote.updatedAt || 0) > (local.updatedAt || 0);
    }
    pulled = true;
    if (useRemote) {
      T.state = { ...remote, syncUser: user.id };
      T.save(false); T.render();
      setStatus('ok', `Synced ${time()}`);
    } else if (!remote || (local.updatedAt || 0) !== (remote.updatedAt || 0) || firstTimeHere) {
      local.syncUser = user.id; T.save(false);
      await push();
    } else {
      setStatus('ok', `Up to date ${time()}`);
    }
  }

  async function push() {
    clearTimeout(timer); timer = null;
    if (!user || !pulled) return;
    if (pushing) { timer = setTimeout(push, 1000); return; }
    pushing = true;
    setStatus('busy', 'Saving…');
    const { error } = await sb.from('takeover_state').upsert({ user_id: user.id, data: T.state, updated_at: new Date().toISOString() });
    pushing = false;
    if (error) setStatus('err', `Not saved to cloud: ${error.message}`);
    else setStatus('ok', `Saved ${time()}`);
  }

  window.TakeoverSync = {
    schedule() { if (user && pulled) { clearTimeout(timer); timer = setTimeout(push, 1500); } },
    pull,
  };

  // Flush a pending save when the app goes to the background.
  document.addEventListener('visibilitychange', () => { if (document.hidden && timer) push(); });

  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user || null;
    if (u?.id === user?.id) return;
    user = u; pulled = false;
    draw();
    if (user) setTimeout(pull, 0); // don't call Supabase inside the auth callback
    else setStatus('', '');
  });
  draw();
})();
