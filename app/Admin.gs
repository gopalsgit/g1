/**
 * Om Team Register: admin screen calls. Every call needs an admin session (Google sign-in + PIN).
 */

function adminHome(token) {
  var a = admin_(token);
  return { admin: { email: String(a['Gmail']), name: String(a['Name'] || a['Gmail']) }, sheetUrl: SpreadsheetApp.getActive().getUrl() };
}

/** New joiners waiting for review, then open requests, oldest first. */
function adminQueue(token) {
  admin_(token);
  var people = readTable_(TABS.PEOPLE);
  var byId = {};
  people.forEach(function (p) { byId[String(p['ID'])] = p; });
  var joiners = people.filter(function (p) { return p['Status'] === 'Pending review'; }).map(function (p) {
    return { id: String(p['ID']), name: String(p['Full name']), type: String(p['Type']), mobile: String(p['Mobile 1']), created: fmtDate_(p['Created at']) };
  });
  var requests = readTable_(TABS.REQUESTS).filter(function (r) { return r['Status'] === 'Open'; }).map(function (r) {
    var field = String(r['Field']);
    var asked = String(r['Asked value']);
    var team = null;
    if (r['About'] === 'My team') { try { team = JSON.parse(asked); } catch (e) { team = null; } }
    return {
      id: String(r['Request ID']), date: fmtDate_(r['Date']), personId: String(r['Person ID']), person: String(r['Person']),
      about: String(r['About']), field: field, current: String(r['Current value']), asked: asked, team: team,
      isPhoto: PHOTO_FIELDS.indexOf(field) >= 0, note: String(r['Note'])
    };
  });
  return { joiners: joiners, requests: requests };
}

function adminDecide(token, requestId, approve, reply) {
  var a = admin_(token);
  var who = String(a['Gmail']);
  reply = String(reply || '').trim();
  if (!approve && !reply) throw new Error('E_FIELD:reply:err.replyNeeded');
  return withLock_(function () {
    var r = findBy_(TABS.REQUESTS, 'Request ID', requestId);
    if (!r) throw new Error('E_GENERIC');
    if (r['Status'] !== 'Open') throw new Error('E_ALREADY');
    if (approve) applyRequest_(r, who);
    var ch = updateRow_(TABS.REQUESTS, r._row, {
      'Status': approve ? 'Approved' : 'Rejected', 'Admin reply': reply, 'Closed by': who, 'Closed on': new Date()
    });
    audit_(who, TABS.REQUESTS, requestId, ch, 'app (admin)');
    return { ok: true };
  });
}

function applyRequest_(r, who) {
  var about = String(r['About']);
  if (about === 'My details') {
    var p = findBy_(TABS.PEOPLE, 'ID', r['Person ID']);
    if (!p) throw new Error('E_GENERIC');
    var field = String(r['Field']);
    if (SELF_FIELDS.indexOf(field) < 0) throw new Error('E_GENERIC');
    var v = String(r['Asked value']);
    if (field === 'Mobile 1' && mobileTaken_(v, p['ID'])) throw new Error('E_FIELD:Mobile 1:err.mobileTaken');
    var upd = {};
    upd[field] = DATE_FIELDS.indexOf(field) >= 0 ? (v ? parseDate_(v) : '') : v;
    upd['Updated at'] = new Date();
    var ch = updateRow_(TABS.PEOPLE, p._row, upd);
    audit_(who, TABS.PEOPLE, p['ID'], ch, 'request ' + r['Request ID']);
  } else if (about === 'My team') {
    var t = JSON.parse(String(r['Asked value']));
    var lead = findBy_(TABS.PEOPLE, 'ID', r['Person ID']);
    if (t.action === 'add') {
      var id = nextId_(TABS.TEAM, 'Member ID', 'M');
      appendRow_(TABS.TEAM, {
        'Member ID': id, 'Team lead ID': r['Person ID'], 'Team lead': lead ? lead['Display name'] || lead['Full name'] : r['Person'],
        'Member name': t.name, 'Mobile': t.mobile || '', 'Skill': t.skill || '', 'Active': 'yes', 'Added at': new Date()
      });
      audit_(who, TABS.TEAM, id, { 'Active': ['', 'yes'] }, 'request ' + r['Request ID']);
    } else if (t.action === 'remove') {
      var m = findBy_(TABS.TEAM, 'Member ID', t.id);
      if (m) audit_(who, TABS.TEAM, t.id, updateRow_(TABS.TEAM, m._row, { 'Active': 'no' }), 'request ' + r['Request ID']);
    }
  }
  // Attendance, salary, advance and other problems are fixed by hand; approving records the answer.
}

function adminDecideJoiner(token, personId, approve, reply) {
  var a = admin_(token);
  var who = String(a['Gmail']);
  reply = String(reply || '').trim();
  if (!approve && !reply) throw new Error('E_FIELD:reply:err.replyNeeded');
  return withLock_(function () {
    var p = findBy_(TABS.PEOPLE, 'ID', personId);
    if (!p) throw new Error('E_GENERIC');
    if (p['Status'] !== 'Pending review') throw new Error('E_ALREADY');
    var upd = { 'Status': approve ? 'Active' : 'Rejected', 'Updated at': new Date() };
    if (reply) upd['Notes'] = (p['Notes'] ? p['Notes'] + '\n' : '') + (approve ? 'Approved: ' : 'Rejected: ') + reply;
    var ch = updateRow_(TABS.PEOPLE, p._row, upd);
    audit_(who, TABS.PEOPLE, personId, ch, 'app (admin)');
    return { ok: true };
  });
}

function adminPeople(token, query) {
  admin_(token);
  var q = String(query || '').trim().toLowerCase();
  return readTable_(TABS.PEOPLE).filter(function (p) {
    if (!q) return true;
    return [p['ID'], p['Full name'], p['Display name'], p['Mobile 1'], p['Designation'], p['Department']]
      .join(' ').toLowerCase().indexOf(q) >= 0;
  }).map(function (p) {
    return {
      id: String(p['ID']), name: String(p['Full name']), display: String(p['Display name']), type: String(p['Type']),
      status: String(p['Status']), mobile: String(p['Mobile 1']), designation: String(p['Designation'])
    };
  });
}

/** One person in full, for admins only, with a link to their row in the sheet. */
function adminPerson(token, personId) {
  admin_(token);
  var p = findBy_(TABS.PEOPLE, 'ID', personId);
  if (!p) throw new Error('E_GENERIC');
  var out = {};
  SCHEMA[TABS.PEOPLE].forEach(function (f) {
    if (f === 'PIN hash') { out['PIN set'] = p[f] ? 'yes' : 'no'; return; }
    var v = p[f];
    out[f] = Object.prototype.toString.call(v) === '[object Date]' ? fmtDate_(v) : String(v === undefined ? '' : v);
  });
  var sh = sheet_(TABS.PEOPLE);
  out._sheetLink = SpreadsheetApp.getActive().getUrl() + '#gid=' + sh.getSheetId() + '&range=A' + p._row;
  if (p['Type'] === 'Team lead') out._team = teamOf_(p['ID']);
  out._requests = readTable_(TABS.REQUESTS).filter(function (r) { return String(r['Person ID']) === String(personId); })
    .map(function (r) {
      return { id: String(r['Request ID']), date: fmtDate_(r['Date']), about: String(r['About']), field: String(r['Field']), status: String(r['Status']) };
    }).reverse();
  return out;
}

/** Sets a new random 4-digit PIN, shown once to the admin. The person must change it at next sign-in. */
function adminResetPin(token, personId) {
  var a = admin_(token);
  return withLock_(function () {
    var p = findBy_(TABS.PEOPLE, 'ID', personId);
    if (!p) throw new Error('E_GENERIC');
    var pin = String(1000 + Math.floor(Math.random() * 9000));
    var ch = updateRow_(TABS.PEOPLE, p._row, { 'PIN hash': hashPin_(pin), 'Must change PIN': 'yes', 'Updated at': new Date() });
    audit_(String(a['Gmail']), TABS.PEOPLE, personId, ch, 'app (admin)');
    clearTries_(cleanMobile_(p['Mobile 1']));
    return { pin: pin };
  });
}

function adminJoinLink(token) {
  admin_(token);
  var url = appUrl_();
  if (!url) throw new Error('E_GENERIC');
  return { link: url + '?join=' + makeJoinCode_(7) };
}
