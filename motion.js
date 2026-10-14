'use strict';
/* Small, event-driven motion. Data updates are immediate; idle rerenders never replay entrances. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const running = new WeakMap();
  const active = new Set();
  const settle = () => { active.forEach(animation => animation.finish()); };
  let keyboard = false;
  document.addEventListener('keydown', () => {
    keyboard = true; document.documentElement.dataset.input = 'keyboard';
    settle();
  }, true);
  reduced.addEventListener('change', () => { if (reduced.matches) settle(); });
  document.addEventListener('pointerdown', () => {
    keyboard = false; document.documentElement.dataset.input = 'pointer';
  }, true);
  const allowed = () => !reduced.matches && !keyboard && !document.hidden;
  function animate(node, frames, duration = 220, easing = 'cubic-bezier(.23,1,.32,1)') {
    if (!node?.isConnected || !node.animate || !allowed()) return null;
    running.get(node)?.cancel();
    const animation = node.animate(frames, { duration, easing });
    running.set(node, animation);
    active.add(animation);
    animation.finished.catch(() => {}).finally(() => {
      if (running.get(node) === animation) running.delete(node);
      active.delete(animation);
    });
    return animation;
  }
  function reveal(node) {
    if (!node || node.hidden) return;
    animate(node, [{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}]);
  }
  function sheet(dialog, opening) {
    if (opening) {
      const phone = matchMedia('(max-width: 520px)').matches;
      animate(dialog, [{opacity:.6, transform:phone ? 'translateY(48px)' : 'translateY(12px) scale(.985)'},{opacity:1,transform:'none'}],260,'cubic-bezier(.32,.72,0,1)');
    } else reveal(dialog.querySelector('.routine-sheet'));
  }
  function closeSheet(dialog) {
    if (!dialog.open || dialog.dataset.closing) return;
    if (!allowed()) { dialog.close(); return; }
    dialog.dataset.closing = 'true';
    const animation = animate(dialog, [{opacity:1,transform:'none'},{opacity:0,transform:'translateY(16px)'}],130);
    const finish = () => { delete dialog.dataset.closing; if (dialog.open) dialog.close(); };
    if (animation) animation.finished.then(finish, finish); else finish();
  }
  function complete(id, date, before, after) {
    document.querySelectorAll('[data-habit-row]').forEach(row => {
      if (row.dataset.habitRow !== id || row.dataset.logDate !== date) return;
      animate(row.querySelector('.habit-check'), [{transform:'scale(.88)'},{transform:'scale(1.08)',offset:.65},{transform:'scale(1)'}],260);
      animate(row.querySelector('.habit-meter i'), [{opacity:.4},{opacity:1}],200);
    });
    const today = window.TakeoverPersonal?.dateKey(new Date());
    if (date !== today) return;
    const ring = document.querySelector('.personal-ring');
    if (ring && before !== null && after !== null && before !== after && allowed()) {
      animate(ring, [{transform:'scale(.97)'},{transform:'scale(1)'}],240);
    }
    if (after >= 1 && before < 1) {
      animate(document.querySelector('.personal-hero h2'), [{opacity:.4,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],280);
    }
  }
  window.TakeoverMotion = { reveal, sheet, closeSheet, complete };

  // Animate only an intentional selected-tab change. The temporary background
  // is purely visual and does not duplicate controls or affect keyboard order.
  const tabSelector = '.quick-nav, .destination-tabs, .daily-switch, .account-tabs, .seg';
  const selected = group => group.querySelector('[aria-selected="true"],[aria-pressed="true"],[aria-current="page"],.active');
  document.addEventListener('click', event => {
    const target = event.target.closest('button,a');
    const group = target?.closest(tabSelector);
    if (!group || !allowed()) return;
    const old = selected(group);
    if (!old || old === target || target.disabled) return;
    const from = old.getBoundingClientRect(), groupBox = group.getBoundingClientRect();
    requestAnimationFrame(() => {
      const current = selected(group);
      if (!group.isConnected || current !== target || !allowed()) return;
      const to = current.getBoundingClientRect();
      const indicator = document.createElement('span');
      indicator.className = 'motion-tab-indicator'; indicator.setAttribute('aria-hidden','true');
      Object.assign(indicator.style, {left: (to.left-groupBox.left)+'px',top:(to.top-groupBox.top)+'px',width:to.width+'px',height:to.height+'px'});
      group.append(indicator); current.classList.add('motion-selected');
      const animation = animate(indicator, [
        {transform:'translate('+(from.left-to.left)+'px,'+(from.top-to.top)+'px) scale('+(from.width/to.width)+','+(from.height/to.height)+')'},
        {transform:'none'}
      ],220);
      const finish = () => { indicator.remove(); current.classList.remove('motion-selected'); };
      if (animation) animation.finished.then(finish,finish); else finish();
    });
  }, true);
  document.addEventListener('click', event => {
    const summary = event.target.closest('summary');
    const detail = summary?.parentElement;
    if (detail?.tagName !== 'DETAILS' || detail.open) return;
    requestAnimationFrame(() => {
      if (!detail.isConnected || !detail.open) return;
      [...detail.children].filter(node=>node.tagName !== 'SUMMARY').slice(0,4).forEach(node=>reveal(node));
    });
  }, true);
  window.addEventListener('takeover:section', event => {
    reveal(document.getElementById(event.detail.group+'-'+event.detail.name));
  });
  const routine = document.getElementById('routine-dialog');
  routine?.addEventListener('cancel', event => { if (allowed()) { event.preventDefault(); closeSheet(routine); } });
  // One arrival on the public introduction, independent from account/sync redraws.
  const welcome = document.getElementById('welcome-root');
  let welcomed = false;
  const observer = new MutationObserver(() => {
    if (welcomed || !welcome || welcome.hidden || !welcome.childElementCount) return;
    welcomed = true; observer.disconnect();
    reveal(welcome.querySelector('.welcome-copy'));
    reveal(welcome.querySelector('.welcome-preview'));
  });
  if (welcome) observer.observe(welcome,{attributes:true,childList:true});
})();

