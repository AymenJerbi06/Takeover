/* Small SVG chart kit for the dashboard: rings, gauges, columns, dot matrix, line.
   Colors come from CSS classes (s1–s4, crit, good) so light/dark themes swap in style.css. */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = n => Math.round(n * 10) / 10;

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  // Column with a 4px rounded data-end, square at the baseline.
  function barPath(x, y, w, h, r = 4) {
    r = Math.min(r, w / 2, h);
    return `M${r1(x)},${r1(y + h)}V${r1(y + r)}Q${r1(x)},${r1(y)} ${r1(x + r)},${r1(y)}H${r1(x + w - r)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + r)}V${r1(y + h)}Z`;
  }
  function arc(cx, cy, r, frac, cls, width) {
    const c = 2 * Math.PI * r;
    const track = `<circle cx="${cx}" cy="${cy}" r="${r}" class="track ${cls}" stroke-width="${width}" fill="none"/>`;
    if (frac <= 0) return track;
    const f = Math.min(frac, 1);
    return track + `<circle cx="${cx}" cy="${cy}" r="${r}" class="stroke ${cls}" stroke-width="${width}" fill="none" stroke-linecap="round"
      stroke-dasharray="${r1(c * f)} ${r1(c)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  }

  /* Concentric activity rings. rings: [{label, value 0..1, cls}] outer → inner */
  function rings(list, size = 168) {
    const w = size * 0.1, gap = 3, c = size / 2;
    let r = c - w / 2 - 1, out = '';
    for (const g of list) { out += `<g data-tip="${esc(g.label)}: ${Math.round(g.value * 100)}%">${arc(c, c, r, g.value, g.cls, w)}</g>`; r -= w + gap; }
    return `<svg viewBox="0 0 ${size} ${size}" class="rings" role="img" aria-label="${esc(list.map(g => `${g.label} ${Math.round(g.value * 100)}%`).join(', '))}">${out}</svg>`;
  }

  /* One small circular gauge with the value in the middle. */
  function gauge({ value, center, cls = 's1' }) {
    const s = 64, w = 7;
    return `<svg viewBox="0 0 ${s} ${s}" class="gauge" aria-hidden="true">${arc(s / 2, s / 2, s / 2 - w / 2 - 1, value, cls, w)}
      <text x="${s / 2}" y="${s / 2}" class="g-val" text-anchor="middle" dominant-baseline="central">${esc(center)}</text></svg>`;
  }

  /* Columns over days. series: [{label, cls, vals[]}]; stacked when >1.
     goal: reference line; overGoalCrit: bars above goal turn critical (calories). */
  function columns({ labels, tips, series, goal, goalLabel, fmtAxis = String, overGoalCrit = false, minTop = 0, fixedTop = 0 }) {
    const W = 340, H = 156, L = 34, R = 32, T = 12, B = 22;
    const pw = W - L - R, ph = H - T - B, n = labels.length;
    const totals = labels.map((_, i) => series.reduce((s, se) => s + (se.vals[i] || 0), 0));
    if (!totals.some(v => v > 0)) return '<div class="chart-empty">No data in this range yet</div>';
    const top = fixedTop || niceMax(Math.max(minTop, goal || 0, ...totals) * 1.04);
    const y = v => T + ph - (v / top) * ph;
    const band = pw / n, bw = Math.min(24, Math.max(3, band * 0.62));
    let g = '';
    for (const t of [0, top / 2, top]) {
      g += `<line x1="${L}" x2="${W - R}" y1="${r1(y(t))}" y2="${r1(y(t))}" class="grid"/>
        <text x="${L - 6}" y="${r1(y(t))}" class="axis" text-anchor="end" dominant-baseline="central">${esc(fmtAxis(t))}</text>`;
    }
    labels.forEach((lab, i) => {
      const x = L + i * band + (band - bw) / 2;
      let base = y(0);
      const crit = overGoalCrit && goal && totals[i] > goal;
      const segs = series.map(se => se.vals[i] || 0);
      const lastIdx = segs.reduce((li, v, j) => (v > 0 ? j : li), -1);
      segs.forEach((v, j) => {
        if (v <= 0) return;
        const h = (v / top) * ph;
        const gapB = base < y(0) - 0.5 ? 2 : 0; // 2px surface gap between stacked segments
        const hh = h - gapB;
        if (hh > 0.5) {
          g += j === lastIdx
            ? `<path d="${barPath(x, base - h, bw, hh)}" class="fill ${crit ? 'crit' : series[j].cls}"/>`
            : `<rect x="${r1(x)}" y="${r1(base - h)}" width="${r1(bw)}" height="${r1(hh)}" class="fill ${series[j].cls}"/>`;
        }
        base -= h;
      });
      if (crit) g += `<text x="${r1(x + bw / 2)}" y="${r1(base - 4)}" class="axis" text-anchor="middle" aria-label="over limit">▲</text>`;
      if (lab) g += `<text x="${r1(L + i * band + band / 2)}" y="${H - 6}" class="axis" text-anchor="middle">${esc(lab)}</text>`;
      g += `<rect x="${r1(L + i * band)}" y="${T}" width="${r1(band)}" height="${ph}" class="hit" data-tip="${esc(tips[i])}"/>`;
    });
    if (goal) {
      g += `<line x1="${L}" x2="${W - R}" y1="${r1(y(goal))}" y2="${r1(y(goal))}" class="goal"/>
        <text x="${W - R + 4}" y="${r1(y(goal))}" class="axis goal-label" dominant-baseline="central">${esc(goalLabel || fmtAxis(goal))}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}</svg>`;
  }

  /* Rows × days of dots (prayers). grid[row][col] boolean */
  function dotMatrix({ rows, cols, grid, tips }) {
    const L = 52, cell = 20, T = 4, W = L + cols.length * cell + 4, H = T + rows.length * cell + 18;
    let g = '';
    rows.forEach((r, ri) => {
      const cy = T + ri * cell + cell / 2;
      g += `<text x="${L - 8}" y="${cy}" class="axis" text-anchor="end" dominant-baseline="central">${esc(r)}</text>`;
      cols.forEach((_, ci) => {
        const cx = L + ci * cell + cell / 2;
        g += grid[ri][ci]
          ? `<circle cx="${cx}" cy="${cy}" r="6" class="fill s1"/>`
          : `<circle cx="${cx}" cy="${cy}" r="5" class="empty-dot"/>`;
      });
    });
    cols.forEach((c, ci) => {
      if (c) g += `<text x="${L + ci * cell + cell / 2}" y="${H - 4}" class="axis" text-anchor="middle">${esc(c)}</text>`;
      g += `<rect x="${L + ci * cell}" y="${T}" width="${cell}" height="${rows.length * cell}" class="hit" data-tip="${esc(tips[ci])}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart dots" style="max-width:${W * 1.4}px" role="img">${g}</svg>`;
  }

  /* Weight line over time with a goal line. pts: [{x: dayIndex, v, tip, label}] */
  function line({ pts, goal, goalLabel, fmtAxis = String }) {
    if (!pts.length) return '<div class="chart-empty">Log your weight to see the trend</div>';
    const W = 340, H = 150, L = 34, R = 56, T = 14, B = 22, pw = W - L - R, ph = H - T - B;
    const vals = pts.map(p => p.v).concat(goal != null ? [goal] : []);
    let lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
    if ((hi - lo) % 2) hi++; // whole-number middle tick
    const x0 = pts[0].x, x1 = Math.max(pts.at(-1).x, x0 + 1);
    const x = v => L + ((v - x0) / (x1 - x0)) * pw, y = v => T + ph - ((v - lo) / (hi - lo)) * ph;
    let g = '';
    for (const t of [lo, (lo + hi) / 2, hi]) {
      g += `<line x1="${L}" x2="${W - R}" y1="${r1(y(t))}" y2="${r1(y(t))}" class="grid"/>
        <text x="${L - 6}" y="${r1(y(t))}" class="axis" text-anchor="end" dominant-baseline="central">${esc(fmtAxis(t))}</text>`;
    }
    if (goal != null) g += `<line x1="${L}" x2="${W - R}" y1="${r1(y(goal))}" y2="${r1(y(goal))}" class="goal"/>
      <text x="${W - R + 4}" y="${r1(y(goal))}" class="axis" dominant-baseline="central">${esc(goalLabel)}</text>`;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(x(p.x))},${r1(y(p.v))}`).join('');
    if (pts.length > 1) {
      g += `<path d="${d}L${r1(x(pts.at(-1).x))},${T + ph}L${r1(x(pts[0].x))},${T + ph}Z" class="wash s1"/>`;
      g += `<path d="${d}" class="line s1"/>`;
    }
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      if (last || pts.length <= 12) g += `<circle cx="${r1(x(p.x))}" cy="${r1(y(p.v))}" r="4" class="dot s1"/>`;
      g += `<circle cx="${r1(x(p.x))}" cy="${r1(y(p.v))}" r="12" class="hit" data-tip="${esc(p.tip)}"/>`;
    });
    const lp = pts.at(-1);
    g += `<text x="${r1(x(lp.x)) + 8}" y="${r1(y(lp.v))}" class="axis strong" dominant-baseline="central">${esc(lp.label)}</text>`;
    if (pts[0].date) g += `<text x="${L}" y="${H - 6}" class="axis">${esc(pts[0].date)}</text>`;
    if (pts.length > 1 && lp.date) g += `<text x="${W - R}" y="${H - 6}" class="axis" text-anchor="end">${esc(lp.date)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}</svg>`;
  }

  /* One floating tooltip for every [data-tip]: hover on desktop, tap on touch. */
  function initTooltip() {
    const tip = document.createElement('div');
    tip.className = 'viz-tip'; tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let active = null;
    const place = (e) => {
      const pad = 12, r = tip.getBoundingClientRect();
      let left = e.clientX + pad, top = e.clientY - r.height - pad;
      if (left + r.width > innerWidth - 8) left = e.clientX - r.width - pad;
      if (left < 8) left = 8;
      if (top < 8) top = e.clientY + pad;
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const show = (el, e) => {
      active = el; tip.textContent = el.getAttribute('data-tip'); tip.classList.add('show');
      document.querySelectorAll('.hit.on').forEach(h => h.classList.remove('on'));
      el.classList.add('on'); place(e);
    };
    const hide = () => { active = null; tip.classList.remove('show'); document.querySelectorAll('.hit.on').forEach(h => h.classList.remove('on')); };
    document.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') { const el = e.target.closest?.('[data-tip]'); if (el) show(el, e); else if (active) hide(); } });
    document.addEventListener('pointermove', e => { if (active && e.pointerType === 'mouse') place(e); });
    document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; const el = e.target.closest?.('[data-tip]'); if (el) show(el, e); else hide(); });
    addEventListener('scroll', () => { if (active) hide(); }, { passive: true });
  }

  window.TakeoverCharts = { rings, gauge, columns, dotMatrix, line, initTooltip };
})();
