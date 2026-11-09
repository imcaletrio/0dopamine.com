/* 0Dopamine — shared site JS
   - i18n: showLang + localStorage persistence + zd:lang event
   - theme toggle, apps carousel, scroll reveal
   (2026-11-09) La app ya está publicada en Google Play: fuera el registro
   de la beta, el grupo de testers, Turnstile y la telemetría a la hoja.
*/
(function () {
  'use strict';

  var LANG_KEY    = '0d_lang';

  function safeGet(key)       { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function safeSet(key, val)  { try { localStorage.setItem(key, val); } catch (_) {} }

  // ---------- i18n ----------
  function resolveInitialLang() {
    // URL override: ?lang=es|en  (useful for share links / testing)
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'es' || q === 'en') {
        safeSet(LANG_KEY, q);
        return q;
      }
    } catch (_) {}
    var saved = safeGet(LANG_KEY);
    if (saved === 'es' || saved === 'en') return saved;
    // Por defecto SIEMPRE español (no autodetectar el idioma del navegador).
    return 'es';
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    // Legacy grouped toggle buttons
    document.querySelectorAll('.lang-toggle button').forEach(function (btn) {
      var isActive = btn.getAttribute('data-lang') === lang;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    try { window.dispatchEvent(new CustomEvent('zd:lang', { detail: lang })); } catch (_) {}
  }

  function setLang(lang) {
    if (lang !== 'es' && lang !== 'en') return;
    safeSet(LANG_KEY, lang);
    applyLang(lang);
  }

  // Expose for inline onclick handlers (legacy) and external callers
  window.setLang = setLang;
  window.showLang = setLang;

  // Set lang ASAP (html[lang] flips before first paint of content) and wire up toggle buttons
  applyLang(resolveInitialLang());
  document.addEventListener('DOMContentLoaded', function () {
    applyLang(document.documentElement.lang || 'es');
    // Legacy two-button toggle
    document.querySelectorAll('.lang-toggle button[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () { setLang(btn.getAttribute('data-lang')); });
    });
    // New single-button switch (toggles between es and en)
    document.querySelectorAll('[data-lang-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var current = document.documentElement.lang === 'en' ? 'en' : 'es';
        setLang(current === 'en' ? 'es' : 'en');
      });
    });
  });

  // ---------- Apps carousel: spotlight + drag/flick to steer ----------
  function initAppsInteraction() {
    var strip = document.querySelector('[data-color-spotlight]');
    if (!strip) return;
    var track = strip.querySelector('.apps-track');
    if (!track) return;
    var chips = strip.querySelectorAll('.app-chip');
    var RADIUS = 180;
    var BASE_DURATION = 45; // seconds, matches CSS

    // State
    var isDown = false;
    var startX = 0, lastX = 0, lastT = 0, startT = 0;
    var wasDrag = false;
    var baseTranslate = 0;
    var trackPeriodPx = 0; // px covered by one full anim cycle

    function getTranslateX() {
      var m = window.getComputedStyle(track).transform;
      if (!m || m === 'none') return 0;
      var v = m.match(/-?[\d.]+/g);
      return v && v.length >= 6 ? parseFloat(v[4]) : 0;
    }

    function computePeriod() {
      // Animation goes 0 → -(trackWidth/2 + gap) ; use first-half width approx
      trackPeriodPx = track.scrollWidth / 2 + 9;
    }

    // Color spotlight
    strip.addEventListener('pointermove', function (e) {
      chips.forEach(function (chip) {
        var r = chip.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var dx = Math.abs(e.clientX - cx);
        var t = Math.max(0, Math.min(1, 1 - dx / RADIUS));
        chip.style.setProperty('--g', (1 - t).toFixed(2));
        chip.style.setProperty('--b', (1 + t * 0.2).toFixed(2));
      });
    });
    strip.addEventListener('pointerleave', function () {
      chips.forEach(function (c) {
        c.style.setProperty('--g', '1');
        c.style.setProperty('--b', '1');
      });
    });

    // Drag / flick
    strip.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      isDown = true;
      wasDrag = false;
      startX = lastX = e.clientX;
      startT = lastT = performance.now();
      baseTranslate = getTranslateX();
      computePeriod();
      track.style.animationPlayState = 'paused';
      track.style.transition = 'none';
      try { strip.setPointerCapture(e.pointerId); } catch (_) {}
    });

    strip.addEventListener('pointermove', function (e) {
      if (!isDown) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4) wasDrag = true;
      track.style.transform = 'translateX(' + (baseTranslate + dx) + 'px)';
      lastX = e.clientX;
      lastT = performance.now();
    });

    function endDrag(e) {
      if (!isDown) return;
      isDown = false;
      try { strip.releasePointerCapture(e.pointerId); } catch (_) {}

      var totalDx = lastX - startX;
      var dt = Math.max(0.05, (lastT - startT) / 1000);
      var velocity = totalDx / dt; // px/s (signed)

      if (!wasDrag) {
        // Click — resume cleanly; no "stuck" pause state
        track.style.transform = '';
        track.style.animationPlayState = 'running';
        return;
      }

      // Direction: dragging right → carousel flows right (reverse); left → normal
      var reverse = totalDx > 0;
      track.style.animationDirection = reverse ? 'reverse' : 'normal';

      // Speed: scale by velocity magnitude (px/s) → animationDuration
      var absV = Math.abs(velocity);
      var speedFactor = Math.max(0.4, Math.min(4, absV / 400));
      var newDuration = BASE_DURATION / speedFactor;
      track.style.animationDuration = newDuration + 's';

      // Seek animation to current visual position so there's no jump
      computePeriod();
      var currentTx = baseTranslate + totalDx;
      // Normalize into [-trackPeriodPx, 0]
      var norm = currentTx % trackPeriodPx;
      if (norm > 0) norm -= trackPeriodPx;
      var progress = (-norm) / trackPeriodPx; // 0..1 along normal direction
      if (reverse) progress = 1 - progress;
      track.style.animationDelay = (-progress * newDuration) + 's';

      // Reset inline transform and let animation take over
      track.style.transform = '';
      track.style.animationPlayState = 'running';
    }

    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);
  }

  // ---------- Theme toggle (dark default, light opt-in, persisted) ----------
  var THEME_KEY = 'zd-theme';
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    var t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    safeSet(THEME_KEY, t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#FAF9F6' : '#0B0B0D');
    var isEN = (document.documentElement.lang || 'es').slice(0, 2) === 'en';
    var label = t === 'light'
      ? (isEN ? 'Switch to dark theme' : 'Cambiar a tema oscuro')
      : (isEN ? 'Switch to light theme' : 'Cambiar a tema claro');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
    });
  }
  function initThemeToggle() {
    // Sync meta/labels with whatever the early inline script applied.
    applyTheme(currentTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
      });
    });
    // Keep aria-label in sync with language changes.
    window.addEventListener('zd:lang', function () { applyTheme(currentTheme()); });
  }

  // ---------- Scroll reveal ----------
  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { io.observe(el); });
  }

  // ---------- Bootstrap ----------
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () {
    initReveal();
    initAppsInteraction();
    initThemeToggle();
  });
})();
