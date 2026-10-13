'use strict';

/* A single, optically balanced SVG family for every app surface. */
window.TakeoverIcons = (() => {
  const paths = Object.freeze({
    profile: '<circle class="icon-wash" cx="12" cy="8" r="4"/><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 5a3.5 3.5 0 0 1 0 7M18 15a6 6 0 0 1 4 6"/>',
    shield: '<path class="icon-wash" d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z"/><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Zm-4 9 3 3 5-6"/>',
    camera: '<rect class="icon-wash" x="3" y="6" width="18" height="15" rx="4"/><path d="M8 6l2-3h4l2 3h2a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z"/><circle cx="12" cy="13" r="3.5"/>',
    trophy: '<path class="icon-wash" d="M7 3h10v7a5 5 0 0 1-10 0Z"/><path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 15v6M8 21h8"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
    lock: '<rect class="icon-wash" x="5" y="10" width="14" height="11" rx="3"/><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18M9 5a12 12 0 0 1 3 0c7 0 10 7 10 7a20 20 0 0 1-3 4M6 6a20 20 0 0 0-4 6s3 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/>',
    logOut: '<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M9 12h12m-4-4 4 4-4 4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    sun: '<circle class="icon-wash" cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path class="icon-wash" d="M20.5 14A8.7 8.7 0 0 1 10 3.5 8.8 8.8 0 1 0 20.5 14Z"/><path d="M20.5 14A8.7 8.7 0 0 1 10 3.5 8.8 8.8 0 1 0 20.5 14Z"/>',
    code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
    video: '<rect class="icon-wash" x="3" y="4" width="18" height="16" rx="4"/><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4Z"/>',
    brand: '<path fill="currentColor" stroke="none" d="M5 4h16l-2 4h-5v12h-4V8H3z"/>',
    today: '<circle class="icon-wash" cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 1 1-9 9M12 7a5 5 0 1 1-5 5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    focus: '<circle class="icon-wash" cx="12" cy="14" r="7.5"/><circle cx="12" cy="14" r="7.5"/><path d="M9 2h6M12 2v4M18 7l1.5-1.5M12 10v4l2.5 1.5"/>',
    progress: '<path class="icon-wash" d="M4 16 9 11l4 3 7-9v15H4Z"/><path d="M4 20h16M4 15l5-5 4 3 7-8M16 5h4v4"/>',
    calendar: '<rect class="icon-wash" x="3.5" y="5" width="17" height="15.5" rx="3"/><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M8 14h2M14 14h2M8 17.5h2"/>',
    more: '<rect class="icon-wash" x="3.5" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="2"/><rect x="14" y="14" width="6.5" height="6.5" rx="2"/>',
    spark: '<path class="icon-wash" d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    streak: '<path class="icon-wash" d="M13 3c1 4-3 5-3 8-1-1-2-2-2-3-3 3-4 6-2 9a7 7 0 0 0 12-1c2-5-2-8-5-13Z"/><path d="M13 3c1 4-3 5-3 8-1-1-2-2-2-3-3 3-4 6-2 9a7 7 0 0 0 12-1c2-5-2-8-5-13ZM10 16c0 2 1 3 2 3s2-1 2-3"/>',
    spirit: '<path class="icon-wash" d="M17 15.5a8 8 0 0 1-8.5-11A8.5 8.5 0 1 0 20 16a8 8 0 0 1-3-.5Z"/><path d="M17 15.5a8 8 0 0 1-8.5-11A8.5 8.5 0 1 0 20 16a8 8 0 0 1-3-.5ZM17.5 3l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
    body: '<path class="icon-wash" d="M12 20.5s-8.5-5-8.5-11a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 6-8.5 11-8.5 11Z"/><path d="M12 20.5s-8.5-5-8.5-11a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 6-8.5 11-8.5 11Z"/><path d="M6 12h3l1.5-3 3 6L15 12h3"/>',
    plan: '<rect class="icon-wash" x="4" y="3" width="16" height="18" rx="3"/><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m7 8 1 1 2-2M13 8h4M7 13h3M13 13h4M7 17h3M13 17h4"/>',
    weight: '<rect class="icon-wash" x="4" y="3" width="16" height="18" rx="4"/><rect x="4" y="3" width="16" height="18" rx="4"/><path d="M8 11a4 4 0 0 1 8 0M12 11l2-3M8 17h8"/>',
    exams: '<path class="icon-wash" d="m3 8 9-4 9 4-9 4Z"/><path d="m3 8 9-4 9 4-9 4ZM6 10v6c3 3 9 3 12 0v-6M21 8v7"/>',
    wallet: '<path class="icon-wash" d="M4 7h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2l12-2v4Z"/><path d="M4 7h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2l12-2v4M21 12h-5v5h5"/><circle cx="17.8" cy="14.5" r=".7" fill="currentColor" stroke="none"/>',
    settings: '<rect class="icon-wash" x="3" y="3" width="18" height="18" rx="4"/><path d="M4 6h4m4 0h8M4 12h10m4 0h2M4 18h2m4 0h10"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    steps: '<path class="icon-wash" d="M6 3c3 0 4 4 3 7l-1 3H4l-1-3C2 6 3 3 6 3ZM18 8c-3 0-4 4-3 7l1 3h4l1-3c1-4 0-7-3-7Z"/><path d="M6 3c3 0 4 4 3 7l-1 3H4l-1-3C2 6 3 3 6 3ZM4 16h4v2a2 2 0 0 1-4 0ZM18 8c-3 0-4 4-3 7l1 3h4l1-3c1-4 0-7-3-7ZM16 21h4"/>',
    food: '<path class="icon-wash" d="M12 7c-3-3-8-1-8 4 0 4 3 10 6 9l2-.5 2 .5c3 1 6-5 6-9 0-5-5-7-8-4Z"/><path d="M12 7c-3-3-8-1-8 4 0 4 3 10 6 9l2-.5 2 .5c3 1 6-5 6-9 0-5-5-7-8-4ZM12 7V4M13 5c0-2 2-3 4-2 0 2-2 3-4 2Z"/>',
    sleep: '<path class="icon-wash" d="M3 13h18v6H3Z"/><path d="M3 8v13M21 11v10M3 13h18v6H3M3 9h5a3 3 0 0 1 3 3v1M11 9h7a3 3 0 0 1 3 3M16 3h4l-4 3h4"/>',
    phone: '<rect class="icon-wash" x="6" y="2.5" width="12" height="19" rx="3"/><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10 5h4M11 18.5h2"/>',
    play: '<path class="icon-wash" d="m8 4 12 8-12 8Z"/><path d="m8 4 12 8-12 8Z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m15.5 4.5 4 4M5 16 16.5 4.5a2.8 2.8 0 0 1 4 4L9 20H4v-5ZM4 20l5-1"/>',
    undo: '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(1 -1) scale(.9)"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m14.5 5-7 7 7 7"/>',
    chevronRight: '<path d="m9.5 5 7 7-7 7"/>',
    arrowUp: '<path d="M5 16 17 4M7 4h10v10"/>',
    arrowDown: '<path d="M5 8 17 20M7 20h10V10"/>',
    arrowRight: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    sync: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  });

  function svg(name) {
    if (!paths[name]) throw new Error(`Unknown Takeover icon: ${name}`);
    return `<svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
  }

  function mount(root = document) {
    root.querySelectorAll('[data-icon]').forEach(element => {
      element.innerHTML = svg(element.dataset.icon);
    });
  }

  mount();
  return Object.freeze({ svg, mount });
})();
