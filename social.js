'use strict';

/* Only aggregate scores are shared; the private dashboard never enters friend queries. */
(() => {
  const friendsRoot = document.getElementById('friends-root');
  const boardRoot = document.getElementById('leaderboard-root');
  const A = window.TakeoverAccount;
  if (!friendsRoot || !boardRoot || !A) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => window.TakeoverIcons.svg(name);
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const avatar = peer => {
    const value = peer.avatar_data;
    const safe = typeof value === 'string' && value.length <= 180000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
    return `<span class="friend-avatar">${safe ? `<img src="${value}" alt="" width="46" height="46">` : esc((peer.display_name || 'Member').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase())}</span>`;
  };
  const errorText = error => ['PGRST202', 'PGRST205', '42P01'].includes(error?.code)
    ? 'Friends are not available yet. Try again shortly.' : error?.message || 'Could not connect. Please try again.';
  let owner = null, generation = 0, friendRequest = 0, boardRequest = 0;
  let friends = [], rows = [], period = 'week', loadingFriends = false, loadingBoard = false;
  let friendsError = '', boardError = '', sharingError = '', lastPublished = '', publishing = false, publishQueued = false;
  let syncedRevision = null, lastProfile = null;
  const active = (id, version) => A.user?.id === id && generation === version;
  const empty = (title, text, button, action = 'data-open-account') => `<div class="social-empty"><span class="profile-feature-icon">${icon('users')}</span><h2>${title}</h2><p class="account-note">${text}</p>${button ? `<button class="account-primary" type="button" ${action}>${button}</button>` : ''}</div>`;
  function status(text, error = false) {
    const node = document.getElementById('friends-status');
    if (node) { node.textContent = text; node.dataset.kind = error ? 'error' : 'success'; }
  }

  function drawFriends() {
    if (!A.user) {
      friendsRoot.innerHTML = `<section class="profile-card">${empty('Better, together.', 'Add your people. Celebrate the small wins and build a rhythm together.', 'Sign in to add friends')}</section>`;
      return;
    }
    if (!A.profile) {
      friendsRoot.innerHTML = `<section class="profile-card">${empty('Your friends live here', 'Your profile needs to finish loading before you can connect.', 'Open account')}</section>`;
      return;
    }
    friendsRoot.innerHTML = `<section class="profile-card">
      <div class="profile-section-heading"><span class="profile-feature-icon">${icon('users')}</span><div><h2>Your circle</h2><p class="account-note">A little encouragement goes a long way.</p></div></div>
      <div class="friend-code"><div><small>Your friend code</small><code>${esc(A.profile.friend_code)}</code></div><button type="button" id="copy-friend-code" aria-label="Copy your friend code">${icon('copy')} Copy</button></div>
      <p class="account-note">Share your code with someone you know. Your name and photo are visible when you connect; your email stays private.</p>
      <form id="invite-friend" class="account-form"><div class="field"><label for="friend-code-input">Add a friend</label><input id="friend-code-input" name="code" placeholder="Their 12-character code" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20" required></div><button class="account-primary" type="submit">${icon('plus')} Send request</button></form>
      <p class="account-status" id="friends-status" role="status" aria-live="polite"></p>
      <label class="sharing-control"><span><b>Share my completion score</b><span class="account-note">Accepted friends can see your overall daily, weekly and monthly scores. Your individual goals and logs stay private.</span></span><input type="checkbox" id="share-progress" ${A.profile.share_progress ? 'checked' : ''}></label>
      <p class="account-status" data-kind="error" role="status">${esc(sharingError)}</p>
      <div class="account-actions"><h3>Friends & requests</h3><button class="link" type="button" id="refresh-friends" ${loadingFriends ? 'disabled' : ''}>${loadingFriends ? 'Refreshing…' : 'Refresh'}</button></div>
      ${friendsError ? `<p class="account-status" data-kind="error" role="status">${esc(friendsError)}</p>` : ''}
      <ul class="friend-list">${friends.map(friend => `<li class="friend-row">${avatar(friend)}<div class="friend-copy"><b>${esc(friend.display_name)}</b><small>${friend.status === 'accepted' ? 'Friend' : friend.incoming ? 'Wants to connect with you' : 'Request sent'}</small></div><div class="friend-actions">${friend.status === 'accepted' ? `<button class="account-secondary" type="button" data-friend-action="remove" data-friend-id="${esc(friend.relationship_id)}">Remove</button>` : friend.incoming ? `<button class="account-primary" type="button" data-friend-action="accept" data-friend-id="${esc(friend.relationship_id)}">Accept</button><button class="account-secondary" type="button" data-friend-action="decline" data-friend-id="${esc(friend.relationship_id)}">Decline</button>` : `<button class="account-secondary" type="button" data-friend-action="cancel" data-friend-id="${esc(friend.relationship_id)}">Cancel</button>`}</div></li>`).join('')}</ul>
      ${!friends.length && !friendsError ? `<p class="account-note">${loadingFriends ? 'Loading your circle…' : 'Your circle starts with one friend. Add their code above.'}</p>` : ''}
    </section>`;
    document.getElementById('copy-friend-code').onclick = async () => {
      try { await navigator.clipboard.writeText(A.profile.friend_code); status('Friend code copied.'); }
      catch { status('Copy the code shown above to share it with your friend.'); }
    };
    document.getElementById('invite-friend').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button');
      const code = form.elements.code.value.replace(/[\s-]/g, '').toLowerCase();
      if (!/^[a-f0-9]{12}$/.test(code)) return status('Enter your friend’s 12-character code.', true);
      const id = A.user.id, version = generation;
      button.disabled = true; status('Sending request…');
      try {
        const { error } = await A.client.rpc('takeover_invite', { p_code: code });
        if (!active(id, version)) return;
        if (error) throw error;
        await loadFriends(); status('Request sent. They can accept it in their Friends tab.');
      } catch (error) { if (active(id, version)) status(errorText(error), true); }
      finally { if (button.isConnected) button.disabled = false; }
    };
    document.getElementById('share-progress').onchange = async event => {
      const control = event.currentTarget, shared = control.checked, id = A.user.id, version = generation;
      control.disabled = true; sharingError = '';
      try {
        const { error } = await A.client.from('takeover_profiles').update({ share_progress: shared }).eq('id', id).select('id').single();
        if (!active(id, version)) return;
        if (error) throw error;
        lastPublished = ''; syncedRevision = null;
        await A.refreshProfile({ redraw: false });
        if (!active(id, version)) return;
        drawFriends();
        if (shared) { window.TakeoverSync?.pull(); status('Sharing is on. Your score will appear after progress syncs.'); }
        else { status('Sharing is off. Your shared scores have been removed.'); loadBoard(); }
      } catch (error) { if (active(id, version)) { control.checked = !shared; sharingError = errorText(error); status(sharingError, true); } }
      finally { if (control.isConnected) control.disabled = false; }
    };
    document.getElementById('refresh-friends').onclick = loadFriends;
    friendsRoot.querySelectorAll('[data-friend-action]').forEach(button => button.onclick = async () => {
      const action = button.dataset.friendAction;
      if (action === 'remove' && !confirm('Remove this friend? You will stop seeing each other’s shared scores. You can reconnect later.')) return;
      const id = A.user.id, version = generation; button.disabled = true;
      try {
        const { error } = await A.client.rpc('takeover_friend_action', { p_id: button.dataset.friendId, p_action: action });
        if (!active(id, version)) return;
        if (error) throw error;
        await loadFriends(); loadBoard();
        status(action === 'accept' ? 'You’re connected. Turn on score sharing to join the leaderboard.' : 'Your circle is updated.');
      } catch (error) { if (active(id, version)) status(errorText(error), true); }
      finally { if (button.isConnected) button.disabled = false; }
    });
  }

  async function loadFriends() {
    if (!A.user || !A.profile) return;
    const id = A.user.id, version = generation, request = ++friendRequest;
    loadingFriends = true; friendsError = ''; drawFriends();
    try {
      const { data, error } = await A.client.rpc('takeover_friends');
      if (!active(id, version) || request !== friendRequest) return;
      if (error) throw error;
      friends = data || [];
    } catch (error) { if (active(id, version) && request === friendRequest) friendsError = errorText(error); }
    finally { if (active(id, version) && request === friendRequest) { loadingFriends = false; drawFriends(); } }
  }

  function drawBoard() {
    if (!A.user) {
      boardRoot.innerHTML = `<section class="profile-card">${empty('A shared sense of progress.', 'Connect with friends and compare your overall completion. Every small step counts.', 'Sign in to get started')}</section>`; return;
    }
    const sorted = [...rows].sort((a, b) => (b.average_score ?? -1) - (a.average_score ?? -1));
    let place = 0, previous = null;
    boardRoot.innerHTML = `<section class="profile-card"><div class="leaderboard-hero"><span class="profile-feature-icon">${icon('trophy')}</span><h2>Small wins. Shared.</h2><p class="account-note">Your circle’s overall completion, at a glance.</p></div>
      <div class="leaderboard-tabs" role="group" aria-label="Leaderboard period">${[['today','Today'],['week','This week'],['month','This month']].map(([id, label]) => `<button type="button" data-board-period="${id}" aria-pressed="${period === id}">${label}</button>`).join('')}</div>
      <p class="account-note">Each person’s own targets, equally weighted. Averages use synced scheduled days; rest days are excluded and unlogged habits count as zero. Scores are self-reported. Personal goals, income and demo balances stay private.</p>
      ${!A.profile?.share_progress ? '<div class="sharing-prompt"><p class="account-note">Your score is private. Enable sharing in Friends to join in.</p><button class="account-secondary" type="button" data-open-friends>Manage friends & sharing</button></div>' : ''}
      <p class="account-status" role="status" ${boardError || sharingError ? 'data-kind="error"' : ''}>${esc(boardError || sharingError || (loadingBoard ? 'Refreshing scores…' : ''))}</p>
      <ol class="leaderboard-list">${sorted.map((row, index) => {
        if (row.average_score !== previous || index === 0) place = index + 1;
        previous = row.average_score;
        const shared = row.last_shared_at ? new Date(row.last_shared_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        return `<li class="leaderboard-row ${row.is_self ? 'is-you' : ''}"><span class="leaderboard-place">${row.average_score == null ? '—' : place}</span>${avatar(row)}<div class="friend-copy"><b>${esc(row.display_name)}${row.is_self ? ' <span class="muted">· You</span>' : ''}</b><small>${shared ? `Shared ${esc(shared)}` : 'Waiting for their first sync'}</small></div><b class="leaderboard-score">${row.average_score == null ? '—' : `${Math.round(Number(row.average_score))}%`}</b></li>`;
      }).join('')}</ol>
      ${!rows.length && !loadingBoard && !boardError ? '<p class="account-note">No shared scores yet. Invite a friend and enable sharing to get started.</p>' : ''}
      <div class="account-actions"><button type="button" class="account-secondary" id="refresh-leaderboard">${icon('sync')} Refresh</button><button type="button" class="link" data-open-friends>${icon('users')} Your friends</button></div>
    </section>`;
    boardRoot.querySelectorAll('[data-board-period]').forEach(button => button.onclick = () => {
      if (period === button.dataset.boardPeriod) return;
      period = button.dataset.boardPeriod; rows = []; loadBoard();
    });
    document.getElementById('refresh-leaderboard').onclick = () => { window.TakeoverSync?.pull(); loadBoard(); };
  }

  async function loadBoard() {
    if (!A.user || !A.profile) { drawBoard(); return; }
    const id = A.user.id, version = generation, request = ++boardRequest;
    loadingBoard = true; boardError = ''; drawBoard();
    try {
      const { data, error } = await A.client.rpc('takeover_leaderboard', { p_period: period, p_today: dateKey(new Date()) });
      if (!active(id, version) || request !== boardRequest) return;
      if (error) throw error;
      rows = data || [];
    } catch (error) { if (active(id, version) && request === boardRequest) boardError = errorText(error); }
    finally { if (active(id, version) && request === boardRequest) { loadingBoard = false; drawBoard(); } }
  }

  async function publishScores() {
    if (publishing) { publishQueued = true; return; }
    const state = window.JourMax.state, user = A.user;
    if (!user || !A.profile?.share_progress || syncedRevision !== (state.updatedAt || 0) || state.syncUser !== user.id) return;
    const today = dateKey(new Date()), key = `${user.id}:${syncedRevision}:${today}`;
    if (lastPublished === key) return;
    const start = state.startDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > today) return;
    const cursor = new Date(`${today}T12:00:00`); cursor.setDate(cursor.getDate() - 366);
    if (dateKey(cursor) < start) cursor.setTime(new Date(`${start}T12:00:00`).getTime());
    const days = [];
    while (dateKey(cursor) <= today && days.length < 367) {
      const day = dateKey(cursor), d = state.days[day]; let score = 0;
      try { score = Math.round((state.personalPlan ? window.TakeoverPersonal.dayScore(state, day) : state.experience === 'personal' ? 0 : window.TakeoverMetrics.dayScore(d)) * 100); } catch { score = 0; }
      days.push({ day, score: Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0)) });
      cursor.setDate(cursor.getDate() + 1);
    }
    const id = user.id, version = generation;
    publishing = true; publishQueued = false;
    try {
      const { error } = await A.client.rpc('takeover_publish_scores', { p_revision: syncedRevision, p_start: start, p_through: today, p_days: days });
      if (!active(id, version)) return;
      if (error) throw error;
      lastPublished = key; sharingError = '';
      if (!document.getElementById('progress-friends').hidden) loadBoard();
    } catch (error) {
      if (active(id, version)) { sharingError = `Score sharing paused. ${errorText(error)}`; status(sharingError, true); drawBoard(); }
    } finally {
      publishing = false;
      if (publishQueued) publishScores();
    }
  }

  function accountChanged() {
    if (owner !== A.user?.id) {
      generation++; friendRequest++; boardRequest++; owner = A.user?.id || null;
      friends = []; rows = []; friendsError = ''; boardError = ''; sharingError = '';
      lastPublished = ''; syncedRevision = null; lastProfile = null; loadingFriends = false; loadingBoard = false;
    }
    const profileChanged = lastProfile !== A.profile;
    lastProfile = A.profile;
    drawFriends(); drawBoard();
    if (profileChanged && A.profile) { loadFriends(); loadBoard(); if (A.profile.share_progress) window.TakeoverSync?.pull(); }
  }
  window.addEventListener('takeover:account', accountChanged);
  window.addEventListener('takeover:synced', event => {
    if (event.detail?.userId !== A.user?.id) return;
    syncedRevision = event.detail.updatedAt;
    publishScores();
  });
  window.addEventListener('takeover:section', event => {
    if (event.detail.group === 'profile' && event.detail.name === 'friends') loadFriends();
    if (event.detail.group === 'progress' && event.detail.name === 'friends') { window.TakeoverSync?.pull(); loadBoard(); }
  });
  // Reading friends does not redraw an in-progress invite form on a timer.
  setInterval(() => {
    if (!document.hidden && document.body.dataset.view === 'progress' && !document.getElementById('progress-friends').hidden && !loadingBoard) loadBoard();
  }, 30000);
  accountChanged();
})();
