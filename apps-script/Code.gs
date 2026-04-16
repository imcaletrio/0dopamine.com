/**
 * 0Dopamine beta signup — Apps Script backend.
 *
 * Deployed as Web App (Execute as: me, Access: Anyone).
 * Endpoint URL is hardcoded in /index.html and /install.html.
 *
 * Required Script Properties (Project Settings → Script Properties):
 *   SHEET_ID          — ID of the "0D Beta Signups" Google Sheet
 *   RESEND_API_KEY    — API key from resend.com (optional; if empty, emails are skipped)
 *
 * Sheet columns (row 1 = header):
 *   A: Timestamp | B: Email | C: Source | D: Language
 */

var FROM_NAME  = '0Dopamine';
var FROM_EMAIL = 'hola@0dopamine.com';
var GROUP_URL  = 'https://groups.google.com/g/zerodopamine-beta';
var PLAY_URL   = 'https://play.google.com/apps/testing/com.zerodopamine';

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var RATE_LIMIT_PER_MIN = 120;

function doPost(e) {
  try {
    // Rate limit (global, not per-IP — Apps Script doesn't expose caller IP)
    var cache = CacheService.getScriptCache();
    var now = Math.floor(Date.now() / 1000);
    var bucket = 'rl:' + Math.floor(now / 60);
    var count = parseInt(cache.get(bucket) || '0', 10);
    if (count >= RATE_LIMIT_PER_MIN) return json_({ ok: false, error: 'rate_limited' });
    cache.put(bucket, String(count + 1), 90);

    var p = e.parameter || {};
    var email  = String(p.email  || '').trim().toLowerCase();
    var source = sanitize_(String(p.source || '').trim().slice(0, 80));
    var lang   = sanitize_(String(p.lang   || '').trim().slice(0, 8));
    var hp     = String(p.website || '');

    // Honeypot: silent success (don't leak to bots)
    if (hp) return json_({ ok: true });

    // Distinguish real signups from telemetry stage events (source contains ':')
    var isStageEvent = source.indexOf(':') >= 0;

    // Validate email only for real signups; stage events may omit email
    if (!isStageEvent) {
      if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
        return json_({ ok: false, error: 'invalid_email' });
      }
    }

    var props = PropertiesService.getScriptProperties();
    var sheetId = props.getProperty('SHEET_ID');
    if (!sheetId) return json_({ ok: false, error: 'not_configured' });

    var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];

    // Dedup by email for real signups — skip if already in sheet
    var alreadySignedUp = false;
    if (!isStageEvent && email) {
      var emails = sheet.getRange(2, 2, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
      for (var i = 0; i < emails.length; i++) {
        if (String(emails[i][0] || '').trim().toLowerCase() === email) {
          alreadySignedUp = true;
          break;
        }
      }
    }

    // Always log the event (including duplicates — useful for funnel analytics)
    sheet.appendRow([new Date(), email, source, lang]);

    // Send welcome email only on first real signup
    if (!isStageEvent && !alreadySignedUp) {
      sendWelcomeEmail_(email, lang);
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: '0d-beta-signup' });
}

function sendWelcomeEmail_(to, lang) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  if (!apiKey) return; // Not configured yet — skip silently

  var isEn = (lang || '').toLowerCase().indexOf('en') === 0;
  var subject = isEn
    ? 'Your 0Dopamine beta access'
    : 'Tu acceso a la beta de 0Dopamine';

  var text = isEn ? textEn_(to) : textEs_(to);
  var html = isEn ? htmlEn_(to) : htmlEs_(to);

  var payload = {
    from:     FROM_NAME + ' <' + FROM_EMAIL + '>',
    to:       [to],
    subject:  subject,
    text:     text,
    html:     html,
    reply_to: FROM_EMAIL
  };

  var res = UrlFetchApp.fetch('https://api.resend.com/emails', {
    method:            'post',
    contentType:       'application/json',
    headers:           { Authorization: 'Bearer ' + apiKey },
    payload:           JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) {
    Logger.log('Resend error ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

function textEs_(to) {
  return [
    '¡Bienvenido a la beta de 0Dopamine!',
    '',
    'Gracias por sumarte al programa de testers. Aqui tienes todo lo que necesitas:',
    '',
    '1. Unete al grupo de testers (obligatorio):',
    '   ' + GROUP_URL,
    '',
    '2. Espera ~5 minutos a que Google active tu acceso.',
    '',
    '3. Instala la beta en tu movil Android:',
    '   ' + PLAY_URL,
    '',
    'Importante: usa la misma cuenta Google en el grupo y en tu movil.',
    '',
    'Si algo no funciona, responde a este correo y te echo una mano.',
    '',
    'Gracias por ayudarme a mejorar la app,',
    'Manuel — 0Dopamine',
    '',
    '---',
    'Recibes este correo porque te registraste en 0dopamine.com. Si no fuiste tu, ignora este mensaje.'
  ].join('\n');
}

function textEn_(to) {
  return [
    'Welcome to the 0Dopamine beta!',
    '',
    'Thanks for joining the tester program. Here is everything you need:',
    '',
    '1. Join the tester group (required):',
    '   ' + GROUP_URL,
    '',
    '2. Wait ~5 minutes for Google to activate your access.',
    '',
    '3. Install the beta on your Android phone:',
    '   ' + PLAY_URL,
    '',
    'Important: use the same Google account in the group and on your phone.',
    '',
    'If anything does not work, just reply to this email and I will help.',
    '',
    'Thanks for helping me improve the app,',
    'Manuel — 0Dopamine',
    '',
    '---',
    'You received this email because you signed up at 0dopamine.com. If this was not you, please ignore.'
  ].join('\n');
}

function htmlEs_(to) {
  return htmlShell_(
    'Bienvenido a la beta de 0Dopamine',
    'Gracias por sumarte al programa de testers. Sigue estos 3 pasos:',
    ['Unete al grupo de testers (obligatorio)', 'Espera ~5 minutos a que Google active tu acceso', 'Instala la beta en tu movil Android'],
    'Unirse al grupo',
    'Instalar la beta',
    'Importante: usa la misma cuenta Google en el grupo y en tu movil.',
    'Si algo no funciona, responde a este correo y te echo una mano.',
    'Gracias por ayudarme a mejorar la app,<br>Manuel — 0Dopamine',
    'Recibes este correo porque te registraste en 0dopamine.com. Si no fuiste tu, ignora este mensaje.'
  );
}

function htmlEn_(to) {
  return htmlShell_(
    'Welcome to the 0Dopamine beta',
    'Thanks for joining the tester program. Follow these 3 steps:',
    ['Join the tester group (required)', 'Wait ~5 minutes for Google to activate your access', 'Install the beta on your Android phone'],
    'Join the group',
    'Install the beta',
    'Important: use the same Google account in the group and on your phone.',
    'If anything does not work, just reply to this email and I will help.',
    'Thanks for helping me improve the app,<br>Manuel — 0Dopamine',
    'You received this email because you signed up at 0dopamine.com. If this was not you, please ignore.'
  );
}

function htmlShell_(title, intro, steps, cta1, cta2, note, reply, sig, foot) {
  var stepsHtml = steps.map(function (s, i) {
    return '<tr><td style="padding:8px 0;color:#111;font-size:15px;line-height:1.5">' +
           '<strong>' + (i + 1) + '.</strong> ' + s + '</td></tr>';
  }).join('');
  return [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px">',
    '<tr><td align="center">',
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;padding:32px 28px">',
    '<tr><td><h1 style="margin:0 0 12px;font-size:22px;color:#111">' + title + '</h1>',
    '<p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.5">' + intro + '</p>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + stepsHtml + '</table>',
    '<p style="margin:24px 0 8px"><a href="' + GROUP_URL + '" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px">' + cta1 + ' →</a></p>',
    '<p style="margin:0 0 24px"><a href="' + PLAY_URL + '" style="display:inline-block;background:#7B79E0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px">' + cta2 + ' →</a></p>',
    '<p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.5">' + note + '</p>',
    '<p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.5">' + reply + '</p>',
    '<p style="margin:0;font-size:14px;color:#111;line-height:1.5">' + sig + '</p>',
    '</td></tr></table>',
    '<p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#888;line-height:1.5;text-align:center">' + foot + '</p>',
    '</td></tr></table></body></html>'
  ].join('');
}

function sanitize_(str) {
  // Prevent Google Sheets formula injection
  if (/^[=+\-@\t\r]/.test(str)) return "'" + str;
  return str;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
