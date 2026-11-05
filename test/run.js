const { makeEnv } = require('./harness');
const assert = require('assert');
/* ------------------------------------------------------------ tests */
let passed = 0;
function t(name, fn) { fn(); passed++; console.log('ok  ' + name); }
function throwsCode(fn, code) {
  try { fn(); } catch (e) { assert.ok(String(e.message).indexOf(code) === 0, 'expected ' + code + ' got ' + e.message); return; }
  assert.fail('expected ' + code);
}

const env = makeEnv();
const G = env.ctx;
const AADHAAR = '234123412346'; // valid Verhoeff
const PIXEL = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');

t('setup creates tabs and words, removes Sheet1, hides audit', () => {
  G.setupWorkbook();
  const names = env.ss.getSheets().map(s => s.name);
  ['People', 'Team members', 'Requests', 'Admins', 'Settings & words', 'Audit log'].forEach(n => assert.ok(names.includes(n), n));
  assert.ok(!names.includes('Sheet1'));
  assert.ok(env.ss.getSheetByName('Audit log').hidden);
  assert.ok(G.readTable_('Settings & words').length > 100);
  G.setupWorkbook(); // re-run is safe
  assert.strictEqual(G.readTable_('Settings & words').length, G.readTable_('Settings & words').filter((r, i, a) => a.findIndex(x => x.Key === r.Key) === i).length);
});

t('checks: Aadhaar checksum, PAN, mobile, IFSC, mask', () => {
  assert.ok(G.isAadhaar_(AADHAAR));
  assert.ok(!G.isAadhaar_('234123412345'));
  assert.ok(G.isPan_('ABCDE1234F') && !G.isPan_('ABCD1234F'));
  assert.strictEqual(G.cleanMobile_('+91 98765 43210'), '9876543210');
  assert.ok(G.isMobile_('09876543210') && !G.isMobile_('5876543210'));
  assert.ok(G.isIfsc_('SBIN0001234') && !G.isIfsc_('SBIN1001234'));
  assert.strictEqual(G.mask_(AADHAAR), 'XXXX XXXX 2346');
  assert.strictEqual(G.mask_('ABCDE1234F'), 'XXXXXX234F');
});

let joinCode, empId, leadId, adminToken, staffToken, leadToken;
const gtoken = (email) => G.sign_({ k: 'g', e: email, x: Date.now() + 60000 });

t('joining link: bad code refused, good code makes a pending record with photos', () => {
  throwsCode(() => G.submitJoin('abcdef123456', '', {}, {}), 'E_BADJOIN');
  joinCode = G.makeJoinCode_(7);
  assert.ok(G.getBoot(joinCode).joinValid);
  const form = {
    Type: 'Employee', 'Full name': 'Ramesh Kumar', DOB: '1990-05-01', 'Mobile 1': '98765 43210', 'Mobile 2': '9123456780',
    'Emergency mobile': '2', 'Emergency contact name': 'Sita', 'Emergency relation': 'Wife', Address: 'Bhiwandi',
    'Joining date': '2026-11-01', Aadhaar: AADHAAR, PAN: 'abcde1234f', IFSC: 'sbin0001234', 'Bank account': '1234567890',
    consent: true, pin: '1234', Language: 'hi'
  };
  throwsCode(() => G.submitJoin(joinCode, '', Object.assign({}, form, { Aadhaar: '234123412345' }), {}), 'E_FIELD:Aadhaar');
  throwsCode(() => G.submitJoin(joinCode, '', Object.assign({}, form, { consent: false }), {}), 'E_FIELD:consent');
  throwsCode(() => G.submitJoin(joinCode, '', Object.assign({}, form, { 'Emergency mobile': '3' }), {}), 'E_FIELD:Emergency mobile');
  const r = G.submitJoin(joinCode, '', form, { Photo: PIXEL, 'Aadhaar photo': PIXEL });
  empId = r.id;
  assert.strictEqual(empId, 'E-0001');
  const p = G.findBy_('People', 'ID', empId);
  assert.strictEqual(p.Status, 'Pending review');
  assert.strictEqual(p['Mobile 1'], '9876543210');
  assert.strictEqual(p.PAN, 'ABCDE1234F');
  assert.ok(String(p.Photo).startsWith('https://drive'));
  assert.ok(String(p['PIN hash']).includes(':') && !String(p['PIN hash']).includes('1234:'));
  throwsCode(() => G.submitJoin(joinCode, '', form, {}), 'E_FIELD:Mobile 1:err.mobileTaken');
});

t('pending person cannot sign in', () => {
  throwsCode(() => G.login('9876543210', '1234'), 'E_PENDING');
});

t('admin: Google + PIN', () => {
  G.appendRow_('Admins', { Gmail: 'gopal@gmail.com', Name: 'Gopal', Active: 'yes' });
  const first = G.googleLogin(gtoken('Gopal@gmail.com'));
  assert.ok(first.needAdminPin && !first.hasPin);
  throwsCode(() => G.adminLogin(gtoken('gopal@gmail.com'), '4321'), 'E_NOADMINPIN');
  const a = G.findBy_('Admins', 'Gmail', 'gopal@gmail.com');
  G.updateRow_('Admins', a._row, { 'PIN hash': G.hashPin_('4321') });
  throwsCode(() => G.adminLogin(gtoken('gopal@gmail.com'), '0000'), 'E_BADLOGIN');
  adminToken = G.adminLogin(gtoken('gopal@gmail.com'), '4321').token;
  assert.strictEqual(G.adminHome(adminToken).admin.name, 'Gopal');
  throwsCode(() => G.adminLogin(G.sign_({ k: 'g', e: 'gopal@gmail.com', x: Date.now() - 1 }), '4321'), 'E_SIGNIN');
  throwsCode(() => G.adminLogin('forged.' + 'a'.repeat(64), '4321'), 'E_SIGNIN');
  throwsCode(() => G.getMe(adminToken), 'E_SIGNIN'); // admin token is not a staff token
});

t('admin approves the joiner, who can then sign in', () => {
  const q = G.adminQueue(adminToken);
  assert.strictEqual(q.joiners.length, 1);
  throwsCode(() => G.adminDecideJoiner(adminToken, empId, false, ''), 'E_FIELD:reply');
  G.adminDecideJoiner(adminToken, empId, true, '');
  throwsCode(() => G.adminDecideJoiner(adminToken, empId, true, ''), 'E_ALREADY');
  const s = G.login('+919876543210', '1234');
  assert.ok(!s.mustChangePin);
  staffToken = s.token;
});

t('staff sees own record masked', () => {
  const me = G.getMe(staffToken).me;
  assert.strictEqual(me['Full name'], 'Ramesh Kumar');
  assert.strictEqual(me.Aadhaar, 'XXXX XXXX 2346');
  assert.strictEqual(me['Bank account'], 'XXXXXX7890');
  assert.strictEqual(me.Photo, 'yes');
  assert.strictEqual(me.DOB, '1990-05-01');
  assert.ok(!('PIN hash' in me));
});

t('detail change goes through review and is applied on approval', () => {
  throwsCode(() => G.requestChange(staffToken, 'PAN', 'BAD', ''), 'E_FIELD:PAN');
  throwsCode(() => G.requestChange(staffToken, 'Status', 'Active', ''), 'E_GENERIC');
  G.requestChange(staffToken, 'Address', 'New address, Surat', 'moved');
  G.requestChange(staffToken, 'Bank account', '5555666677', '');
  let me = G.getMe(staffToken);
  assert.strictEqual(me.me.Address, 'Bhiwandi');
  assert.strictEqual(me.requests[0].asked, 'XXXXXX6677');
  const q = G.adminQueue(adminToken).requests;
  assert.strictEqual(q.length, 2);
  G.adminDecide(adminToken, q[0].id, true, '');
  throwsCode(() => G.adminDecide(adminToken, q[1].id, false, ''), 'E_FIELD:reply');
  G.adminDecide(adminToken, q[1].id, false, 'Send a cheque photo');
  me = G.getMe(staffToken);
  assert.strictEqual(me.me.Address, 'New address, Surat');
  assert.strictEqual(me.me['Bank account'], 'XXXXXX7890');
  assert.strictEqual(me.requests.find(r => r.field === 'Bank account').reply, 'Send a cheque photo');
  const audit = G.readTable_('Audit log');
  assert.ok(audit.some(a => a.Field === 'Address' && a['New value'] === 'New address, Surat' && a.Who === 'gopal@gmail.com'));
});

t('photo change saves the file and approval links it', () => {
  G.requestChange(staffToken, 'PAN photo', PIXEL, '');
  const r = G.adminQueue(adminToken).requests[0];
  assert.ok(r.isPhoto && r.asked.startsWith('https://drive'));
  G.adminDecide(adminToken, r.id, true, '');
  assert.ok(String(G.findBy_('People', 'ID', empId)['PAN photo']).startsWith('https://drive'));
});

t('report a problem', () => {
  throwsCode(() => G.reportProblem(staffToken, 'Salary', '', '  '), 'E_FIELD:note');
  G.reportProblem(staffToken, 'Attendance', '2026-11-02', 'I was present');
  const r = G.adminQueue(adminToken).requests.find(x => x.about === 'Attendance');
  assert.strictEqual(r.field, '2026-11-02');
  G.adminDecide(adminToken, r.id, true, 'Fixed');
});

t('team lead added by admin, sets PIN, adds and removes members via review', () => {
  const r = G.submitJoin('', adminToken, {
    Type: 'Team lead', 'Full name': 'Chotu', 'Display name': 'Chotu Tailor Team', 'Mobile 1': '9000000001',
    'Emergency mobile': '1', 'Emergency contact name': 'Raju', Address: 'Thane', Aadhaar: AADHAAR, consent: true, pin: '1111'
  }, {});
  leadId = r.id;
  assert.strictEqual(leadId, 'T-0001');
  G.adminDecideJoiner(adminToken, leadId, true, 'ok');
  const p = G.findBy_('People', 'ID', leadId);
  G.updateRow_('People', p._row, { 'PIN hash': G.hashPin_('2222'), 'Must change PIN': 'yes' });
  const s = G.login('9000000001', '2222');
  assert.ok(s.mustChangePin);
  leadToken = s.token;
  assert.ok(G.getMe(leadToken).mustChangePin);
  throwsCode(() => G.changePin(leadToken, '9999', '3333'), 'E_BADLOGIN');
  G.changePin(leadToken, '2222', '3333');
  assert.ok(!G.getMe(leadToken).mustChangePin);
  throwsCode(() => G.requestTeamChange(staffToken, 'add', { name: 'x' }, ''), 'E_GENERIC');
  G.requestTeamChange(leadToken, 'add', { name: 'Salim', mobile: '9000000002', skill: 'Stitching' }, '');
  let q = G.adminQueue(adminToken).requests.find(x => x.about === 'My team');
  assert.strictEqual(q.team.name, 'Salim');
  G.adminDecide(adminToken, q.id, true, '');
  let team = G.getMe(leadToken).team;
  assert.strictEqual(team.length, 1);
  assert.strictEqual(team[0].name, 'Salim');
  G.requestTeamChange(leadToken, 'remove', { id: team[0].id }, '');
  q = G.adminQueue(adminToken).requests.find(x => x.about === 'My team');
  G.adminDecide(adminToken, q.id, true, '');
  assert.strictEqual(G.getMe(leadToken).team.length, 0);
});

t('Google sign-in for staff via Email or Login Gmail', () => {
  throwsCode(() => G.googleLogin(gtoken('nobody@gmail.com')), 'E_NOGMAIL');
  const p = G.findBy_('People', 'ID', empId);
  G.updateRow_('People', p._row, { 'Login Gmail': 'ramesh@gmail.com' });
  const s = G.googleLogin(gtoken('ramesh@gmail.com'));
  assert.ok(s.token && !s.needAdminPin);
  assert.strictEqual(G.getMe(s.token).me.id, empId);
});

t('5 wrong PINs lock the login and email admins', () => {
  for (let i = 0; i < 4; i++) throwsCode(() => G.login('9876543210', '0000'), 'E_BADLOGIN');
  throwsCode(() => G.login('9876543210', '0000'), 'E_LOCKED');
  throwsCode(() => G.login('9876543210', '1234'), 'E_LOCKED');
  assert.ok(env.mails.some(m => /locked/i.test(m.subj)));
  G.clearTries_('9876543210');
  assert.ok(G.login('9876543210', '1234').token);
});


const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

t('attendance tabs exist and the month view has live formulas', () => {
  ['Attendance', 'Team attendance', 'Holidays', 'Attendance month'].forEach(n => assert.ok(env.ss.getSheetByName(n), n));
  G.refreshMonthView_(new Date());
  const mv = env.ss.getSheetByName('Attendance month');
  const row = mv.data[2];
  assert.strictEqual(row[0], empId);
  assert.ok(String(row[2]).startsWith('=IFERROR(INDEX('));
  assert.ok(String(row[row.length - 1]).startsWith('=SUMIFS('));
});

t('check in and going home: first arrival kept, unconfirmed until marked', () => {
  let r = G.checkIn(staffToken, 'in', { lat: 19.2967, lng: 73.0631, acc: 12 });
  assert.strictEqual(r.today.status, 'P');
  assert.ok(/^\d{2}:\d{2}$/.test(r.today.inTime));
  assert.strictEqual(r.today.confirmed, false);
  const first = r.today.inTime;
  r = G.checkIn(staffToken, 'in', null);
  assert.strictEqual(r.today.inTime, first);
  r = G.checkIn(staffToken, 'out', null);
  assert.ok(r.today.outTime);
  const row = G.findBy_('Attendance', 'Key', empId + '|' + G.todayStr_());
  assert.strictEqual(row['In location'], '19.29670,73.06310 ±12m');
  assert.strictEqual(row['Out location'], '');
  assert.strictEqual(G.getMe(staffToken).today.inTime, first);
  throwsCode(() => G.checkIn(leadToken, 'in', null), 'E_GENERIC');
});

t('self check-in switched on counts as confirmed', () => {
  const p = G.findBy_('People', 'ID', empId);
  const row = G.findBy_('Attendance', 'Key', empId + '|' + G.todayStr_());
  env.ss.getSheetByName('Attendance').data[row._row - 1] = [];
  G.updateRow_('People', p._row, { 'Self check-in': 'yes' });
  assert.strictEqual(G.checkIn(staffToken, 'in', null).today.confirmed, true);
  G.updateRow_('People', p._row, { 'Self check-in': 'no' });
});

let supToken;
t('only supervisors and admins mark; dates limited for supervisors', () => {
  throwsCode(() => G.markList(staffToken, ''), 'E_GENERIC');
  const p = G.findBy_('People', 'ID', empId);
  G.updateRow_('People', p._row, { Supervisor: 'yes' });
  supToken = staffToken;
  assert.ok(G.getMe(supToken).isSupervisor);
  const L = G.markList(supToken, '');
  assert.strictEqual(L.people.length, 1); // team leads are not listed
  assert.strictEqual(L.people[0].status, 'P');
  throwsCode(() => G.markList(supToken, daysAgo(30)), 'E_DATERANGE');
  throwsCode(() => G.markList(supToken, daysAgo(-1)), 'E_DATERANGE');
  throwsCode(() => G.markList(supToken, '2026-13-01x'), 'E_DATE');
  assert.ok(G.markList(adminToken, daysAgo(30)).people.length >= 0);
});

t('marking saves status and OT, confirms the day, shows in my month', () => {
  const day = daysAgo(1);
  const r = G.saveMarks(supToken, day, [{ id: empId, status: 'H', ot: '0.5' }, { id: leadId, status: 'P' }, { id: empId + 'x', status: 'P' }]);
  assert.strictEqual(r.saved, 1);
  throwsCode(() => G.saveMarks(supToken, day, [{ id: empId, status: 'Z' }]), 'E_GENERIC');
  const row = G.findBy_('Attendance', 'Key', empId + '|' + day);
  assert.strictEqual(row.Status, 'H');
  assert.strictEqual(String(row.OT), '0.5');
  assert.strictEqual(row.Confirmed, 'yes');
  assert.strictEqual(row.Source, 'Supervisor');
  G.saveMarks(supToken, G.todayStr_(), [{ id: empId, status: 'P' }]);
  const today = G.findBy_('Attendance', 'Key', empId + '|' + G.todayStr_());
  assert.ok(today['In time'], 'supervisor mark keeps the check-in time');
  assert.strictEqual(today.Confirmed, 'yes');
  const m = G.myMonth(staffToken, day.slice(0, 7));
  const d = m.days.find(x => x.date === day);
  assert.strictEqual(d.status, 'H');
  assert.strictEqual(d.ot, '0.5');
  assert.ok(m.totals.H >= 1 && m.totals.ot >= 0.5);
  assert.ok(G.readTable_('Audit log').some(a => a.Tab === 'Attendance' && a['New value'] === 'H'));
});

t('holidays and Sundays default correctly', () => {
  const hday = daysAgo(2);
  G.appendRow_('Holidays', { Date: G.parseDate_(hday), Holiday: 'Diwali' });
  const L = G.markList(supToken, hday);
  assert.strictEqual(L.holiday, 'Diwali');
  if (L.people.length) assert.strictEqual(L.people[0].status, 'HOL');
  let sun = new Date(); while (sun.getDay() !== 0) sun.setDate(sun.getDate() - 1);
  assert.strictEqual(G.defaultStatus_(ymd(sun), {}), 'WO');
});

t('attendance problem: admin fixes the day from the queue and approves', () => {
  const day = daysAgo(3);
  G.reportProblem(staffToken, 'Attendance', day, 'I was here all day');
  const q = G.adminQueue(adminToken).requests.find(x => x.about === 'Attendance' && x.field === day);
  assert.ok(q.att && q.att.status === '');
  G.adminSetAttendance(adminToken, empId, day, 'P', '1', q.id, 'Corrected');
  const row = G.findBy_('Attendance', 'Key', empId + '|' + day);
  assert.strictEqual(row.Status, 'P');
  assert.strictEqual(String(row.OT), '1');
  assert.strictEqual(row.Source, 'Admin');
  assert.strictEqual(G.findBy_('Requests', 'Request ID', q.id).Status, 'Approved');
  throwsCode(() => G.adminSetAttendance(adminToken, leadId, day, 'P', '', '', ''), 'E_GENERIC');
});

t('team leads record their own team, separately from pay', () => {
  G.requestTeamChange(leadToken, 'add', { name: 'Imran', skill: 'Cutting' }, '');
  const q = G.adminQueue(adminToken).requests.find(x => x.about === 'My team');
  G.adminDecide(adminToken, q.id, true, '');
  const L = G.teamMarkList(leadToken, '');
  assert.strictEqual(L.members.length, 1);
  assert.strictEqual(L.members[0].status, '');
  G.saveTeamMarks(leadToken, L.date, [{ id: L.members[0].id, status: 'A' }, { id: 'M-9999', status: 'P' }]);
  G.saveTeamMarks(leadToken, L.date, [{ id: L.members[0].id, status: 'H' }]);
  assert.strictEqual(G.teamMarkList(leadToken, L.date).members[0].status, 'H');
  assert.strictEqual(G.readTable_('Team attendance').length, 1);
  assert.strictEqual(G.readTable_('Attendance').filter(r => r['Person ID'] === L.members[0].id).length, 0);
  throwsCode(() => G.teamMarkList(staffToken, ''), 'E_GENERIC');
});

t('person who left is signed out', () => {
  const p = G.findBy_('People', 'ID', empId);
  G.updateRow_('People', p._row, { Status: 'Left' });
  throwsCode(() => G.getMe(staffToken), 'E_SIGNIN');
  throwsCode(() => G.login('9876543210', '1234'), 'E_INACTIVE');
});

t('admin people search, person view, PIN reset', () => {
  assert.strictEqual(G.adminPeople(adminToken, 'chotu').length, 1);
  const v = G.adminPerson(adminToken, leadId);
  assert.strictEqual(v['PIN set'], 'yes');
  assert.ok(!('PIN hash' in v));
  assert.ok(v._sheetLink.includes('range=A'));
  const r = G.adminResetPin(adminToken, leadId);
  assert.ok(/^\d{4}$/.test(r.pin));
  assert.ok(G.login('9000000001', r.pin).mustChangePin);
  assert.ok(G.adminJoinLink(adminToken).link.includes('?join='));
});

t('saved app link wins over Google\'s guess', () => {
  assert.strictEqual(G.appUrl_(), 'https://script.google.com/macros/s/TEST/exec');
  G.saveSetting_('appUrl', 'https://script.google.com/macros/s/REAL/exec');
  assert.strictEqual(G.appUrl_(), 'https://script.google.com/macros/s/REAL/exec');
  assert.ok(G.adminJoinLink(adminToken).link.startsWith('https://script.google.com/macros/s/REAL/exec?join='));
});

t('main and sign-in links are told apart', () => {
  assert.ok(G.sameLink_('https://script.google.com/macros/s/ABC/exec', 'https://script.google.com/a/macros/x/s/ABC/exec'));
  assert.ok(!G.sameLink_('https://script.google.com/macros/s/ABC/exec', 'https://script.google.com/macros/s/XYZ/exec'));
  assert.ok(!G.sameLink_('', ''));
});


let monthlyId, dailyId;
t('salary: monthly and daily pay, OT, PF/ESI, incentive, deduction, advance', () => {
  const mk = (name, mobile) => {
    const r = G.submitJoin('', adminToken, { Type: 'Employee', 'Full name': name, 'Mobile 1': mobile, 'Emergency mobile': '1',
      'Emergency contact name': 'X', Address: 'Y', Aadhaar: AADHAAR, 'Joining date': '2026-09-01', consent: true, pin: '1212' }, {});
    G.adminDecideJoiner(adminToken, r.id, true, '');
    return r.id;
  };
  monthlyId = mk('Meena Monthly', '9000000011');
  dailyId = mk('Dinesh Daily', '9000000012');
  G.appendRow_('Pay setup', { 'Person ID': monthlyId, 'Pay type': 'Monthly', 'Monthly salary': 31000, PF: 'yes', ESI: 'yes', UAN: '100200300400', 'Effective from': G.parseDate_('2026-09-01') });
  G.appendRow_('Pay setup', { 'Person ID': monthlyId, 'Pay type': 'Monthly', 'Monthly salary': 99999, 'Effective from': G.parseDate_('2026-12-01') }); // later raise, ignored for Oct
  G.appendRow_('Pay setup', { 'Person ID': dailyId, 'Pay type': 'Daily', 'Daily rate': 700, PF: 'no', ESI: 'yes', 'Effective from': G.parseDate_('2026-09-01') });
  G.appendRow_('Holidays', { Date: G.parseDate_('2026-10-02'), Holiday: 'Gandhi Jayanti' });
  for (let d = 1; d <= 31; d++) {
    const ds = '2026-10-' + String(d).padStart(2, '0');
    const sun = new Date(2026, 9, d).getDay() === 0;
    const marks = [];
    if (!sun && ds !== '2026-10-02') {
      let st = 'P', ot = '';
      if (ds === '2026-10-05' || ds === '2026-10-06') st = 'A';
      if (ds === '2026-10-07') st = 'H';
      if (ds === '2026-10-08') st = 'L';
      if (ds === '2026-10-09') ot = '1';
      if (ds === '2026-10-10') ot = '0.5';
      marks.push({ id: monthlyId, status: st, ot }, { id: dailyId, status: 'P' });
    }
    if (ds === '2026-10-04') marks.push({ id: dailyId, status: 'P' }); // worked a Sunday
    if (marks.length) G.saveMarks(adminToken, ds, marks);
  }
  throwsCode(() => G.adminAddMoney(adminToken, { personId: monthlyId, type: 'Advance', amount: 1000, recovery: 2000 }), 'E_FIELD:recovery');
  throwsCode(() => G.adminAddMoney(adminToken, { personId: monthlyId, type: 'Bonus', amount: 0 }), 'E_FIELD:amount');
  throwsCode(() => G.adminAddMoney(adminToken, { personId: leadId, type: 'Bonus', amount: 10 }), 'E_GENERIC');
  G.adminAddMoney(adminToken, { personId: monthlyId, type: 'Advance', amount: 10000, recovery: 3000, date: '2026-09-20' });
  G.adminAddMoney(adminToken, { personId: monthlyId, type: 'Incentive', amount: 2000, date: '2026-10-15', note: 'Big order' });
  G.adminAddMoney(adminToken, { personId: monthlyId, type: 'Other deduction', amount: 500, date: '2026-10-20', note: 'Damaged cloth' });

  const res = G.adminRunSalary(adminToken, '2026-10');
  assert.strictEqual(res.rows.length, 2, 'only employees employed in October');
  const m = res.rows.find(r => r['Person ID'] === monthlyId);
  assert.strictEqual(m['Payable days'], 27.5);   // 22 P + ½ + 4 Sundays + 1 holiday
  assert.strictEqual(m['Basic pay'], 27500);     // 31000 / 31 × 27.5
  assert.strictEqual(m['OT days'], 1.5);
  assert.strictEqual(m['OT pay'], 1500);
  assert.strictEqual(m['Gross'], 31000);
  assert.strictEqual(m['PF'], 1800);             // 12% of 15000 cap
  assert.strictEqual(m['ESI'], 0);               // gross above 21000
  assert.strictEqual(m['Advance recovered'], 3000);
  assert.strictEqual(m['Net pay'], 25700);
  assert.strictEqual(m['Advance left'], 7000);
  assert.strictEqual(m['Warnings'], '');
  const dly = res.rows.find(r => r['Person ID'] === dailyId);
  assert.strictEqual(dly['Payable days'], 27);   // 26 working days + 1 Sunday worked
  assert.strictEqual(dly['Gross'], 18900);
  assert.strictEqual(dly['ESI'], 142);           // 0.75% of 18900, rounded up
  assert.strictEqual(dly['Net pay'], 18758);
});

t('salary: sheet edits are recalculated, lock makes payslips, run again leaves locked rows', () => {
  const row = G.findBy_('Salary', 'Key', monthlyId + '|2026-10');
  G.updateRow_('Salary', row._row, { 'Advance recovered': 5000 });
  let res = G.adminRecalcSalary(adminToken, '2026-10');
  let m = res.rows.find(r => r['Person ID'] === monthlyId);
  assert.strictEqual(m['Net pay'], 23700);
  assert.strictEqual(m['Advance left'], 5000);
  res = G.adminLockSalary(adminToken, '2026-10');
  assert.ok(res.locked);
  m = res.rows.find(r => r['Person ID'] === monthlyId);
  assert.ok(m['Payslip'].startsWith('https://drive'));
  G.saveMarks(adminToken, '2026-10-12', [{ id: monthlyId, status: 'A' }]);
  res = G.adminRunSalary(adminToken, '2026-10');
  assert.strictEqual(res.rows.find(r => r['Person ID'] === monthlyId)['Net pay'], 23700, 'locked rows never change');
  res = G.adminMarkPaid(adminToken, '2026-10', '2026-11-01', 'Bank', '');
  assert.ok(res.rows.every(r => r['Paid on'] === '2026-11-01'));
  throwsCode(() => G.adminMarkPaid(adminToken, '2026-10', '2026-11-01', 'Cheque', ''), 'E_GENERIC');
  const nov = G.computeSalary_(G.findBy_('People', 'ID', monthlyId), '2026-11', G.salaryCtx_('2026-11'));
  assert.strictEqual(nov.inputs.advanceBefore, 5000);
  assert.strictEqual(nov.inputs.advanceRecovered, 3000);
});

t('my money and payslip for the employee, ledger for the team lead', () => {
  const tok = G.login('9000000011', '1212').token;
  const mm = G.myMoney(tok);
  assert.strictEqual(mm.lead, false);
  assert.strictEqual(mm.advanceOwed, 5000);
  assert.strictEqual(mm.payslips[0].month, '2026-10');
  assert.strictEqual(mm.payslips[0].net, 23700);
  const slip = G.getPayslip(tok, '2026-10', 'IGNORED');
  assert.strictEqual(slip.id, monthlyId);
  assert.strictEqual(slip.uan, '100200300400');
  assert.ok(G.payslipHtml_(slip).includes('23,700'));
  throwsCode(() => G.getPayslip(tok, '2026-09', ''), 'E_GENERIC');
  assert.strictEqual(G.getPayslip(adminToken, '2026-10', dailyId).id, dailyId);
  G.adminAddLedger(adminToken, { leadId, direction: 'paid', amount: 5000, date: '2026-10-10', whatFor: 'Shirts batch 12', workDone: '200 shirts', workPending: '50 shirts' });
  G.adminAddLedger(adminToken, { leadId, direction: 'received', amount: 1000, date: '2026-10-20', whatFor: 'Extra cloth returned' });
  throwsCode(() => G.adminAddLedger(adminToken, { leadId: monthlyId, direction: 'paid', amount: 5 }), 'E_GENERIC');
  const lm = G.myMoney(leadToken);
  assert.ok(lm.lead);
  assert.strictEqual(lm.ledger.balance, 4000);
  assert.strictEqual(lm.ledger.entries[1].workPending, '50 shirts');
  const lists = G.adminMoneyLists(adminToken);
  assert.strictEqual(lists.leads.find(l => l.id === leadId).balance, 4000);
});

t('words from the tab override defaults', () => {
  const w = G.findBy_('Settings & words', 'Key', 'word.teamLead');
  G.updateRow_('Settings & words', w._row, { 'English / value': 'Thekedar' });
  assert.strictEqual(G.getBoot('').words.en['word.teamLead'], 'Thekedar');
});

console.log('\n' + passed + ' checks passed');
