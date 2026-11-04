/**
 * Om Team Sign-in: a tiny separate Apps Script project that only learns who is signing in.
 *
 * It is deployed to run as the person using it, so Google tells it their Gmail. It asks for
 * nothing else (no Drive, no Sheets). It signs a short-lived token with the shared SECRET and
 * sends the person back to the main app, which checks the token.
 *
 * Script properties (Project Settings > Script properties), copied from the main sheet's
 * Om Team > Connect Google sign-in:
 *   SECRET   shared secret
 *   APP_URL  the main app's web app link (ends in /exec)
 */
function doGet() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SECRET');
  var appUrl = props.getProperty('APP_URL');
  var t = HtmlService.createTemplateFromFile('Page');
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  t.email = email;
  t.link = '';
  t.problem = '';
  if (!secret || !appUrl) t.problem = 'Sign-in is not set up yet. Ask the admin.';
  else if (!email) t.problem = 'Google did not share your email. Close this and try again.';
  else t.link = appUrl + '?g=' + sign_({ k: 'g', e: email, x: Date.now() + 5 * 60 * 1000 }, secret);
  return t.evaluate().setTitle('Sign in').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Same format as the main app: base64url(JSON) + '.' + hex(HMAC-SHA256). */
function sign_(payload, secret) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return body + '.' + hex_(Utilities.computeHmacSha256Signature(body, secret));
}
