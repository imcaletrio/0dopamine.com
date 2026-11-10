/* 0Dopamine — shared site JS
   - i18n: cada idioma en su URL (/ y /en/); solo redirige el ?lang= antiguo
   - theme toggle, apps carousel, scroll reveal
   (2026-11-09) La app ya está publicada en Google Play: fuera el registro
   de la beta, el grupo de testers, Turnstile y la telemetría a la hoja.
*/
(function () {
  'use strict';

  function safeSet(key, val)  { try { localStorage.setItem(key, val); } catch (_) {} }

  // ---------- i18n ----------
  // (2026-11-10) Cada idioma tiene su propia URL (español en la raíz, inglés
  // bajo /en/) y el HTML ya viene en un solo idioma: aquí no se cambia nada.
  // Solo se respetan los enlaces antiguos con ?lang=xx, que llevan a la URL
  // del idioma pedido (la declarada en <link rel="alternate" hreflang>).
  (function legacyLangParam() {
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if ((q !== 'es' && q !== 'en') || q === document.documentElement.lang) return;
      var alt = document.querySelector('link[rel="alternate"][hreflang="' + q + '"]');
      if (alt) window.location.replace(alt.href + window.location.hash);
    } catch (_) {}
  })();

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
