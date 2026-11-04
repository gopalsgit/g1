/**
 * Om Team Register: small helpers for reading and writing tabs as rows of named values.
 */

var TZ = 'Asia/Kolkata';

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" is missing. Run Om Team > Set up / repair workbook.');
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

/** Every data row as an object keyed by header, plus _row (sheet row number). */
function readTable_(name) {
  var sh = sheet_(name);
  var h = headers_(sh);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, h.length).getValues().map(function (vals, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { if (k) o[k] = vals[j]; });
    return o;
  }).filter(function (o) { return String(o[h[0]]) !== ''; });
}

function findBy_(name, header, value) {
  var v = String(value).trim().toLowerCase();
  return readTable_(name).filter(function (o) { return String(o[header]).trim().toLowerCase() === v; })[0] || null;
}

/** Appends one row; keys that are not headers are ignored. */
function appendRow_(name, obj) {
  var sh = sheet_(name);
  var h = headers_(sh);
  var row = h.map(function (k) { return obj.hasOwnProperty(k) ? cellValue_(obj[k]) : ''; });
  sh.appendRow(row);
  return sh.getLastRow();
}

/** Writes the given fields into one row. Returns {field: [old, new]} for what changed. */
function updateRow_(name, rowNum, obj) {
  var sh = sheet_(name);
  var h = headers_(sh);
  var range = sh.getRange(rowNum, 1, 1, h.length);
  var vals = range.getValues()[0];
  var changed = {};
  Object.keys(obj).forEach(function (k) {
    var i = h.indexOf(k);
    if (i < 0) throw new Error('Unknown column ' + k);
    var nv = cellValue_(obj[k]);
    if (String(vals[i]) !== String(nv)) {
      changed[k] = [vals[i], nv];
      sh.getRange(rowNum, i + 1).setValue(nv);
    }
  });
  return changed;
}

function cellValue_(v) {
  if (v === null || v === undefined) return '';
  return v;
}

function nextId_(name, header, prefix) {
  var max = 0;
  readTable_(name).forEach(function (o) {
    var m = String(o[header]).match(new RegExp('^' + prefix + '-(\\d+)$'));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return prefix + '-' + ('000' + (max + 1)).slice(-4);
}

function audit_(who, tab, record, changes, via) {
  var when = new Date();
  Object.keys(changes).forEach(function (field) {
    var oldV = changes[field][0], newV = changes[field][1];
    if (field === 'PIN hash') { oldV = oldV ? '(set)' : ''; newV = '(changed)'; }
    appendRow_(TABS.AUDIT, {
      'When': when, 'Who': who, 'Tab': tab, 'Record': record, 'Field': field,
      'Old value': fmtAny_(oldV), 'New value': fmtAny_(newV), 'Via': via || 'app'
    });
  });
}

function fmtDate_(d) {
  if (!d) return '';
  if (Object.prototype.toString.call(d) !== '[object Date]') return String(d);
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

function fmtAny_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' ? fmtDate_(v) : String(v);
}

function parseDate_(s) {
  if (!s) return '';
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Date must look like 2026-11-03.');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* -------------------------------------------------------------- checks */

var VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
var VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

function isAadhaar_(s) {
  s = String(s || '').replace(/\s/g, '');
  if (!/^[2-9]\d{11}$/.test(s)) return false;
  var c = 0;
  s.split('').reverse().forEach(function (ch, i) { c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]]; });
  return c === 0;
}
function isPan_(s) { return /^[A-Z]{5}\d{4}[A-Z]$/.test(String(s || '').toUpperCase()); }
function isMobile_(s) { return /^[6-9]\d{9}$/.test(cleanMobile_(s)); }
function cleanMobile_(s) {
  var d = String(s || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  return d;
}
function isIfsc_(s) { return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(s || '').toUpperCase()); }
function isEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

/** Shows only the last 4 characters. */
function mask_(s) {
  s = String(s || '').replace(/\s/g, '');
  if (!s) return '';
  if (s.length <= 4) return s;
  var tail = s.slice(-4);
  var head = s.slice(0, -4).replace(/./g, 'X');
  var out = head + tail;
  return s.length === 12 && /^\d+$/.test(s) ? out.replace(/(.{4})(.{4})(.{4})/, '$1 $2 $3') : out;
}
