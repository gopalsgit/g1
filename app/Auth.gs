/**
 * Om Team Register: sign-in.
 *
 * The app runs as the owner and is open to anyone with the link, so every call carries a signed
 * session token. Staff get one from mobile + PIN, or from Google sign-in (a small separate
 * Apps Script project that only learns their Gmail, see signin/). Admins need Google sign-in
 * and their admin PIN.
 *
 * Errors thrown to the page start with E_ so the page can show them in the person's language.
 */

/* ------------------------------------------------------------ secrets */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRET');
  if (!s) {
    s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SECRET', s);
  }
  return s;
}

function docsFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DOCS_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('Om Team Register - Documents (private)');
  props.setProperty('DOCS_FOLDER', f.getId());
  return f;
}

/* ------------------------------------------------------------- hashing */

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashPin_(pin, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + String(pin), Utilities.Charset.UTF_8);
  return salt + ':' + hex_(d);
}

function pinMatches_(pin, stored) {
  stored = String(stored || '');
  if (stored.indexOf(':') < 0) return false;
  return hashPin_(pin, stored.split(':')[0]) === stored;
}

function checkPinFormat_(pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) throw new Error('E_PIN');
}

/* -------------------------------------------------------------- tokens */

function sign_(payload) {
  var body = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8).replace(/=+$/, '');
  var sig = hex_(Utilities.computeHmacSha256Signature(body, secret_()));
  return body + '.' + sig;
}

function unsign_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  var sig = hex_(Utilities.computeHmacSha256Signature(parts[0], secret_()));
  if (sig !== parts[1]) return null;
  var pad = parts[0] + '==='.slice((parts[0].length + 3) % 4);
  var p;
  try { p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString('UTF-8')); } catch (e) { return null; }
  if (!p || !p.x || p.x < Date.now()) return null;
  return p;
}

function sessionToken_(kind, id) {
  var hours = Number(setting_('sessionHours')) || 12;
  return sign_({ k: kind, i: id, x: Date.now() + hours * 3600 * 1000 });
}

/** The signed-in staff member's People row, or throws E_SIGNIN. */
function staff_(token) {
  var p = unsign_(token);
  if (!p || p.k !== 's') throw new Error('E_SIGNIN');
  var person = findBy_(TABS.PEOPLE, 'ID', p.i);
  if (!person || person['Status'] !== 'Active') throw new Error('E_SIGNIN');
  return person;
}

/** The signed-in admin's Admins row, or throws E_SIGNIN. */
function admin_(token) {
  var p = unsign_(token);
  if (!p || p.k !== 'a') throw new Error('E_SIGNIN');
  var a = findBy_(TABS.ADMINS, 'Gmail', p.i);
  if (!a || String(a['Active']).toLowerCase() !== 'yes') throw new Error('E_SIGNIN');
  return a;
}

/* ------------------------------------------------------------ lockout */

function triesKey_(id) { return 'tries:' + String(id).toLowerCase(); }

function checkLocked_(id) {
  var n = Number(CacheService.getScriptCache().get(triesKey_(id)) || 0);
  if (n >= (Number(setting_('maxPinTries')) || 5)) throw new Error('E_LOCKED');
}

function failedTry_(id, who) {
  var cache = CacheService.getScriptCache();
  var max = Number(setting_('maxPinTries')) || 5;
  var mins = Number(setting_('lockMinutes')) || 15;
  var n = Number(cache.get(triesKey_(id)) || 0) + 1;
  cache.put(triesKey_(id), String(n), mins * 60);
  if (n === max) {
    alertAdmins_('Login locked: ' + who, who + ' entered a wrong PIN ' + max + ' times. The login is locked for ' + mins + ' minutes.');
    throw new Error('E_LOCKED');
  }
  throw new Error('E_BADLOGIN');
}

function clearTries_(id) { CacheService.getScriptCache().remove(triesKey_(id)); }

function alertAdmins_(subject, body) {
  if (String(setting_('alertAdmins')).toLowerCase() !== 'yes') return;
  var to = readTable_(TABS.ADMINS).filter(function (a) { return String(a['Active']).toLowerCase() === 'yes'; })
    .map(function (a) { return String(a['Gmail']).trim(); }).filter(isEmail_);
  if (!to.length) return;
  try {
    MailApp.sendEmail(to.join(','), '[Om Team] ' + subject, body + '\n\nOpen the register: ' + SpreadsheetApp.getActive().getUrl());
  } catch (e) { console.warn('alert mail failed: ' + e); }
}

/* --------------------------------------------------- calls from the page */

/** Staff sign-in with mobile number and PIN. */
function login(mobile, pin) {
  var m = cleanMobile_(mobile);
  if (!isMobile_(m)) throw new Error('E_MOBILE');
  checkPinFormat_(pin);
  checkLocked_(m);
  var person = readTable_(TABS.PEOPLE).filter(function (r) { return cleanMobile_(r['Mobile 1']) === m; })[0];
  if (!person || !pinMatches_(pin, person['PIN hash'])) failedTry_(m, person ? person['Full name'] + ' (' + m + ')' : m);
  clearTries_(m);
  statusGate_(person);
  return sessionFor_(person);
}

function statusGate_(person) {
  if (person['Status'] === 'Pending review') throw new Error('E_PENDING');
  if (person['Status'] !== 'Active') throw new Error('E_INACTIVE');
}

function sessionFor_(person) {
  return {
    token: sessionToken_('s', person['ID']),
    mustChangePin: String(person['Must change PIN']).toLowerCase() === 'yes'
  };
}

/**
 * Google sign-in. `gtoken` comes from the sign-in project and carries a verified Gmail.
 * Admins get {needAdminPin:true}; staff whose Login Gmail or Email matches get a session.
 */
function googleLogin(gtoken) {
  var g = unsign_(gtoken);
  if (!g || g.k !== 'g' || !g.e) throw new Error('E_SIGNIN');
  var email = String(g.e).toLowerCase();
  var admin = findBy_(TABS.ADMINS, 'Gmail', email);
  if (admin && String(admin['Active']).toLowerCase() === 'yes') {
    return { needAdminPin: true, email: email, name: String(admin['Name'] || email), hasPin: !!admin['PIN hash'] };
  }
  var person = readTable_(TABS.PEOPLE).filter(function (r) {
    return String(r['Login Gmail']).trim().toLowerCase() === email || String(r['Email']).trim().toLowerCase() === email;
  })[0];
  if (!person) throw new Error('E_NOGMAIL');
  statusGate_(person);
  return sessionFor_(person);
}

/** Second step for admins: the Google token plus the admin PIN. */
function adminLogin(gtoken, pin) {
  var g = unsign_(gtoken);
  if (!g || g.k !== 'g' || !g.e) throw new Error('E_SIGNIN');
  checkPinFormat_(pin);
  var email = String(g.e).toLowerCase();
  checkLocked_(email);
  var admin = findBy_(TABS.ADMINS, 'Gmail', email);
  if (!admin || String(admin['Active']).toLowerCase() !== 'yes') throw new Error('E_SIGNIN');
  if (!admin['PIN hash']) throw new Error('E_NOADMINPIN');
  if (!pinMatches_(pin, admin['PIN hash'])) failedTry_(email, 'Admin ' + email);
  clearTries_(email);
  updateRow_(TABS.ADMINS, admin._row, { 'Last login': new Date() });
  return { token: sessionToken_('a', email), admin: { email: email, name: String(admin['Name'] || email) } };
}

function changePin(token, oldPin, newPin) {
  var person = staff_(token);
  checkPinFormat_(newPin);
  if (!pinMatches_(oldPin, person['PIN hash'])) failedTry_(person['ID'], person['Full name']);
  return withLock_(function () {
    var ch = updateRow_(TABS.PEOPLE, person._row, { 'PIN hash': hashPin_(newPin), 'Must change PIN': 'no', 'Updated at': new Date() });
    audit_(person['Full name'], TABS.PEOPLE, person['ID'], ch, 'app');
    return { ok: true };
  });
}

/* ---------------------------------------------------- joining links */

function makeJoinCode_(days) {
  var code = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  PropertiesService.getScriptProperties().setProperty('join:' + code, String(Date.now() + (days || 7) * 86400000));
  return code;
}

function joinCodeValid_(code) {
  if (!/^[a-f0-9]{12}$/.test(String(code || ''))) return false;
  var exp = Number(PropertiesService.getScriptProperties().getProperty('join:' + code) || 0);
  return exp > Date.now();
}

/**
 * The app's /exec link. Google's own guess (ScriptApp.getService().getUrl()) can point at the
 * test deployment, which does not open, so the link pasted in setting.appUrl always wins.
 */
function appUrl_() {
  var saved = String(setting_('appUrl') || '').trim();
  if (saved) return saved;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

var EXEC_URL_RE = /^https:\/\/script\.google\.com\/.+\/exec$/;

function saveSetting_(key, value) {
  var row = findBy_(TABS.WORDS, 'Key', 'setting.' + key);
  if (row) updateRow_(TABS.WORDS, row._row, { 'English / value': value });
  else appendRow_(TABS.WORDS, { 'Key': 'setting.' + key, 'English / value': value });
}

/** Asks for the app's real link. Returns it, or '' if cancelled or wrong. */
function askAppUrl_(ui) {
  var res = ui.prompt('App link',
    'Paste this app\'s link: in the Apps Script editor, Deploy > Manage deployments > Web app URL (it ends in /exec).' +
    (appUrl_() ? '\n\nNow saved: ' + appUrl_() + '\nLeave empty to keep it.' : ''),
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return '';
  var link = res.getResponseText().trim();
  if (!link) return appUrl_();
  if (!EXEC_URL_RE.test(link)) { ui.alert('That does not look like a web app link ending in /exec.'); return ''; }
  saveSetting_('appUrl', link);
  return link;
}

/* ------------------------------------------------------- sheet menus */

function menuSetPersonPin() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== TABS.PEOPLE) { ui.alert('Go to the People tab and click on the person\'s row first.'); return; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { ui.alert('Click on the person\'s row first.'); return; }
  var person = readTable_(TABS.PEOPLE).filter(function (r) { return r._row === row; })[0];
  if (!person) { ui.alert('That row is empty.'); return; }
  var res = ui.prompt('PIN for ' + person['Full name'], 'Type a 4-digit PIN. They will be asked to change it when they first sign in.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pin = res.getResponseText().trim();
  if (!/^\d{4}$/.test(pin)) { ui.alert('The PIN must be exactly 4 digits.'); return; }
  var ch = updateRow_(TABS.PEOPLE, row, { 'PIN hash': hashPin_(pin), 'Must change PIN': 'yes', 'Updated at': new Date() });
  audit_(Session.getActiveUser().getEmail() || 'sheet', TABS.PEOPLE, person['ID'], ch, 'sheet menu');
  clearTries_(cleanMobile_(person['Mobile 1']));
  ui.alert('PIN set. Tell ' + person['Full name'] + ' the PIN. They sign in with mobile ' + person['Mobile 1'] + '.');
}

function menuSetAdminPin() {
  var ui = SpreadsheetApp.getUi();
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) { ui.alert('Google did not share your email with the script. Open the sheet with your own Google account.'); return; }
  var admin = findBy_(TABS.ADMINS, 'Gmail', email);
  if (!admin) { ui.alert(email + ' is not on the Admins tab. Add a row with this Gmail and Active = yes first.'); return; }
  var res = ui.prompt('Admin PIN for ' + email, 'Type a 4-digit PIN. You will need it with Google sign-in in the app.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pin = res.getResponseText().trim();
  if (!/^\d{4}$/.test(pin)) { ui.alert('The PIN must be exactly 4 digits.'); return; }
  var ch = updateRow_(TABS.ADMINS, admin._row, { 'PIN hash': hashPin_(pin) });
  audit_(email, TABS.ADMINS, email, ch, 'sheet menu');
  clearTries_(email);
  ui.alert('Admin PIN saved.');
}

function menuJoinLink() {
  var ui = SpreadsheetApp.getUi();
  var url = String(setting_('appUrl') || '').trim() || askAppUrl_(ui);
  if (!url) return;
  var link = url + '?join=' + makeJoinCode_(7);
  var html = HtmlService.createHtmlOutput('<div style="font:14px/1.5 Arial;padding:12px"><p>Send this link to the new person. It works for 7 days and for more than one person.</p>' +
    '<p><a href="' + link + '" target="_blank">' + link + '</a></p></div>').setWidth(480).setHeight(200);
  ui.showModalDialog(html, 'Joining link');
}

function showAppLink() {
  var url = askAppUrl_(SpreadsheetApp.getUi());
  if (!url) return;
  var body = url
    ? '<p>Share this link with the team:</p><p><a href="' + url + '" target="_blank">' + url + '</a></p>'
    : '<p>No web app deployment yet. In the Apps Script editor: Deploy &gt; New deployment &gt; Web app, ' +
      'Execute as: Me, Who has access: Anyone. Then run this again.</p>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput('<div style="font:14px/1.5 Arial;padding:12px">' + body + '</div>').setWidth(480).setHeight(200), 'App link');
}

function menuConnectSignin() {
  var ui = SpreadsheetApp.getUi();
  var url = askAppUrl_(ui);
  if (!url) return;
  var res = ui.prompt('Connect Google sign-in',
    'Paste the web app link of the separate "Om Team Sign-in" project (see README, step 9). Leave empty to only see the values to copy.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var link = res.getResponseText().trim();
  if (link) {
    if (!EXEC_URL_RE.test(link)) { ui.alert('That does not look like a web app link ending in /exec.'); return; }
    saveSetting_('signinUrl', link);
  }
  var html = HtmlService.createHtmlOutput('<div style="font:13px/1.5 Arial;padding:12px">' +
    '<p>In the Sign-in project: Project Settings &gt; Script properties, add these two:</p>' +
    '<p><b>SECRET</b><br><code style="word-break:break-all">' + secret_() + '</code></p>' +
    '<p><b>APP_URL</b><br><code style="word-break:break-all">' + url + '</code></p>' +
    '<p style="color:#a33">Keep SECRET private. Anyone who has it can sign in as anyone.</p></div>').setWidth(520).setHeight(340);
  ui.showModalDialog(html, 'Google sign-in values');
}
