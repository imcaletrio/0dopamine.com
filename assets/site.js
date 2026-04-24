/* 0Dopamine — shared site JS
   - i18n: showLang + localStorage persistence + zd:lang event
   - signup flow: email capture + Google Group popup + Play Store CTA
   - modal: focus trap, ESC, restore focus, dynamic aria-labelledby
*/
(function () {
  'use strict';

  var LANG_KEY    = '0d_lang';
  var EMAIL_KEY   = '0d_beta_email';
  var ENDPOINT    = 'https://script.google.com/macros/s/AKfycbyytIFY3r54hTdMLM2mlwvg_pLhG5SOaH-SZlUvatkV8rKg-UhLLmJJlLnDaD0YJaMJ/exec';
  var GROUP_URL   = 'https://groups.google.com/g/zerodopamine-beta';
  var EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    var nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
    return nav === 'en' ? 'en' : 'es';
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    // Legacy grouped toggle buttons
    document.querySelectorAll('.lang-toggle button').forEach(function (btn) {
      var isActive = btn.getAttribute('data-lang') === lang;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    // Re-point modal aria-labelledby to the active-language title
    var modal = document.getElementById('beta-modal');
    if (modal) {
      var titleId = lang === 'en' ? 'beta-title-en' : 'beta-title-es';
      modal.setAttribute('aria-labelledby', titleId);
    }
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

  // ---------- Telemetry ----------
  function pushStage(prefix, stage, email) {
    try {
      var body = new FormData();
      body.append('email', email || '');
      body.append('source', '0dopamine.com' + (prefix === 'install' ? '/install' : '') + ':' + stage);
      body.append('lang', document.documentElement.lang || 'es');
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, body);
      else fetch(ENDPOINT, { method: 'POST', body: body, mode: 'no-cors', keepalive: true });
    } catch (_) {}
  }

  // ---------- Signup helpers ----------
  function setStep(root, n) {
    root.querySelectorAll('[data-step]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-step') === String(n));
    });
  }

  function showGroupFallback(root, blocked) {
    root.querySelectorAll('[data-popup-ok]').forEach(function (el) { el.hidden = blocked; });
    root.querySelectorAll('[data-popup-blocked]').forEach(function (el) { el.hidden = !blocked; });
    root.querySelectorAll('[data-group-fallback]').forEach(function (el) { el.hidden = !blocked; });
  }

  function clearError(input) {
    input.classList.remove('error');
    input.removeAttribute('aria-invalid');
    var err = input.getAttribute('aria-describedby') && document.getElementById(input.getAttribute('aria-describedby'));
    if (err) err.textContent = '';
  }
  function setError(input, msg) {
    input.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
    var err = input.getAttribute('aria-describedby') && document.getElementById(input.getAttribute('aria-describedby'));
    if (err) err.textContent = msg;
    input.focus();
  }

  function errorMsg(kind) {
    var isEN = (document.documentElement.lang || 'es').slice(0, 2) === 'en';
    if (kind === 'invalid')  return isEN ? 'Please enter a valid email address.' : 'Introduce un email válido.';
    if (kind === 'tooLong')  return isEN ? 'That email is too long.'               : 'Ese email es demasiado largo.';
    if (kind === 'network')  return isEN ? 'Network error. Your email is saved — try again or continue.'
                                         : 'Error de red. Tu email queda guardado — inténtalo otra vez o continúa.';
    return '';
  }

  // ---------- Signup init ----------
  function initSignupForms(opts) {
    opts = opts || {};
    var root   = opts.root || document;
    var prefix = opts.telemetryPrefix || 'index';

    // data-beta-go click → Play store telemetry
    root.querySelectorAll('[data-beta-go]').forEach(function (el) {
      el.addEventListener('click', function () {
        pushStage(prefix, 'play_click', safeGet(EMAIL_KEY));
      });
    });
    // data-group-fallback click → group telemetry
    root.querySelectorAll('[data-group-fallback]').forEach(function (el) {
      el.addEventListener('click', function () {
        pushStage(prefix, 'group_click', safeGet(EMAIL_KEY));
      });
    });

    // Form submit
    root.querySelectorAll('[data-beta-form]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = form.querySelector('input[type="email"]');
        var hp    = form.querySelector('input[name="website"]');
        var btn   = form.querySelector('button[type="submit"]');
        var email = (input.value || '').trim().toLowerCase();

        // Honeypot → silent advance
        if (hp && hp.value) { showGroupFallback(root, false); setStep(root, 2); return; }

        if (!email || !EMAIL_RE.test(email)) { setError(input, errorMsg('invalid'));  return; }
        if (email.length > 254)              { setError(input, errorMsg('tooLong')); return; }
        clearError(input);
        btn.disabled = true;

        // Open group tab synchronously inside user gesture (popup-blocker safe)
        var popup = null;
        if (opts.autoOpenPopup !== false) {
          try { popup = window.open(GROUP_URL, '_blank'); } catch (_) {}
        }
        var popupBlocked = !popup;

        var body = new FormData();
        body.append('email', email);
        body.append('source', '0dopamine.com' + (prefix === 'install' ? '/install' : ''));
        body.append('lang', document.documentElement.lang || 'es');
        if (hp) body.append('website', hp.value || '');

        // Persist locally immediately — guarantees step2 on reload
        safeSet(EMAIL_KEY, email);

        function advance() {
          btn.disabled = false;
          showGroupFallback(root, popupBlocked);
          setStep(root, 2);
          pushStage(prefix, 'step2_view', email);
        }

        fetch(ENDPOINT, { method: 'POST', body: body, mode: 'no-cors' })
          .then(advance, advance); // advance on success *or* network error
      });
    });
  }

  // ---------- Modal ----------
  function initModal(modal) {
    if (!modal) return;
    var lastTrigger = null;
    var betaEmitted = false;

    function getFocusables() {
      var q = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
      return Array.prototype.filter.call(
        modal.querySelectorAll(q),
        function (el) { return el.offsetParent !== null; }
      );
    }
    function trapFocus(e) {
      if (e.key !== 'Tab') return;
      var f = getFocusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else trapFocus(e);
    }

    function open(trigger) {
      lastTrigger = trigger || document.activeElement;
      modal.querySelectorAll('[data-beta-form]').forEach(function (f) { f.reset(); });
      modal.querySelectorAll('input[type="email"]').forEach(function (i) {
        i.classList.remove('error'); i.removeAttribute('aria-invalid');
        var err = i.getAttribute('aria-describedby') && document.getElementById(i.getAttribute('aria-describedby'));
        if (err) err.textContent = '';
      });

      var saved = safeGet(EMAIL_KEY);
      if (saved) {
        showGroupFallback(modal, true);
        setStep(modal, 2);
        if (!betaEmitted) { pushStage('index', 'step2_view_returning', saved); betaEmitted = true; }
      } else {
        setStep(modal, 1);
      }

      modal.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      setTimeout(function () {
        var target = modal.querySelector('.step.active input[type="email"]')
                  || modal.querySelector('.step.active [data-beta-go]')
                  || modal.querySelector('.modal-close');
        if (target) target.focus();
      }, 30);
    }

    function close() {
      if (!modal.classList.contains('open')) return;
      modal.classList.remove('open');
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
    }

    document.querySelectorAll('[data-beta-open]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); open(el); });
    });
    modal.querySelectorAll('[data-beta-close]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); close(); });
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

    // Re-localize close button label on lang change
    window.addEventListener('zd:lang', function (e) {
      var closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) closeBtn.setAttribute('aria-label', e.detail === 'en' ? 'Close' : 'Cerrar');
    });
  }

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
    var modal = document.getElementById('beta-modal');
    if (modal) {
      initModal(modal);
      initSignupForms({ root: modal, telemetryPrefix: 'index', autoOpenPopup: true });
    }
    var card = document.querySelector('[data-signup-card]');
    if (card) {
      initSignupForms({ root: card, telemetryPrefix: 'install', autoOpenPopup: true });
      // Returning user on /install: pre-advance to step 2
      var saved = safeGet(EMAIL_KEY);
      if (saved) {
        showGroupFallback(card, true);
        setStep(card, 2);
        pushStage('install', 'step2_view_returning', saved);
      }
    }
    initReveal();
    initAppsInteraction();
  });
})();
