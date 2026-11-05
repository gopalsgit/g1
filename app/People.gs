/**
 * Om Team Register: what employees and team leads see and send from the app.
 */

/** Fields a person may ask to change. Everything else is admin-only. */
var SELF_FIELDS = [
  'Full name', 'Display name', 'DOB', 'Email', 'Mobile 1', 'Mobile 2', 'Mobile 3', 'Emergency mobile',
  'Emergency contact name', 'Emergency relation', 'Address', 'Aadhaar', 'PAN', 'Bank account', 'IFSC',
  'Account holder', 'Photo', 'Aadhaar photo', 'PAN photo'
];
var MASKED_FIELDS = ['Aadhaar', 'PAN', 'Bank account'];
var PHOTO_FIELDS = ['Photo', 'Aadhaar photo', 'PAN photo'];
var DATE_FIELDS = ['DOB', 'Joining date', 'Exit date'];
/** Team members are paid by their team lead, so they never give bank details. */
var BANK_FIELDS = ['Bank account', 'IFSC', 'Account holder'];
function selfFieldsFor_(p) {
  return p['Type'] === 'Team member' ? SELF_FIELDS.filter(function (f) { return BANK_FIELDS.indexOf(f) < 0; }) : SELF_FIELDS;
}
function leadName_(lead) { return lead ? String(lead['Display name'] || lead['Full name']) : ''; }

/** Words, settings and anything the first screen needs. No sign-in required. */
function getBoot(joinCode) {
  var w = loadWords_();
  var out = {
    words: w.words,
    orgName: w.settings['setting.orgName'],
    signinUrl: w.settings['setting.signinUrl'] || '',
    joinValid: false
  };
  if (joinCode) {
    try {
      out.joinValid = joinCodeValid_(joinCode);
      var lead = out.joinValid ? joinLead_(joinCode) : null;
      if (lead) out.joinTeam = leadName_(lead);
    } catch (e) { out.joinValid = false; }
  }
  return out;
}

/** The person's own record for the app: sensitive numbers masked, photos as yes/no. */
function publicPerson_(p) {
  var out = { id: String(p['ID']), type: String(p['Type']) };
  selfFieldsFor_(p).concat(['Designation', 'Department', 'Joining date', 'Language']).forEach(function (f) {
    var v = p[f];
    if (DATE_FIELDS.indexOf(f) >= 0) v = fmtDate_(v);
    else if (MASKED_FIELDS.indexOf(f) >= 0) v = mask_(v);
    else if (PHOTO_FIELDS.indexOf(f) >= 0) v = v ? 'yes' : '';
    else v = String(v === undefined ? '' : v);
    out[f] = v;
  });
  return out;
}

function getMe(token) {
  var p = staff_(token);
  var requests = readTable_(TABS.REQUESTS).filter(function (r) { return String(r['Person ID']) === String(p['ID']); })
    .map(function (r) {
      var field = String(r['Field']);
      var asked = String(r['Asked value']);
      if (MASKED_FIELDS.indexOf(field) >= 0) asked = mask_(asked);
      if (PHOTO_FIELDS.indexOf(field) >= 0) asked = asked ? 'photo' : '';
      return {
        id: String(r['Request ID']), date: fmtDate_(r['Date']), about: String(r['About']), field: field,
        asked: asked, note: String(r['Note']), status: String(r['Status']), reply: String(r['Admin reply'])
      };
    }).reverse();
  var out = {
    me: publicPerson_(p),
    mustChangePin: String(p['Must change PIN']).toLowerCase() === 'yes',
    requests: requests
  };
  if (p['Type'] === 'Team lead') {
    out.team = teamOf_(p['ID']);
    out.teamJoiners = teamJoiners_(p['ID']);
  }
  if (p['Type'] === 'Employee' || p['Type'] === 'Team member') {
    out.today = p['Type'] === 'Employee' ? attendanceOn_(p['ID'], todayStr_()) : teamAttOn_(p['ID'], todayStr_());
    out.todayDate = todayStr_();
    out.autoCheckIn = String(setting_('autoCheckIn')).toLowerCase() === 'yes';
  }
  if (p['Type'] === 'Team member') out.leadName = leadName_(findBy_(TABS.PEOPLE, 'ID', p['Team lead ID']));
  out.isSupervisor = String(p['Supervisor']).toLowerCase() === 'yes';
  return out;
}

function teamOf_(leadId) {
  return readTable_(TABS.TEAM).filter(function (m) {
    return String(m['Team lead ID']) === String(leadId) && String(m['Active']).toLowerCase() !== 'no';
  }).map(function (m) {
    return { id: String(m['Member ID']), name: String(m['Member name']), mobile: String(m['Mobile']), skill: String(m['Skill']) };
  });
}

function setLanguage(token, lang) {
  var p = staff_(token);
  if (LANGS.indexOf(lang) < 0) throw new Error('E_GENERIC');
  return withLock_(function () {
    var ch = updateRow_(TABS.PEOPLE, p._row, { 'Language': lang });
    audit_(p['Full name'], TABS.PEOPLE, p['ID'], ch, 'app');
    return { ok: true };
  });
}

/** Checks and tidies one field value. Throws E_FIELD:<field>:<word key> when it is wrong. */
function cleanField_(field, value) {
  var v = String(value === undefined || value === null ? '' : value).trim();
  var bad = function (key) { throw new Error('E_FIELD:' + field + ':' + key); };
  switch (field) {
    case 'Mobile 1':
      v = cleanMobile_(v); if (!isMobile_(v)) bad('err.mobile'); break;
    case 'Mobile 2': case 'Mobile 3':
      v = cleanMobile_(v); if (v && !isMobile_(v)) bad('err.mobile'); break;
    case 'Emergency mobile':
      if (['1', '2', '3'].indexOf(v) < 0) bad('err.required'); break;
    case 'Aadhaar':
      v = v.replace(/\s/g, ''); if (v && !isAadhaar_(v)) bad('err.aadhaar'); break;
    case 'PAN':
      v = v.toUpperCase().replace(/\s/g, ''); if (v && !isPan_(v)) bad('err.pan'); break;
    case 'IFSC':
      v = v.toUpperCase().replace(/\s/g, ''); if (v && !isIfsc_(v)) bad('err.ifsc'); break;
    case 'Bank account':
      v = v.replace(/\s/g, ''); if (v && !/^\d{6,20}$/.test(v)) bad('err.required'); break;
    case 'Email':
      if (v && !isEmail_(v)) bad('err.email'); break;
    case 'DOB': case 'Joining date':
      if (v) parseDate_(v); break;
    case 'Full name':
      if (!v) bad('err.required'); break;
    default:
      if (v.length > 500) v = v.slice(0, 500);
  }
  return v;
}

function mobileTaken_(mobile, exceptId) {
  return readTable_(TABS.PEOPLE).some(function (r) {
    return cleanMobile_(r['Mobile 1']) === mobile && String(r['ID']) !== String(exceptId || '') && r['Status'] !== 'Rejected';
  });
}

/** Saves a photo (data URL from the page) in the person's private Drive folder. Returns the file URL. */
function savePhoto_(personId, field, dataUrl) {
  var m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('E_FIELD:' + field + ':err.required');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('E_FIELD:' + field + ':err.generic');
  var root = docsFolder_();
  var it = root.getFoldersByName(personId);
  var folder = it.hasNext() ? it.next() : root.createFolder(personId);
  var stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  var ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg';
  var file = folder.createFile(Utilities.newBlob(bytes, m[1], personId + ' ' + field + ' ' + stamp + '.' + ext));
  return file.getUrl();
}

/** A change to one of the person's own details. Language changes at once; the rest wait for an admin. */
function requestChange(token, field, value, note) {
  var p = staff_(token);
  if (selfFieldsFor_(p).indexOf(field) < 0) throw new Error('E_GENERIC');
  return withLock_(function () {
    var asked = PHOTO_FIELDS.indexOf(field) >= 0 ? savePhoto_(p['ID'], field, value) : cleanField_(field, value);
    if (field === 'Mobile 1' && mobileTaken_(asked, p['ID'])) throw new Error('E_FIELD:Mobile 1:err.mobileTaken');
    var current = p[field];
    if (DATE_FIELDS.indexOf(field) >= 0) current = fmtDate_(current);
    var id = nextId_(TABS.REQUESTS, 'Request ID', 'R');
    appendRow_(TABS.REQUESTS, {
      'Request ID': id, 'Date': new Date(), 'Person ID': p['ID'], 'Person': p['Full name'], 'About': 'My details',
      'Field': field, 'Current value': String(current), 'Asked value': asked, 'Note': String(note || '').slice(0, 1000),
      'Status': 'Open'
    });
    return { ok: true, id: id };
  });
}

/** "Report a problem": attendance, salary, advance or anything else. Free note for the admin. */
function reportProblem(token, about, when, note) {
  var p = staff_(token);
  if (REQUEST_ABOUT.indexOf(about) < 0) throw new Error('E_GENERIC');
  note = String(note || '').trim();
  if (!note) throw new Error('E_FIELD:note:err.required');
  return withLock_(function () {
    var id = nextId_(TABS.REQUESTS, 'Request ID', 'R');
    appendRow_(TABS.REQUESTS, {
      'Request ID': id, 'Date': new Date(), 'Person ID': p['ID'], 'Person': p['Full name'], 'About': about,
      'Field': String(when || '').slice(0, 40), 'Note': note.slice(0, 1000), 'Status': 'Open'
    });
    return { ok: true, id: id };
  });
}

/**
 * Team leads ask to add or remove a member. The admin approves it in the review queue, which
 * then writes the Team members tab.
 */
function requestTeamChange(token, action, member, note) {
  var p = staff_(token);
  if (p['Type'] !== 'Team lead') throw new Error('E_GENERIC');
  member = member || {};
  var asked;
  if (action === 'add') {
    var name = String(member.name || '').trim();
    if (!name) throw new Error('E_FIELD:team.name:err.required');
    var mob = cleanMobile_(member.mobile);
    if (mob && !isMobile_(mob)) throw new Error('E_FIELD:Mobile:err.mobile');
    asked = JSON.stringify({ action: 'add', name: name.slice(0, 100), mobile: mob, skill: String(member.skill || '').slice(0, 100) });
  } else if (action === 'remove') {
    var m = findBy_(TABS.TEAM, 'Member ID', member.id);
    if (!m || String(m['Team lead ID']) !== String(p['ID'])) throw new Error('E_GENERIC');
    asked = JSON.stringify({ action: 'remove', id: String(m['Member ID']), name: String(m['Member name']) });
  } else {
    throw new Error('E_GENERIC');
  }
  return withLock_(function () {
    var id = nextId_(TABS.REQUESTS, 'Request ID', 'R');
    appendRow_(TABS.REQUESTS, {
      'Request ID': id, 'Date': new Date(), 'Person ID': p['ID'], 'Person': p['Full name'], 'About': 'My team',
      'Field': action === 'add' ? 'Add member' : 'Remove member', 'Asked value': asked,
      'Note': String(note || '').slice(0, 1000), 'Status': 'Open'
    });
    return { ok: true, id: id };
  });
}

/* ---------------------------------------------------------- joining */

var JOIN_FIELDS = [
  'Full name', 'Display name', 'DOB', 'Email', 'Mobile 1', 'Mobile 2', 'Mobile 3', 'Emergency mobile',
  'Emergency contact name', 'Emergency relation', 'Address', 'Joining date', 'Aadhaar', 'PAN',
  'Bank account', 'IFSC', 'Account holder', 'Language'
];

/**
 * A new person fills the joining form, from a joining link (joinCode) or with an admin
 * (adminToken). The record lands as Pending review.
 */
function submitJoin(joinCode, adminToken, form, photos) {
  var adminRow = null, lead = null;
  if (adminToken) adminRow = admin_(adminToken);
  else if (!joinCodeValid_(joinCode)) throw new Error('E_BADJOIN');
  else lead = joinLead_(joinCode);
  form = form || {};
  photos = photos || {};
  // A team lead's invite link always makes a Team member; other links never do.
  var type = lead ? 'Team member' : (form['Type'] === 'Team lead' ? 'Team lead' : 'Employee');
  var fields = lead ? JOIN_FIELDS.filter(function (f) { return BANK_FIELDS.indexOf(f) < 0; }).concat(['Designation']) : JOIN_FIELDS;
  var clean = {};
  fields.forEach(function (f) {
    if (f === 'Language') { clean[f] = LANGS.indexOf(form[f]) >= 0 ? form[f] : 'hi'; return; }
    clean[f] = cleanField_(f, form[f]);
  });
  if (!clean['Aadhaar']) throw new Error('E_FIELD:Aadhaar:err.required');
  if (!clean['Emergency contact name']) throw new Error('E_FIELD:Emergency contact name:err.required');
  var em = clean['Emergency mobile'];
  if (!clean['Mobile ' + em]) throw new Error('E_FIELD:Emergency mobile:err.required');
  if (!form.consent) throw new Error('E_FIELD:consent:err.consent');
  checkPinFormat_(form.pin);
  if (!clean['Display name']) clean['Display name'] = clean['Full name'];

  return withLock_(function () {
    if (mobileTaken_(clean['Mobile 1'])) throw new Error('E_FIELD:Mobile 1:err.mobileTaken');
    var id = nextId_(TABS.PEOPLE, 'ID', type === 'Team lead' ? 'T' : type === 'Team member' ? 'W' : 'E');
    var status = lead ? 'Team lead review' : 'Pending review';
    var row = {
      'ID': id, 'Type': type, 'Status': status, 'PIN hash': hashPin_(form.pin), 'Must change PIN': 'no',
      'Supervisor': 'no', 'Self check-in': 'no', 'Consent date': new Date(), 'Created at': new Date(), 'Updated at': new Date(),
      'Notes': adminRow ? 'Added by ' + adminRow['Gmail'] : lead ? 'Invite link from ' + leadName_(lead) : 'Joining link',
      'Team lead ID': lead ? lead['ID'] : ''
    };
    Object.keys(clean).forEach(function (f) {
      row[f] = DATE_FIELDS.indexOf(f) >= 0 ? (clean[f] ? parseDate_(clean[f]) : '') : clean[f];
    });
    PHOTO_FIELDS.forEach(function (f) { if (photos[f]) row[f] = savePhoto_(id, f, photos[f]); });
    appendRow_(TABS.PEOPLE, row);
    audit_(adminRow ? adminRow['Gmail'] : clean['Full name'], TABS.PEOPLE, id, { 'Status': ['', status] },
      adminRow ? 'app (admin)' : lead ? 'team invite link' : 'joining link');
    if (lead) return { ok: true, id: id, team: leadName_(lead) };
    alertAdmins_('New joiner: ' + clean['Full name'], clean['Full name'] + ' (' + type + ', mobile ' + clean['Mobile 1'] + ') filled the joining form. Review it in the app or on the People tab.');
    return { ok: true, id: id };
  });
}

/* ------------------------------------------------- team lead's invites */

/** A 7-day invite link a team lead shares with their own team. People who use it join that team. */
function teamInviteLink(token) {
  var p = staff_(token);
  if (p['Type'] !== 'Team lead') throw new Error('E_GENERIC');
  var url = appUrl_();
  if (!url) throw new Error('E_GENERIC');
  return { link: url + '?join=' + makeJoinCode_(7, p['ID']), days: 7 };
}

/** Members who joined through this lead's link and are waiting for the lead, or now for an admin. */
function teamJoiners_(leadId) {
  return readTable_(TABS.PEOPLE).filter(function (r) {
    return r['Type'] === 'Team member' && String(r['Team lead ID']) === String(leadId) &&
      (r['Status'] === 'Team lead review' || r['Status'] === 'Pending review');
  }).map(function (r) {
    return { id: String(r['ID']), name: String(r['Full name']), mobile: String(r['Mobile 1']), skill: String(r['Designation']),
      status: String(r['Status']), created: fmtDate_(r['Created at']) };
  });
}

/** What a team lead sees of a member who wants to join: enough to recognise them, numbers masked. */
function teamJoiner(token, personId) {
  var lead = staff_(token);
  var r = findBy_(TABS.PEOPLE, 'ID', personId);
  if (!r || r['Type'] !== 'Team member' || String(r['Team lead ID']) !== String(lead['ID'])) throw new Error('E_GENERIC');
  var out = publicPerson_(r);
  out.status = String(r['Status']);
  return out;
}

/** The team lead confirms the person really works for them (then an admin checks), or turns them away. */
function teamDecideJoiner(token, personId, approve, reply) {
  var lead = staff_(token);
  if (lead['Type'] !== 'Team lead') throw new Error('E_GENERIC');
  reply = String(reply || '').trim();
  if (!approve && !reply) throw new Error('E_FIELD:reply:err.replyNeeded');
  return withLock_(function () {
    var r = findBy_(TABS.PEOPLE, 'ID', personId);
    if (!r || r['Type'] !== 'Team member' || String(r['Team lead ID']) !== String(lead['ID'])) throw new Error('E_GENERIC');
    if (r['Status'] !== 'Team lead review') throw new Error('E_ALREADY');
    var upd = { 'Status': approve ? 'Pending review' : 'Rejected', 'Updated at': new Date() };
    upd['Notes'] = (r['Notes'] ? r['Notes'] + '\n' : '') + (approve ? 'Confirmed by team lead ' : 'Turned away by team lead ') +
      leadName_(lead) + (reply ? ': ' + reply : '');
    var ch = updateRow_(TABS.PEOPLE, r._row, upd);
    audit_(lead['Full name'], TABS.PEOPLE, personId, ch, 'app (team lead)');
    if (approve) {
      alertAdmins_('New team member: ' + r['Full name'], r['Full name'] + ' (mobile ' + r['Mobile 1'] + ') joined ' +
        leadName_(lead) + "'s team and the team lead has confirmed them. Check the details and photos in the app or on the People tab.");
    }
    return { ok: true };
  });
}
