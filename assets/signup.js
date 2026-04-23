// 0D beta signup — shared between index.html (modal) and install.html (inline card)
// Configure once per page by setting window.ZD_SIGNUP = { root: <Element>, telemetryPrefix: 'index'|'install', autoOpenPopup: true, openTrigger: selector? }
(function() {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbyytIFY3r54hTdMLM2mlwvg_pLhG5SOaH-SZlUvatkV8rKg-UhLLmJJlLnDaD0YJaMJ/exec';
  var GROUP_URL = 'https://groups.google.com/g/zerodopamine-beta';
  var STORAGE_KEY = '0d_beta_email';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function getSavedEmail() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch(_) { return ''; }
  }

  function pushStage(prefix, stage, email) {
    try {
      var body = new FormData();
      body.append('email', email || '');
      body.append('source', '0dopamine.com' + (prefix === 'install' ? '/install' : '') + ':' + stage);
      body.append('lang', document.documentElement.lang || 'es');
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, body);
      else fetch(ENDPOINT, { method: 'POST', body: body, mode: 'no-cors', keepalive: true });
    } catch(_) {}
  }

  function setStep(root, n) {
    root.querySelectorAll('[data-step]').forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-step') === String(n));
    });
  }

  function showGroupFallback(root, blocked) {
    root.querySelectorAll('[data-popup-ok]').forEach(function(el) { el.style.display = blocked ? 'none' : ''; });
    root.querySelectorAll('[data-popup-blocked]').forEach(function(el) { el.style.display = blocked ? '' : 'none'; });
    root.querySelectorAll('[data-group-fallback]').forEach(function(el) { el.style.display = blocked ? '' : 'none'; });
  }

  function clearError(input) {
    input.classList.remove('error');
    input.removeAttribute('aria-invalid');
    var errEl = input.getAttribute('aria-describedby') && document.getElementById(input.getAttribute('aria-describedby'));
    if (errEl) errEl.textContent = '';
  }

  function showError(input, msg) {
    input.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
    var errEl = input.getAttribute('aria-describedby') && document.getElementById(input.getAttribute('aria-describedby'));
    if (errEl) errEl.textContent = msg;
    input.focus();
  }

  function initSignupForms(opts) {
    var root = opts.root || document;
    var prefix = opts.telemetryPrefix || 'index';
    var savedEmail = getSavedEmail();

    // If returning user, jump to step 2 with group-fallback visible
    if (savedEmail && opts.skipIfSaved !== false) {
      showGroupFallback(root, true);
      setStep(root, 2);
      pushStage(prefix, 'step2_view_returning', savedEmail);
    }

    root.querySelectorAll('[data-beta-go]').forEach(function(el) {
      el.addEventListener('click', function() {
        pushStage(prefix, 'play_click', savedEmail);
        if (typeof opts.onPlayClick === 'function') opts.onPlayClick();
      });
    });

    root.querySelectorAll('[data-group-fallback]').forEach(function(el) {
      el.addEventListener('click', function() { pushStage(prefix, 'group_click', savedEmail); });
    });

    root.querySelectorAll('[data-beta-form]').forEach(function(form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var input = form.querySelector('.modal-input, .input');
        var hp = form.querySelector('input[name="website"]');
        var btn = form.querySelector('.modal-submit, .submit');
        var email = (input.value || '').trim().toLowerCase();
        var isES = (document.documentElement.lang || 'es').indexOf('en') !== 0;

        // Honeypot — silent advance
        if (hp && hp.value) { showGroupFallback(root, false); setStep(root, 2); return; }

        if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
          showError(input, isES ? 'Introduce un email valido.' : 'Please enter a valid email address.');
          return;
        }
        clearError(input);
        btn.disabled = true;

        // Open group-join tab synchronously inside user gesture to avoid popup blockers
        var popup = null;
        if (opts.autoOpenPopup !== false) {
          try { popup = window.open(GROUP_URL, '_blank', 'noopener'); } catch(_) {}
        }
        var popupBlocked = !popup;

        function advance() {
          btn.disabled = false;
          savedEmail = email;
          try { localStorage.setItem(STORAGE_KEY, email); } catch(_) {}
          showGroupFallback(root, popupBlocked);
          setStep(root, 2);
          pushStage(prefix, 'step2_view', email);
        }

        var body = new FormData();
        body.append('email', email);
        body.append('source', '0dopamine.com' + (prefix === 'install' ? '/install' : ''));
        body.append('lang', document.documentElement.lang || 'es');
        if (hp) body.append('website', hp.value || '');

        fetch(ENDPOINT, { method: 'POST', body: body, mode: 'no-cors' })
          .then(advance)
          .catch(advance);
      });
    });
  }

  // Modal-specific: open/close, focus trap, focus return, ESC
  function initModal(modal) {
    if (!modal) return;
    var lastTrigger = null;

    function getFocusables() {
      var nodes = modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
      return Array.prototype.filter.call(nodes, function(el) { return el.offsetParent !== null; });
    }

    function trapFocus(e) {
      if (!modal.classList.contains('open')) return;
      if (e.key !== 'Tab') return;
      var focusables = getFocusables();
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }

    function onKey(e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
      trapFocus(e);
    }

    function open(trigger) {
      lastTrigger = trigger || document.activeElement;
      modal.querySelectorAll('[data-beta-form]').forEach(function(f) { f.reset(); });
      modal.querySelectorAll('.modal-input, .input').forEach(function(i) { i.classList.remove('error'); i.removeAttribute('aria-invalid'); });

      var savedEmail = getSavedEmail();
      if (savedEmail) {
        showGroupFallback(modal, true);
        setStep(modal, 2);
        pushStage('index', 'step2_view_returning', savedEmail);
      } else {
        setStep(modal, 1);
      }

      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      setTimeout(function() {
        var target = modal.querySelector('.modal-step-1.active .modal-input') || modal.querySelector('[data-beta-go]');
        if (target) target.focus();
      }, 30);
    }

    function close() {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
    }

    document.querySelectorAll('[data-beta-open]').forEach(function(el) {
      el.addEventListener('click', function(e) { e.preventDefault(); open(el); });
    });
    modal.querySelectorAll('[data-beta-close]').forEach(function(el) {
      el.addEventListener('click', function(e) { e.preventDefault(); close(); });
    });
    modal.addEventListener('click', function(e) { if (e.target === modal) close(); });

    // Re-localize close label when language changes
    window.addEventListener('zd:lang', function(e) {
      var closeBtn = modal.querySelector('.modal-close');
      if (closeBtn) closeBtn.setAttribute('aria-label', e.detail === 'en' ? 'Close' : 'Cerrar');
    });
  }

  // Public init
  window.ZDSignup = {
    initModal: initModal,
    initForms: initSignupForms
  };

  // Auto-init on DOMContentLoaded when no manual setup
  if (document.readyState !== 'loading') bootstrap();
  else document.addEventListener('DOMContentLoaded', bootstrap);

  function bootstrap() {
    var modal = document.getElementById('beta-modal');
    if (modal) {
      initModal(modal);
      initSignupForms({ root: modal, telemetryPrefix: 'index', autoOpenPopup: true });
    } else {
      // install.html inline card
      var card = document.querySelector('[data-signup-card]');
      if (card) initSignupForms({ root: card, telemetryPrefix: 'install', autoOpenPopup: true });
    }
  }
})();

// Language toggle — shared
function showLang(lang) {
  document.querySelectorAll('.lang-es, .lang-es-inline, .lang-es-flex, .lang-es-grid').forEach(function(el) {
    el.classList.toggle('visible', lang === 'es');
  });
  document.querySelectorAll('.lang-en, .lang-en-inline, .lang-en-flex, .lang-en-grid').forEach(function(el) {
    el.classList.toggle('visible', lang === 'en');
  });
  var btnEs = document.getElementById('btn-es');
  var btnEn = document.getElementById('btn-en');
  if (btnEs) { btnEs.classList.toggle('active', lang === 'es'); btnEs.setAttribute('aria-pressed', lang === 'es'); }
  if (btnEn) { btnEn.classList.toggle('active', lang === 'en'); btnEn.setAttribute('aria-pressed', lang === 'en'); }
  document.documentElement.lang = lang;
  try { window.dispatchEvent(new CustomEvent('zd:lang', { detail: lang })); } catch(_) {}
}

// Auto-detect browser language on first load (only if user hasn't explicitly chosen)
(function() {
  try {
    var saved = localStorage.getItem('0d_lang');
    if (saved === 'es' || saved === 'en') { showLang(saved); return; }
    var lang = (navigator.language || 'es').slice(0, 2).toLowerCase();
    if (lang === 'en') showLang('en');
  } catch(_) {}
})();
