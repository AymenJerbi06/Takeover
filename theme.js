'use strict';

/* Load in the head so a saved theme is applied before the first paint. */
(() => {
  const preferenceKey = 'takeover.theme';
  const root = document.documentElement;
  const colors = { dark: '#0e0f13', light: '#f5f5f8' };
  const normalize = value => value === 'light' ? 'light' : 'dark';
  let theme = 'dark';

  try {
    theme = normalize(localStorage.getItem(preferenceKey));
  } catch (_) {
    // Theme switching still works when browser storage is unavailable.
  }

  function renderControl() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;

    const isLight = theme === 'light';
    const destination = isLight ? 'dark' : 'light';
    const label = button.querySelector('[data-theme-label]');
    const glyph = button.querySelector('[data-theme-icon]');

    if (label) label.textContent = isLight ? 'Dark mode' : 'Light mode';
    if (glyph && window.TakeoverIcons) {
      glyph.innerHTML = window.TakeoverIcons.svg(isLight ? 'moon' : 'sun');
    }
    button.setAttribute('aria-label', `Switch to ${destination} mode`);
    button.title = `Switch to ${destination} mode`;
  }

  function applyTheme(value, announce = false) {
    theme = normalize(value);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = colors[theme];
    renderControl();
    if (announce) {
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }
  }

  applyTheme(theme);

  function connectControl() {
    renderControl();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      applyTheme(theme === 'dark' ? 'light' : 'dark', true);
      try {
        localStorage.setItem(preferenceKey, theme);
      } catch (_) {
        // Keep the selected theme for this page even without persistence.
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connectControl, { once: true });
  } else {
    connectControl();
  }

  window.addEventListener('storage', event => {
    if (event.key !== preferenceKey && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== localStorage) return;
    } catch (_) {
      return;
    }
    applyTheme(event.newValue, true);
  });
})();
