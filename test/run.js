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

t('words from the tab override defaults', () => {
  const w = G.findBy_('Settings & words', 'Key', 'word.teamLead');
  G.updateRow_('Settings & words', w._row, { 'English / value': 'Thekedar' });
  assert.strictEqual(G.getBoot('').words.en['word.teamLead'], 'Thekedar');
});

console.log('\n' + passed + ' checks passed');
