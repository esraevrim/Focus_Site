// Theme & customization system.
// Auto-initializes on both index.html and room.html.
// Persists preferences to localStorage under 'focusSitePrefs'.

(function () {
  const THEMES = [
    { id: 'forest', name: 'Forest', file: './background.png',     mobilePortrait: './mobilforest.png' },
    { id: 'dark',   name: 'Dark',   file: './darkbackgorund.png', mobilePortrait: './mobildark.png' },
  ];

  const portraitMQ = window.matchMedia('(max-width: 768px) and (orientation: portrait)');

  const DEFAULTS = {
    themeId:     'forest',
    accentColor: '#1bb42f',
    textColor:   '#ffffff',
  };

  // ── Persistence ──────────────────────────────────────────────────────────

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('focusSitePrefs'));
      // migrate old key name
      if (p && p.timerColor && !p.textColor) p.textColor = p.timerColor;
      return Object.assign({}, DEFAULTS, p);
    } catch { return Object.assign({}, DEFAULTS); }
  }

  function savePrefs(patch) {
    const prefs = Object.assign(loadPrefs(), patch);
    localStorage.setItem('focusSitePrefs', JSON.stringify(prefs));
    return prefs;
  }

  // ── Apply helpers ─────────────────────────────────────────────────────────

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function luminance(r, g, b) {
    return [r, g, b].reduce((acc, c, i) => {
      c /= 255;
      c = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      return acc + c * [0.2126, 0.7152, 0.0722][i];
    }, 0);
  }

  function applyBackground(themeId) {
    const t    = THEMES.find(t => t.id === themeId) || THEMES[0];
    const file = (portraitMQ.matches && t.mobilePortrait) ? t.mobilePortrait : t.file;
    document.body.style.backgroundImage    = `url('${file}')`;
    document.body.style.backgroundSize     = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat   = 'no-repeat';
  }

  // Swap background automatically when phone rotates
  portraitMQ.addEventListener('change', () => applyBackground(loadPrefs().themeId));

  function applyAccent(hex) {
    const [r, g, b] = hexToRgb(hex);
    const lum = luminance(r, g, b);
    const textColor = lum > 0.35 ? '#1a1a1a' : '#ffffff';
    const root = document.documentElement;

    root.style.setProperty('--accent-color',           hex);
    root.style.setProperty('--btn-primary-text',       textColor);
    root.style.setProperty('--container-bg',           `rgba(${r},${g},${b},0.18)`);
    root.style.setProperty('--card-bg',                `rgba(${r},${g},${b},0.13)`);
    root.style.setProperty('--btn-primary-bg',         `rgba(${r},${g},${b},0.7)`);
    root.style.setProperty('--btn-primary-hover',      `rgba(${r},${g},${b},0.9)`);
    root.style.setProperty('--create-btn-bg',          `rgba(${r},${g},${b},0.55)`);
    root.style.setProperty('--create-btn-border',      `rgba(${r},${g},${b},0.7)`);
    root.style.setProperty('--accent-border',          `rgba(${r},${g},${b},0.75)`);
    root.style.setProperty('--participants-panel-bg',  `rgba(${r},${g},${b},0.1)`);
    root.style.setProperty('--is-you-bg',              `rgba(${r},${g},${b},0.22)`);
    root.style.setProperty('--is-you-border',          `rgba(${r},${g},${b},0.45)`);
    root.style.setProperty('--is-you-shadow',          `rgba(${r},${g},${b},0.18)`);
    root.style.setProperty('--modal-submit-bg',        `rgba(${r},${g},${b},0.7)`);
    root.style.setProperty('--modal-submit-hover',     `rgba(${r},${g},${b},0.9)`);
    root.style.setProperty('--avatar-selected-border', `rgba(${r},${g},${b},0.9)`);
    root.style.setProperty('--avatar-selected-bg',     `rgba(${r},${g},${b},0.25)`);
  }

  function applyTextColor(hex) {
    document.documentElement.style.setProperty('--text-color', hex);
  }

  function applyAll(prefs) {
    applyBackground(prefs.themeId);
    applyAccent(prefs.accentColor);
    applyTextColor(prefs.textColor);
  }

  // ── Build customize panel UI ──────────────────────────────────────────────

  function buildPanel() {
    // Floating toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'customize-toggle-btn';
    toggleBtn.title = 'Customize';
    toggleBtn.textContent = '🎨';
    document.body.appendChild(toggleBtn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'customizePanel';
    panel.className = 'customize-panel';
    panel.innerHTML = `
      <div class="cp-header">
        <span>Customize</span>
        <button class="cp-close" id="cpClose">✕</button>
      </div>
      <div class="cp-section">
        <div class="cp-label">Background</div>
        <div class="cp-themes" id="cpThemeGrid"></div>
      </div>
      <div class="cp-section">
        <div class="cp-label">Colors</div>
        <div class="cp-color-row">
          <label>Accent color</label>
          <input type="color" id="cpAccent" title="Accent / button color">
        </div>
        <div class="cp-color-row">
          <label>Text color</label>
          <input type="color" id="cpTimer" title="All text color">
        </div>
      </div>
      <button class="cp-reset" id="cpReset">Reset to Default</button>
    `;
    document.body.appendChild(panel);

    // Populate background theme cards
    const themeGrid = panel.querySelector('#cpThemeGrid');

    function updateActiveTheme(id) {
      themeGrid.querySelectorAll('.cp-theme-card').forEach(c =>
        c.classList.toggle('active', c.dataset.id === id)
      );
    }

    THEMES.forEach(t => {
      const card = document.createElement('button');
      card.className = 'cp-theme-card';
      card.dataset.id = t.id;
      card.style.backgroundImage = `url('${t.file}')`;
      card.title = t.name;
      const lbl = document.createElement('span');
      lbl.textContent = t.name;
      card.appendChild(lbl);
      card.addEventListener('click', () => {
        applyBackground(t.id);
        savePrefs({ themeId: t.id });
        updateActiveTheme(t.id);
      });
      themeGrid.appendChild(card);
    });

    // Color pickers
    const accentPicker = panel.querySelector('#cpAccent');
    const timerPicker  = panel.querySelector('#cpTimer');

    const prefs = loadPrefs();
    accentPicker.value = prefs.accentColor;
    timerPicker.value  = prefs.textColor;
    updateActiveTheme(prefs.themeId);

    accentPicker.addEventListener('input', e => {
      applyAccent(e.target.value);
      savePrefs({ accentColor: e.target.value });
    });

    timerPicker.addEventListener('input', e => {
      applyTextColor(e.target.value);
      savePrefs({ textColor: e.target.value });
    });

    // Toggle open/close
    toggleBtn.addEventListener('click', () => panel.classList.toggle('open'));
    panel.querySelector('#cpClose').addEventListener('click', () => panel.classList.remove('open'));

    // Close when clicking outside
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== toggleBtn) {
        panel.classList.remove('open');
      }
    });

    // Reset to defaults
    panel.querySelector('#cpReset').addEventListener('click', () => {
      savePrefs(DEFAULTS);
      applyAll(DEFAULTS);
      accentPicker.value = DEFAULTS.accentColor;
      timerPicker.value  = DEFAULTS.textColor;
      updateActiveTheme(DEFAULTS.themeId);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  // Apply preferences immediately (before full DOM ready) to avoid flash
  applyAll(loadPrefs());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }
})();
