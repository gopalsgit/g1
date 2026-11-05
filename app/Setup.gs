/**
 * Om Team Register: workbook setup.
 * Run setupWorkbook() once from the Apps Script editor (or Om Team > Set up / repair).
 * Safe to re-run: it only adds missing tabs and columns, and refreshes dropdowns and formats.
 */

var TABS = {
  PEOPLE: 'People',
  TEAM: 'Team members',
  REQUESTS: 'Requests',
  ADMINS: 'Admins',
  WORDS: 'Settings & words',
  AUDIT: 'Audit log',
  ATT: 'Attendance',
  TEAM_ATT: 'Team attendance',
  HOLIDAYS: 'Holidays',
  MONTH: 'Attendance month',
  PAY: 'Pay setup',
  MONEY: 'Advances & incentives',
  SALARY: 'Salary',
  LEDGER: 'Team lead ledger'
};

var SCHEMA = {};
SCHEMA[TABS.PEOPLE] = [
  'ID', 'Type', 'Display name', 'Full name', 'DOB', 'Designation', 'Department',
  'Email', 'Mobile 1', 'Mobile 2', 'Mobile 3', 'Emergency mobile', 'Emergency contact name',
  'Emergency relation', 'Address', 'Joining date', 'Exit date', 'Status',
  'Aadhaar', 'PAN', 'Bank account', 'IFSC', 'Account holder',
  'Photo', 'Aadhaar photo', 'PAN photo', 'Language',
  'Supervisor', 'Self check-in', 'Login Gmail', 'PIN hash', 'Must change PIN',
  'Consent date', 'Created at', 'Updated at', 'Notes', 'Team lead ID'
];
SCHEMA[TABS.TEAM] = [
  'Member ID', 'Team lead ID', 'Team lead', 'Member name', 'Mobile', 'Skill', 'Active', 'Notes', 'Added at'
];
SCHEMA[TABS.REQUESTS] = [
  'Request ID', 'Date', 'Person ID', 'Person', 'About', 'Field', 'Current value', 'Asked value',
  'Note', 'Status', 'Admin reply', 'Closed by', 'Closed on'
];
SCHEMA[TABS.ADMINS] = ['Gmail', 'Name', 'Active', 'PIN hash', 'Last login', 'Notes'];
SCHEMA[TABS.WORDS] = ['Key', 'English / value', 'Hindi', 'Notes'];
SCHEMA[TABS.AUDIT] = ['When', 'Who', 'Tab', 'Record', 'Field', 'Old value', 'New value', 'Via'];
SCHEMA[TABS.ATT] = [
  'Date', 'Person ID', 'Name', 'Status', 'OT', 'In time', 'Out time', 'In location', 'Out location',
  'Source', 'Marked by', 'Confirmed', 'Remarks', 'Updated at', 'Key'
];
SCHEMA[TABS.TEAM_ATT] = [
  'Date', 'Team lead ID', 'Team lead', 'Member ID', 'Member name', 'Status', 'Marked at', 'Key',
  'In time', 'Out time', 'In location', 'Out location', 'Source'
];
SCHEMA[TABS.HOLIDAYS] = ['Date', 'Holiday'];
SCHEMA[TABS.PAY] = ['Person ID', 'Name', 'Pay type', 'Monthly salary', 'Daily rate', 'PF', 'UAN', 'ESI', 'ESI number', 'Effective from', 'Notes'];
SCHEMA[TABS.MONEY] = ['Entry ID', 'Date', 'Person ID', 'Name', 'Type', 'Amount', 'Monthly recovery', 'Note', 'Entered by', 'Entered at'];
SCHEMA[TABS.SALARY] = [
  'Month', 'Person ID', 'Name', 'Pay type', 'Rate', 'Days in month', 'Present', 'Half days', 'Leave', 'Absent',
  'Sundays & holidays', 'Not marked', 'Payable days', 'OT days', 'Basic pay', 'OT pay', 'Incentive', 'Gross',
  'PF applies', 'PF', 'ESI applies', 'ESI', 'Other deduction', 'Advance before', 'Advance recovered', 'Net pay',
  'Advance left', 'Warnings', 'Locked', 'Paid on', 'Mode', 'Payslip', 'Run by', 'Run at', 'Key'
];
SCHEMA[TABS.LEDGER] = [
  'Entry ID', 'Date', 'Team lead ID', 'Team lead', 'Paid to them', 'Received from them', 'What for', 'Work done',
  'Work pending', 'Entered by', 'Entered at'
];

/** Team member: works under a team lead and is paid by them. Only has a People row if they joined
 *  through their team lead's invite link; quick-added members live on Team members only. */
var PERSON_TYPES = ['Employee', 'Team lead', 'Team member'];
var PERSON_STATUS = ['Team lead review', 'Pending review', 'Active', 'Left', 'Rejected'];
var REQUEST_ABOUT = ['My details', 'My team', 'Attendance', 'Salary', 'Advance', 'Other'];
var REQUEST_STATUS = ['Open', 'Approved', 'Rejected'];
var LANGS = ['en', 'hi'];
/** P present, A absent, H half day, L leave, WO weekly off (Sunday), HOL holiday. */
var ATT_STATUS = ['P', 'A', 'H', 'L', 'WO', 'HOL'];
var TEAM_ATT_STATUS = ['P', 'A', 'H'];
var OT_VALUES = ['', '0.5', '1'];

/** Columns kept as plain text so leading zeros and long numbers survive. */
var TEXT_COLS = {
  'People': ['Mobile 1', 'Mobile 2', 'Mobile 3', 'Aadhaar', 'PAN', 'Bank account', 'IFSC', 'PIN hash'],
  'Team members': ['Mobile'],
  'Admins': ['PIN hash'],
  'Attendance': ['In time', 'Out time', 'Key', 'Person ID'],
  'Team attendance': ['Key', 'In time', 'Out time', 'Member ID'],
  'Pay setup': ['UAN', 'ESI number'],
  'Salary': ['Month', 'Key']
};
var DATE_COLS = {
  'People': ['DOB', 'Joining date', 'Exit date', 'Consent date'],
  'Requests': ['Date', 'Closed on'],
  'Attendance': ['Date'],
  'Team attendance': ['Date'],
  'Holidays': ['Date'],
  'Pay setup': ['Effective from'],
  'Advances & incentives': ['Date'],
  'Salary': ['Paid on'],
  'Team lead ledger': ['Date']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Om Team')
    .addItem('Set PIN for selected person', 'menuSetPersonPin')
    .addItem('Set my admin PIN', 'menuSetAdminPin')
    .addItem('Make a joining link', 'menuJoinLink')
    .addItem('Refresh attendance month', 'refreshMonthView')
    .addSeparator()
    .addItem('Show app link', 'showAppLink')
    .addItem('Connect Google sign-in', 'menuConnectSignin')
    .addSeparator()
    .addItem('Set up / repair workbook', 'setupWorkbook')
    .addToUi();
}

function setupWorkbook() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Kolkata');
  Object.keys(SCHEMA).forEach(function (name) { ensureTab_(ss, name, SCHEMA[name]); });
  applyValidations_(ss);
  seedWords_();
  refreshMonthView_(new Date());
  var audit = ss.getSheetByName(TABS.AUDIT);
  if (!audit.isSheetHidden()) audit.hideSheet();
  var first = ss.getSheets()[0];
  if (first.getName() === 'Sheet1' && first.getLastRow() === 0) ss.deleteSheet(first);
  docsFolder_();
  secret_();
  try { SpreadsheetApp.getUi().alert('Workbook is ready. Next: add yourself on the Admins tab, then Om Team > Set my admin PIN.'); } catch (e) {}
}

function ensureTab_(ss, name, cols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var have = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  cols.forEach(function (c) {
    if (have.indexOf(c) === -1) {
      var at = have.filter(String).length + 1;
      if (sh.getMaxColumns() < at) sh.insertColumnAfter(sh.getMaxColumns());
      sh.getRange(1, at).setValue(c);
      have[at - 1] = c;
    }
  });
  var width = have.filter(String).length;
  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#f0efec').setWrap(true);
  sh.setFrozenRows(1);
  (TEXT_COLS[name] || []).forEach(function (c) {
    var i = have.indexOf(c);
    if (i >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  (DATE_COLS[name] || []).forEach(function (c) {
    var i = have.indexOf(c);
    if (i >= 0) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('dd-mmm-yyyy');
  });
  return sh;
}

function listRule_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
}

function colRange_(sh, header) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var i = headers.indexOf(header);
  if (i < 0) return null;
  return sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1);
}

function applyValidations_(ss) {
  var p = ss.getSheetByName(TABS.PEOPLE);
  var rules = [
    ['Type', PERSON_TYPES], ['Status', PERSON_STATUS], ['Emergency mobile', ['1', '2', '3']],
    ['Language', LANGS], ['Supervisor', ['yes', 'no']], ['Self check-in', ['yes', 'no']],
    ['Must change PIN', ['yes', 'no']]
  ];
  rules.forEach(function (r) { var rg = colRange_(p, r[0]); if (rg) rg.setDataValidation(listRule_(r[1])); });
  ['Mobile 1', 'Mobile 2', 'Mobile 3'].forEach(function (c) {
    var rg = colRange_(p, c);
    if (rg) rg.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied('=OR(' + a1Col_(rg) + '2="",REGEXMATCH(TO_TEXT(' + a1Col_(rg) + '2),"^[6-9][0-9]{9}$"))')
      .setHelpText('10 digit mobile starting 6 to 9').setAllowInvalid(false).build());
  });
  var pan = colRange_(p, 'PAN');
  if (pan) pan.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(' + a1Col_(pan) + '2="",REGEXMATCH(TO_TEXT(' + a1Col_(pan) + '2),"^[A-Z]{5}[0-9]{4}[A-Z]$"))')
    .setHelpText('PAN like ABCDE1234F').setAllowInvalid(false).build());
  var aad = colRange_(p, 'Aadhaar');
  if (aad) aad.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(' + a1Col_(aad) + '2="",REGEXMATCH(TO_TEXT(' + a1Col_(aad) + '2),"^[2-9][0-9]{11}$"))')
    .setHelpText('12 digit Aadhaar').setAllowInvalid(false).build());

  var t = ss.getSheetByName(TABS.TEAM);
  var act = colRange_(t, 'Active'); if (act) act.setDataValidation(listRule_(['yes', 'no']));
  var r = ss.getSheetByName(TABS.REQUESTS);
  var ab = colRange_(r, 'About'); if (ab) ab.setDataValidation(listRule_(REQUEST_ABOUT));
  var st = colRange_(r, 'Status'); if (st) st.setDataValidation(listRule_(REQUEST_STATUS));
  var a = ss.getSheetByName(TABS.ADMINS);
  var aa = colRange_(a, 'Active'); if (aa) aa.setDataValidation(listRule_(['yes', 'no']));

  // Status colours on People and Requests.
  var colour = function (sh, header, map) {
    var rg = colRange_(sh, header); if (!rg) return;
    var kept = sh.getConditionalFormatRules().filter(function (cf) {
      return cf.getRanges().every(function (x) { return x.getColumn() !== rg.getColumn(); });
    });
    Object.keys(map).forEach(function (k) {
      kept.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(map[k]).setRanges([rg]).build());
    });
    sh.setConditionalFormatRules(kept);
  };
  colour(p, 'Status', { 'Team lead review': '#f9eeda', 'Pending review': '#f9eeda', 'Active': '#e5f4e4', 'Left': '#f0efec', 'Rejected': '#fbebeb' });
  colour(r, 'Status', { 'Open': '#f9eeda', 'Approved': '#e5f4e4', 'Rejected': '#fbebeb' });

  var at = ss.getSheetByName(TABS.ATT);
  var ast = colRange_(at, 'Status'); if (ast) ast.setDataValidation(listRule_(ATT_STATUS));
  var aot = colRange_(at, 'OT'); if (aot) aot.setDataValidation(listRule_(['0.5', '1']));
  var acf = colRange_(at, 'Confirmed'); if (acf) acf.setDataValidation(listRule_(['yes', 'no']));
  colour(at, 'Status', ATT_COLOURS);
  var ta = ss.getSheetByName(TABS.TEAM_ATT);
  var tst = colRange_(ta, 'Status'); if (tst) tst.setDataValidation(listRule_(TEAM_ATT_STATUS));
  colour(ta, 'Status', ATT_COLOURS);

  var ps = ss.getSheetByName(TABS.PAY);
  [['Pay type', PAY_TYPES], ['PF', ['yes', 'no']], ['ESI', ['yes', 'no']]].forEach(function (x) {
    var rg = colRange_(ps, x[0]); if (rg) rg.setDataValidation(listRule_(x[1]));
  });
  var mn = ss.getSheetByName(TABS.MONEY);
  var mt = colRange_(mn, 'Type'); if (mt) mt.setDataValidation(listRule_(MONEY_TYPES));
  var sl = ss.getSheetByName(TABS.SALARY);
  [['Pay type', PAY_TYPES], ['PF applies', ['yes', 'no']], ['ESI applies', ['yes', 'no']], ['Locked', ['yes', 'no']], ['Mode', PAY_MODES]]
    .forEach(function (x) { var rg = colRange_(sl, x[0]); if (rg) rg.setDataValidation(listRule_(x[1])); });
  colour(sl, 'Locked', { 'yes': '#e5f4e4', 'no': '#f9eeda' });
}

var ATT_COLOURS = { 'P': '#e5f4e4', 'A': '#fbebeb', 'H': '#f9eeda', 'L': '#e7f1fb', 'WO': '#f0efec', 'HOL': '#efedff' };

function a1Col_(range) {
  return range.getA1Notation().replace(/[0-9]+.*$/, '');
}

/** Adds any missing default words; never overwrites wording an admin changed. */
function seedWords_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.WORDS);
  var have = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { have[String(r[0])] = true; });
  }
  var add = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (!have[k]) add.push([k, DEFAULT_SETTINGS[k][0], '', DEFAULT_SETTINGS[k][1]]);
  });
  Object.keys(DEFAULT_WORDS).forEach(function (k) {
    if (!have[k]) add.push([k, DEFAULT_WORDS[k][0], DEFAULT_WORDS[k][1], '']);
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 4).setValues(add);
}
