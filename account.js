'use strict';

/* Account identity lives in Supabase, separately from the dashboard backup. */
(() => {
  const root = document.getElementById('account-root');
  if (!root) return;
  const local = window.TAKEOVER_CONFIG || {}, env = window.TAKEOVER_ENV || {};
  const cfg = local.supabaseUrl && local.supabaseAnonKey ? local : env;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => window.TakeoverIcons?.svg(name) || '';
  const safeAvatar = value => typeof value === 'string' && value.length <= 180000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null;
  const initials = name => (name || 'You').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  let user = null, profile = null, mode = 'signin', profileError = '', profileLoading = false;
  let version = 0, profileRequest = 0, authBusy = false, recovery = false, pendingAvatar, profileRedrawPending = false;
  let notice = { text: '', kind: '' };
  const callbackHash = new URLSearchParams(location.hash.slice(1));
  const callbackError = callbackHash.get('error_description') || new URLSearchParams(location.search).get('error_description');
  const callbackRequested = callbackHash.has('access_token') || callbackHash.has('error') || new URLSearchParams(location.search).has('account');
  const sb = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const account = window.TakeoverAccount = { client: sb, user, profile, ready: false, refreshProfile,
    openAuth(next = 'signin') { mode = next === 'signup' ? 'signup' : 'signin'; draw(); navigate(); },
    get recovering() { return recovery; }
  };

  function navigate() {
    if (window.Takeover?.navigate) window.Takeover.navigate('profile');
    else location.hash = 'view-profile';
  }

  function publish() {
    account.user = user; account.profile = profile;
    updateHeader();
    window.dispatchEvent(new CustomEvent('takeover:account', { detail: { client: sb, user, profile } }));
  }

  function updateHeader() {
    const avatar = document.getElementById('profile-avatar');
    const label = document.getElementById('profile-trigger-label');
    const trigger = document.getElementById('profile-trigger');
    const name = profile?.display_name || user?.user_metadata?.display_name || 'Your profile';
    if (avatar) avatar.innerHTML = safeAvatar(profile?.avatar_data)
      ? `<img src="${safeAvatar(profile.avatar_data)}" alt="" width="40" height="40">`
      : user ? esc(initials(name)) : icon('profile');
    if (label) label.textContent = user ? name.split(/\s+/)[0] : 'Sign in';
    if (trigger) trigger.setAttribute('aria-label', user ? `Open profile for ${name}` : 'Open your profile and sign in');
  }

  function status(target, text, kind = '') {
    const node = target?.querySelector('.account-status');
    if (node) { node.textContent = text; node.dataset.kind = kind; }
  }

  function message(text, kind = '') {
    notice = { text, kind };
    const node = document.getElementById('account-message');
    if (node) { node.textContent = text; node.dataset.kind = kind; }
  }

  function friendly(error) {
    if (error?.code === 'PGRST205' || error?.code === '42P01') return 'Profiles are not available yet. Your dashboard is still saved. Try again shortly.';
    if (error?.code === 'invalid_credentials') return 'That email and password do not match. Please try again.';
    if (error?.code === 'email_not_confirmed') return 'Confirm your email first, then sign in.';
    if (/fetch|network|timeout/i.test(error?.message || '')) return 'Could not connect. Please check your connection and try again.';
    return error?.message || 'Something went wrong. Please try again.';
  }

  function passwordField(id, label, autocomplete = 'current-password', min = 1) {
    return `<div class="field"><label for="${id}">${label}</label><div class="password-field"><input class="field-control" id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" minlength="${min}" maxlength="256" required><button class="password-toggle" type="button" data-password="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false">${icon('eye')}</button></div></div>`;
  }

  function wirePasswords() {
    root.querySelectorAll('[data-password]').forEach(button => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.password);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${root.querySelector(`label[for="${input.id}"]`).textContent.toLowerCase()}`);
        button.innerHTML = icon(show ? 'eyeOff' : 'eye');
      });
    });
  }

  async function runForm(form, task) {
    if (form.dataset.busy || authBusy) return;
    form.dataset.busy = 'true'; form.setAttribute('aria-busy', 'true');
    const controls = [...form.querySelectorAll('button, input')];
    const previous = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    status(form, 'Working…'); authBusy = true;
    try { await task(); }
    catch (error) { status(form, friendly(error), 'error'); }
    finally {
      authBusy = false;
      controls.forEach((control, index) => { control.disabled = previous[index]; });
      delete form.dataset.busy; form.removeAttribute('aria-busy');
      if (profileRedrawPending) { profileRedrawPending = false; draw(); }
    }
  }

  function redirectUrl(type) {
    return `${location.origin}${location.pathname}?account=${encodeURIComponent(type)}`;
  }

  function draw() {
    const currentNotice = `<p id="account-message" class="account-status" role="status" aria-live="polite" data-kind="${esc(notice.kind)}">${esc(notice.text)}</p>`;
    if (!sb) {
      root.innerHTML = `<section class="profile-card"><div class="account-hero"><span class="profile-avatar">${icon('profile')}</span><div><p class="account-eyebrow">YOUR SPACE</p><h2>Your profile</h2><p class="account-copy">Your progress is saved on this device.</p></div></div><p class="account-status" role="status">${cfg.supabaseUrl ? 'Account services could not load. Reconnect and reload to sign in.' : 'Account services are not connected yet.'}</p><button class="account-secondary" type="button" id="account-reload">Reload</button></section>`;
      document.getElementById('account-reload').onclick = () => location.reload();
      return;
    }
    if (recovery && user) {
      root.innerHTML = `<section class="profile-card"><div class="account-hero"><span class="profile-avatar">${icon('lock')}</span><div><p class="account-eyebrow">IDENTITY CONFIRMED</p><h2>A fresh password</h2><p class="account-copy">Choose a new password for ${esc(user.email)}.</p></div></div>${currentNotice}<form id="account-recovery" class="account-form">${passwordField('recovery-password', 'New password', 'new-password', 8)}${passwordField('recovery-confirm', 'Confirm new password', 'new-password', 8)}<p class="account-note">Use at least 8 characters.</p><button class="account-primary" type="submit">Save new password</button><p class="account-status" role="status" aria-live="polite"></p></form></section>`;
      wirePasswords();
      document.getElementById('account-recovery').onsubmit = event => {
        event.preventDefault(); const form = event.currentTarget;
        const password = form.elements['recovery-password'].value;
        if (password !== form.elements['recovery-confirm'].value) return status(form, 'The passwords do not match.', 'error');
        const accountId = user.id;
        runForm(form, async () => {
          if (user?.id !== accountId || !recovery) throw new Error('Your reset session ended. Request a new reset link.');
          const { error } = await sb.auth.updateUser({ password });
          if (error) throw error;
          recovery = false; mode = 'signin';
          message('Password updated. You can use your new password on your other devices.', 'success');
          draw();
        });
      };
      return;
    }
    if (!user) { drawPortal(currentNotice); return; }
    const displayName = profile?.display_name || user.user_metadata?.display_name || 'Takeover member';
    const avatar = safeAvatar(profile?.avatar_data);
    root.innerHTML = `<section class="profile-card">
      <div class="account-hero"><button type="button" class="avatar-edit-trigger" id="profile-photo-edit" aria-label="Change profile picture" aria-controls="profile-edit-section" ${!profile ? 'disabled' : ''}><span class="profile-avatar">${avatar ? `<img src="${avatar}" alt="" width="80" height="80">` : esc(initials(displayName))}</span><span class="avatar-edit-badge">${icon('camera')}</span></button><div><p class="account-eyebrow">YOUR ACCOUNT</p><h2>${esc(displayName)}</h2><p class="account-copy account-email">${esc(user.email)}</p><span class="account-badge">${icon('shield')} ${user.email_confirmed_at ? 'Email verified' : 'Email confirmation pending'}</span></div></div>
      ${currentNotice}
      ${profileError ? `<div class="account-note" role="status">${esc(profileError)} <button class="account-secondary" type="button" id="profile-retry">Try again</button></div>` : ''}
      ${profileLoading ? '<p class="account-note" role="status">Loading your profile…</p>' : ''}
      <details class="account-section" id="profile-edit-section"><summary><span class="account-row-icon">${icon('profile')}</span><span><b>Edit profile</b><small>Your name and photo</small></span>${icon('chevronRight')}</summary>
        <form id="profile-edit" class="account-form">
          <div class="avatar-editor">
            <span class="profile-avatar" id="avatar-preview" role="img" aria-label="Profile picture preview">${avatar ? `<img src="${avatar}" alt="" width="112" height="112">` : esc(initials(displayName))}</span>
            <div class="avatar-editor-controls"><h3>Profile picture</h3><p class="account-note" id="profile-photo-hint">Choose a photo or take a new one.</p>
              <div class="photo-source-actions">
                <button type="button" class="account-secondary" id="profile-photo-library" aria-describedby="profile-photo-hint" ${!profile ? 'disabled' : ''}>${icon('image')} Photo library</button>
                <button type="button" class="account-secondary" id="profile-photo-take" aria-describedby="profile-photo-hint" ${!profile ? 'disabled' : ''}>${icon('camera')} Take photo</button>
              </div>
              <input id="profile-photo" name="photo" type="file" accept="image/*" aria-label="Choose a profile picture from your photo library" hidden ${!profile ? 'disabled' : ''}>
              <input id="profile-camera" name="camera" type="file" accept="image/*" capture="user" aria-label="Take a profile picture" hidden ${!profile ? 'disabled' : ''}>
              <div class="photo-edit-actions"><button type="button" class="photo-text-action" id="profile-photo-remove" ${avatar ? '' : 'hidden'} ${!profile ? 'disabled' : ''}>Remove photo</button><button type="button" class="photo-text-action" id="profile-photo-undo" hidden>Undo change</button></div>
              <p class="account-note photo-size-note">Up to 25 MB · Resized automatically</p>
            </div>
          </div>
          <div class="field"><label for="profile-name">Display name</label><input class="field-control" id="profile-name" name="displayName" autocomplete="nickname" maxlength="40" value="${esc(displayName)}" required ${!profile ? 'disabled' : ''}></div>
          <p class="account-note">Friends you connect with can see your name and photo.</p><button class="account-primary" type="submit" ${!profile ? 'disabled' : ''}>Save profile</button><p class="account-status" role="status" aria-live="polite"></p>
        </form>
      </details>
      <details class="account-section"><summary><span class="account-row-icon">${icon('shield')}</span><span><b>Sign-in &amp; security</b><small>Email and password</small></span>${icon('chevronRight')}</summary><div class="account-security-grid">
        <form id="account-email-form" class="account-form"><h3>Change email</h3><div class="field"><label for="new-email">New email address</label><input class="field-control" id="new-email" name="newEmail" type="email" autocomplete="email" required maxlength="254"></div>${passwordField('email-current-password', 'Current password')}<p class="account-note">Confirm your password, then follow the confirmation emails sent to your current and new inboxes.</p><button class="account-primary" type="submit">Confirm email change</button><p class="account-status" role="status" aria-live="polite"></p></form>
        <form id="account-password-form" class="account-form"><h3>Change password</h3>${passwordField('password-current', 'Current password')}${passwordField('password-new', 'New password', 'new-password', 8)}${passwordField('password-confirm', 'Confirm new password', 'new-password', 8)}<p class="account-note">Use at least 8 characters. Your current password confirms it is you.</p><button class="account-primary" type="submit">Update password</button><p class="account-status" role="status" aria-live="polite"></p></form>
      </div></details>
      <div class="account-actions"><button class="account-secondary" type="button" id="account-signout">${icon('logOut')} Sign out of this device</button><p class="account-note">A copy of your progress stays in this browser.</p></div>
    </section>`;
    pendingAvatar = undefined;
    wirePasswords(); wireProfile(); wireSecurity();
    document.getElementById('profile-retry')?.addEventListener('click', () => refreshProfile());
    document.getElementById('account-signout').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const { error } = await sb.auth.signOut({ scope: 'local' });
        if (error) throw error;
      } catch (error) { message(friendly(error), 'error'); button.disabled = false; }
    };
  }

  function drawPortal(currentNotice) {
    const isReset = mode === 'reset', signup = mode === 'signup';
    root.innerHTML = `<section class="profile-card account-portal"><div class="account-hero"><span class="profile-avatar">${icon(isReset ? 'lock' : 'profile')}</span><div><p class="account-eyebrow">YOUR SPACE, EVERYWHERE</p><h2>${isReset ? 'Reset your password' : signup ? 'Make it yours' : 'Welcome back'}</h2><p class="account-copy">${isReset ? 'We’ll send a secure link to your inbox.' : 'One account for your progress, friends and goals.'}</p></div></div>${currentNotice}
      ${isReset ? '' : `<div class="account-tabs" aria-label="Account access"><button type="button" data-auth-mode="signin" aria-pressed="${!signup}">Sign in</button><button type="button" data-auth-mode="signup" aria-pressed="${signup}">Create account</button></div>`}
      <form id="account-auth-form" class="account-form">
        ${signup ? '<div class="field"><label for="auth-name">Your name</label><input class="field-control" id="auth-name" name="displayName" autocomplete="nickname" maxlength="40" placeholder="What should we call you?" required></div>' : ''}
        <div class="field"><label for="auth-email">Email address</label><input class="field-control" id="auth-email" name="email" type="email" autocomplete="username" maxlength="254" placeholder="you@example.com" required></div>
        ${isReset ? '' : passwordField('auth-password', 'Password', signup ? 'new-password' : 'current-password', signup ? 8 : 1)}
        ${signup ? '<p class="account-note">Use at least 8 characters. We’ll ask you to confirm your email.</p>' : ''}
        <button class="account-primary" type="submit">${isReset ? 'Send reset link' : signup ? 'Create account' : 'Sign in'}${icon('arrowRight')}</button>
        <p class="account-status" role="status" aria-live="polite"></p>
      </form>
      <div class="account-actions"><button class="account-secondary" type="button" data-auth-mode="${isReset ? 'signin' : 'reset'}">${isReset ? 'Back to sign in' : 'Forgot password?'}</button><a class="account-secondary" href="#view-today" data-view-target="today">Continue on this device</a></div>
      <p class="account-note">Your existing progress stays here when you sign in.</p>
    </section>`;
    wirePasswords();
    root.querySelectorAll('[data-auth-mode]').forEach(button => { button.onclick = () => {
      if (authBusy) return;
      const email = document.getElementById('auth-email')?.value;
      mode = button.dataset.authMode; notice = { text: '', kind: '' }; draw();
      const field = document.getElementById('auth-email'); if (field) field.value = email || '';
      document.getElementById(signup ? 'auth-email' : 'auth-name')?.focus();
    }; });
    document.getElementById('account-auth-form').onsubmit = event => {
      event.preventDefault(); const form = event.currentTarget;
      const email = form.elements.email.value.trim();
      const password = form.elements['auth-password']?.value;
      const displayName = form.elements.displayName?.value.trim();
      if (signup && !displayName) return status(form, 'Please add your name.', 'error');
      runForm(form, async () => {
        if (isReset) {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('recovery') });
          if (error) throw error;
          status(form, 'If an account uses this email, a reset link is on its way. Open it to choose a new password.', 'success');
        } else if (signup) {
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: redirectUrl('confirm') } });
          if (error) throw error;
          if (!data.session) {
            form.elements['auth-password'].value = '';
            status(form, 'Check your inbox to confirm your email, then sign in here. If you already have an account, use Sign in.', 'success');
          }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      });
    };
  }

  async function refreshProfile({ redraw = true } = {}) {
    if (!sb || !user) return null;
    const id = user.id, generation = version, request = ++profileRequest;
    profileLoading = true; profileError = '';
    const current = () => user?.id === id && version === generation && profileRequest === request;
    try {
      let { data, error } = await sb.from('takeover_profiles').select('id,display_name,avatar_data,friend_code,share_progress').eq('id', id).maybeSingle();
      if (!current()) return null;
      if (error) throw error;
      if (!data) {
        const display_name = String(user.user_metadata?.display_name || 'Takeover member').trim().slice(0, 40) || 'Takeover member';
        const created = await sb.from('takeover_profiles').insert({ id, display_name }).select('id,display_name,avatar_data,friend_code,share_progress').single();
        if (!current()) return null;
        if (created.error?.code === '23505') {
          const existing = await sb.from('takeover_profiles').select('id,display_name,avatar_data,friend_code,share_progress').eq('id', id).single();
          if (existing.error) throw existing.error;
          data = existing.data;
        } else { if (created.error) throw created.error; data = created.data; }
      }
      if (!current()) return null;
      profile = data; profileError = ''; publish();
      return profile;
    } catch (error) {
      if (current()) profileError = friendly(error);
      return null;
    } finally {
      if (current()) {
        profileLoading = false;
        if (redraw) {
          if (authBusy) profileRedrawPending = true;
          else draw();
        }
      }
    }
  }

  async function photoData(file) {
    const photoType = /^image\/(jpeg|png|webp|heic|heif|heic-sequence|heif-sequence|avif|gif|bmp)$/i;
    const photoName = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i;
    if (!(file.type ? photoType.test(file.type) : photoName.test(file.name))) throw new Error('Choose an image from your photo library, or take a new photo.');
    if (!file.size) throw new Error('This photo is empty. Please choose another one.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Choose a photo smaller than 25 MB.');
    const url = URL.createObjectURL(file);
    const picture = new Image();
    try {
      picture.src = url;
      try { await picture.decode(); }
      catch { throw new Error('Your browser could not open this photo. Choose a JPG or PNG, or use Take photo.'); }
      const size = Math.min(picture.naturalWidth, picture.naturalHeight);
      if (!size) throw new Error('This image could not be opened. Try another photo.');
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This photo could not be prepared. Please try again.');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#f2f1f6'; ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(picture, (picture.naturalWidth - size) / 2, (picture.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
      const result = canvas.toDataURL('image/jpeg', 0.82);
      if (!safeAvatar(result)) throw new Error('This photo is too large to save. Choose another image.');
      return result;
    } finally { picture.removeAttribute('src'); URL.revokeObjectURL(url); }
  }

  function wireProfile() {
    const form = document.getElementById('profile-edit');
    const library = document.getElementById('profile-photo');
    const camera = document.getElementById('profile-camera');
    const libraryButton = document.getElementById('profile-photo-library');
    const cameraButton = document.getElementById('profile-photo-take');
    const removeButton = document.getElementById('profile-photo-remove');
    const undoButton = document.getElementById('profile-photo-undo');
    const preview = document.getElementById('avatar-preview');
    const submit = form.querySelector('[type="submit"]');
    let photoVersion = 0, photoPreparing = false;
    const photoControls = [library, camera, libraryButton, cameraButton, removeButton, undoButton, submit];
    function updatePhoto() {
      const image = pendingAvatar === undefined ? safeAvatar(profile?.avatar_data) : pendingAvatar;
      preview.innerHTML = image ? `<img src="${image}" alt="" width="112" height="112">` : esc(initials(form.elements.displayName.value));
      preview.setAttribute('aria-label', image ? 'Profile picture preview' : 'No profile picture');
      removeButton.hidden = !image;
      undoButton.hidden = pendingAvatar === undefined;
      photoControls.forEach(control => { control.disabled = !profile || photoPreparing || Boolean(form.dataset.busy); });
    }
    document.getElementById('profile-photo-edit').onclick = () => {
      const section = document.getElementById('profile-edit-section');
      section.open = true;
      libraryButton.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    };
    // Keep picker opening inside the tap event so mobile browsers allow it.
    libraryButton.onclick = () => { if (!authBusy && !photoPreparing) library.click(); };
    cameraButton.onclick = () => { if (!authBusy && !photoPreparing) camera.click(); };
    async function choosePhoto(event) {
      const file = event.target.files?.[0];
      event.target.value = ''; // Choosing the same image again should still fire change.
      if (!file || authBusy || !user || !profile) return;
      const request = ++photoVersion, id = user.id, generation = version;
      photoPreparing = true; updatePhoto();
      preview.setAttribute('aria-busy', 'true');
      status(form, 'Preparing your photo…');
      const current = () => request === photoVersion && user?.id === id && version === generation && form.isConnected;
      try {
        const image = await photoData(file);
        if (!current()) return;
        pendingAvatar = image;
        status(form, 'Photo ready. Save your profile to apply it.');
      } catch (error) { if (current()) status(form, friendly(error), 'error'); }
      finally {
        if (current()) { photoPreparing = false; preview.removeAttribute('aria-busy'); updatePhoto(); }
      }
    }
    library.onchange = choosePhoto; camera.onchange = choosePhoto;
    removeButton.onclick = () => {
      photoVersion++; pendingAvatar = null;
      updatePhoto();
      undoButton.focus({ preventScroll: true });
      status(form, 'Save your profile to remove the photo.');
    };
    undoButton.onclick = () => {
      photoVersion++; pendingAvatar = undefined;
      updatePhoto(); status(form, 'Photo change undone.');
      libraryButton.focus({ preventScroll: true });
    };
    form.onsubmit = event => {
      event.preventDefault();
      if (photoPreparing) return status(form, 'Wait for your photo to finish preparing.');
      const name = form.elements.displayName.value.trim();
      if (!name) return status(form, 'Please add your name.', 'error');
      if (!profile || !user) return status(form, 'Wait for your profile to load, then try again.', 'error');
      const id = user.id, generation = version;
      const changes = { display_name: name };
      if (pendingAvatar !== undefined) changes.avatar_data = pendingAvatar;
      runForm(form, async () => {
        const { data, error } = await sb.from('takeover_profiles').update(changes).eq('id', id).select('id,display_name,avatar_data,friend_code,share_progress').single();
        if (error) throw error;
        if (user?.id !== id || version !== generation) return;
        profileRequest++; profile = data; pendingAvatar = undefined; publish();
        message('Your profile is up to date.', 'success'); draw();
      });
    };
  }

  async function confirmIdentity(password, id) {
    if (user?.id !== id) throw new Error('Your account changed. Please try again.');
    const { data, error } = await sb.auth.signInWithPassword({ email: user.email, password });
    if (error) throw error;
    if (data.user?.id !== id || user?.id !== id) throw new Error('Your account changed. Please try again.');
  }

  function wireSecurity() {
    document.getElementById('account-email-form').onsubmit = event => {
      event.preventDefault(); const form = event.currentTarget;
      const email = form.elements.newEmail.value.trim(), password = form.elements['email-current-password'].value, id = user.id;
      if (email.toLowerCase() === user.email.toLowerCase()) return status(form, 'This is already your email address.', 'error');
      runForm(form, async () => {
        await confirmIdentity(password, id);
        const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: redirectUrl('email') });
        form.elements['email-current-password'].value = '';
        if (error) throw error;
        status(form, 'Check your current and new inboxes. Complete the confirmation links to finish changing your email.', 'success');
      });
    };
    document.getElementById('account-password-form').onsubmit = event => {
      event.preventDefault(); const form = event.currentTarget;
      const currentPassword = form.elements['password-current'].value, password = form.elements['password-new'].value, id = user.id;
      if (password !== form.elements['password-confirm'].value) return status(form, 'The new passwords do not match.', 'error');
      if (password === currentPassword) return status(form, 'Choose a password different from your current one.', 'error');
      runForm(form, async () => {
        await confirmIdentity(currentPassword, id);
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        form.reset(); status(form, 'Password updated. Use your new password when signing in.', 'success');
      });
    };
  }

  function cleanCallback() {
    const url = new URL(location.href);
    ['account', 'code', 'error', 'error_code', 'error_description'].forEach(key => url.searchParams.delete(key));
    const authHash = new URLSearchParams(url.hash.slice(1));
    if (authHash.has('access_token') || authHash.has('error')) url.hash = '';
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    navigate();
  }

  function handleSession(event, session) {
    const nextUser = session?.user || null;
    const changed = nextUser?.id !== user?.id;
    if (changed) {
      version++; profileRequest++; profile = null; profileError = ''; pendingAvatar = undefined; profileRedrawPending = false;
      recovery = false; notice = { text: '', kind: '' };
    }
    user = nextUser;
    if (event === 'PASSWORD_RECOVERY' && user) recovery = true;
    account.ready = true;
    if (changed || event === 'INITIAL_SESSION' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') publish();
    if (changed || event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') {
      draw();
      if (user) refreshProfile();
    } else if (event === 'USER_UPDATED' && !authBusy) draw();
    if (event === 'PASSWORD_RECOVERY' || (callbackRequested && event === 'INITIAL_SESSION')) cleanCallback();
    if (event === 'SIGNED_OUT') { mode = 'signin'; draw(); }
  }

  draw(); updateHeader();
  if (!sb) { account.ready = true; publish(); return; }
  if (callbackError) { message(callbackError, 'error'); cleanCallback(); }
  // Keep Supabase API calls outside its auth lock; the callback itself stays synchronous.
  sb.auth.onAuthStateChange((event, session) => { setTimeout(() => handleSession(event, session), 0); });
})();
