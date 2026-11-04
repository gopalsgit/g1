/**
 * Runs the Apps Script code in Node against an in-memory spreadsheet, to check the main flows.
 *   node test/run.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

/* ------------------------------------------------------------ mocks */
function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); }
      out.push(row);
    }
    return out;
  }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; }
  setValue(x) { this.sh.set(this.r, this.c, x); return this; }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getA1Notation() { return colLetter(this.c) + this.r; }
  setDataValidation() { return this; } setFontWeight() { return this; } setBackground() { return this; }
  setWrap() { return this; } setNumberFormat() { return this; }
}
class Sheet {
  constructor(name, id) { this.name = name; this.id = id; this.data = []; this.hidden = false; this.cf = []; }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getLastRow() { for (let i = this.data.length; i > 0; i--) if ((this.data[i - 1] || []).some(v => v !== '' && v !== undefined)) return i; return 0; }
  getLastColumn() { return Math.max(0, ...this.data.map(r => { for (let j = r.length; j > 0; j--) if (r[j - 1] !== '' && r[j - 1] !== undefined) return j; return 0; })); }
  getMaxRows() { return 1000; } getMaxColumns() { return 100; } insertColumnAfter() {}
  appendRow(row) { this.set(this.getLastRow() + 1, 1, row[0]); row.forEach((v, j) => this.set(this.getLastRow(), j + 1, v)); }
  setFrozenRows() {} getName() { return this.name; } getSheetId() { return this.id; }
  hideSheet() { this.hidden = true; } isSheetHidden() { return this.hidden; }
  getConditionalFormatRules() { return this.cf; } setConditionalFormatRules(r) { this.cf = r; }
}
const chain = () => new Proxy({}, { get: (t, k) => k === 'build' ? () => ({ getRanges: () => [] }) : () => chain() });

function makeEnv() {
  const sheets = [new Sheet('Sheet1', 0)];
  const ss = {
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = new Sheet(n, sheets.length + 1); sheets.push(s); return s; },
    getSheets: () => sheets, deleteSheet: s => sheets.splice(sheets.indexOf(s), 1),
    setSpreadsheetTimeZone() {}, getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST/edit'
  };
  const props = {};
  const cache = {};
  const files = [];
  const mails = [];
  const folder = (name) => ({
    getId: () => 'F-' + name, getFoldersByName: (n) => { let used = false; return { hasNext: () => false, next: () => null }; },
    createFolder: (n) => folder(n),
    createFile: (blob) => { files.push(blob); return { getUrl: () => 'https://drive.google.com/file/d/' + files.length }; }
  });
  const signed = (buf) => Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  const ctx = {
    console,
    SpreadsheetApp: {
      getActive: () => ss, getActiveSpreadsheet: () => ss,
      newDataValidation: chain, newConditionalFormatRule: chain,
      getUi: () => { throw new Error('no ui in tests'); }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: { createFolder: folder, getFolderById: () => folder('root') },
    MailApp: { sendEmail: (to, subj) => mails.push({ to, subj }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'owner@gmail.com' }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    HtmlService: {},
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => signed(crypto.createHash('sha256').update(s, 'utf8').digest()),
      computeHmacSha256Signature: (s, key) => signed(crypto.createHmac('sha256', key).update(s, 'utf8').digest()),
      base64EncodeWebSafe: (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: (s) => signed(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      base64Decode: (s) => signed(Buffer.from(s, 'base64')),
      newBlob: (bytes, type, name) => ({ type, name, getDataAsString: () => Buffer.from(bytes.map(b => b & 0xff)).toString('utf8') }),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => {
        const p = n => String(n).padStart(2, '0');
        return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
          .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
      }
    }
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'app');
  fs.readdirSync(dir).filter(f => f.endsWith('.gs')).forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  return { ctx, ss, props, cache, files, mails };
}


module.exports = { makeEnv, seed() {
  const env = makeEnv(); const G = env.ctx;
  const AADHAAR = '234123412346';
  G.setupWorkbook();
  G.appendRow_('Admins', { Gmail: 'gopal@gmail.com', Name: 'Gopal', Active: 'yes', 'PIN hash': G.hashPin_('4321') });
  const adm = G.adminLogin(G.sign_({ k: 'g', e: 'gopal@gmail.com', x: Date.now() + 600000 }), '4321').token;
  const e = G.submitJoin('', adm, { Type: 'Employee', 'Full name': 'Ramesh Kumar', 'Mobile 1': '9876543210', 'Mobile 2': '9123456780',
    'Emergency mobile': '2', 'Emergency contact name': 'Sita', 'Emergency relation': 'Wife', Address: 'Bhiwandi', DOB: '1990-05-01',
    'Joining date': '2026-11-01', Aadhaar: AADHAAR, PAN: 'ABCDE1234F', 'Bank account': '1234567890', IFSC: 'SBIN0001234', consent: true, pin: '1234' }, {});
  G.adminDecideJoiner(adm, e.id, true, '');
  const p = G.findBy_('People', 'ID', e.id); G.updateRow_('People', p._row, { Designation: 'Tailor', Department: 'Stitching' });
  const l = G.submitJoin('', adm, { Type: 'Team lead', 'Full name': 'Chotu', 'Display name': 'Chotu Tailor Team', 'Mobile 1': '9000000001',
    'Emergency mobile': '1', 'Emergency contact name': 'Raju', Address: 'Thane', Aadhaar: AADHAAR, consent: true, pin: '1111' }, {});
  G.adminDecideJoiner(adm, l.id, true, '');
  const lead = G.login('9000000001', '1111').token;
  G.requestTeamChange(lead, 'add', { name: 'Salim', mobile: '9000000002', skill: 'Stitching' }, '');
  G.adminDecide(adm, G.adminQueue(adm).requests[0].id, true, '');
  G.requestTeamChange(lead, 'add', { name: 'Imran', skill: 'Cutting' }, '');
  const st = G.login('9876543210', '1234').token;
  G.updateRow_('People', G.findBy_('People', 'ID', e.id)._row, { Supervisor: 'yes' });
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  G.appendRow_('Holidays', { Date: G.parseDate_(ago(4)), Holiday: 'Diwali' });
  [1, 2].forEach(n => G.saveMarks(adm, ago(n), [{ id: e.id, status: n === 1 ? 'H' : 'P', ot: n === 2 ? '1' : '' }]));
  G.checkIn(st, 'in', { lat: 19.3, lng: 73.06, acc: 10 });
  G.requestChange(st, 'Address', 'Room 4, Surat', 'moved house');
  G.reportProblem(st, 'Attendance', ago(1), 'Marked half day but I was here all day');
  G.submitJoin(G.makeJoinCode_(7), '', { Type: 'Employee', 'Full name': 'Anita Devi', 'Mobile 1': '9811111111', 'Emergency mobile': '1',
    'Emergency contact name': 'Mohan', Address: 'Kalyan', Aadhaar: AADHAAR, consent: true, pin: '5555' }, {});
  return { G, tokens: { staff: st, lead, join: G.makeJoinCode_(7), g: G.sign_({ k: 'g', e: 'gopal@gmail.com', x: Date.now() + 600000 }) } };
} };
