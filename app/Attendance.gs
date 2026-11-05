/**
 * Om Team Register: attendance (Phase 2).
 *
 * One row per employee per day on the Attendance tab, found by its Key (person ID|yyyy-MM-dd).
 * - Employees tap "I have arrived" / "Going home". That saves the time and, if the phone shares
 *   it, the location. Unless self check-in is switched on for them, the day stays unconfirmed
 *   until a supervisor or admin marks it.
 * - Supervisors (People > Supervisor = yes) and admins mark everyone: P, A, H (half day),
 *   L (leave), plus OT as a half or full extra day. Sundays are WO and holidays HOL by default.
 * - Team leads may record their own team's attendance on Team attendance. It is never used for pay.
 */

function todayStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowTime_() { return Utilities.formatDate(new Date(), TZ, 'HH:mm'); }
function attKey_(personId, dateStr) { return String(personId) + '|' + dateStr; }

function dateStrOf_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '');
}

function checkDateStr_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) throw new Error('E_DATE');
  parseDate_(s);
  return s;
}

function daysBetween_(a, b) {
  return Math.round((parseDate_(b).getTime() - parseDate_(a).getTime()) / 86400000);
}

function isSunday_(dateStr) { return parseDate_(dateStr).getDay() === 0; }

function holidaysMap_() {
  var m = {};
  readTable_(TABS.HOLIDAYS).forEach(function (h) { if (h['Date']) m[dateStrOf_(h['Date'])] = String(h['Holiday'] || ''); });
  return m;
}

/** The default status for a day nobody has marked yet. */
function defaultStatus_(dateStr, holidays) {
  if (holidays[dateStr] !== undefined) return 'HOL';
  if (isSunday_(dateStr)) return 'WO';
  return 'P';
}

/** Attendance rows keyed by Key; optional filter on a date range (inclusive, yyyy-MM-dd). */
function attIndex_(from, to) {
  var idx = {};
  readTable_(TABS.ATT).forEach(function (r) {
    var d = dateStrOf_(r['Date']);
    if (from && d < from) return;
    if (to && d > to) return;
    idx[attKey_(r['Person ID'], d)] = r;
  });
  return idx;
}

function teamAttIndex_(from, to) {
  var idx = {};
  readTable_(TABS.TEAM_ATT).forEach(function (r) {
    var d = dateStrOf_(r['Date']);
    if (d >= from && d <= to) idx[attKey_(r['Member ID'], d)] = r;
  });
  return idx;
}

function attOut_(r) {
  if (!r) return null;
  return {
    status: String(r['Status']), ot: String(r['OT']), inTime: timeStr_(r['In time']), outTime: timeStr_(r['Out time']),
    source: String(r['Source']), confirmed: String(r['Confirmed']).toLowerCase() === 'yes'
  };
}

/** Writes one person's day, creating the row if needed. Returns {field: [old, new]}. */
function upsertAtt_(person, dateStr, fields, who, via) {
  var key = attKey_(person['ID'], dateStr);
  var row = findBy_(TABS.ATT, 'Key', key);
  fields['Updated at'] = new Date();
  if (row) {
    var ch = updateRow_(TABS.ATT, row._row, fields);
    delete ch['Updated at'];
    audit_(who, TABS.ATT, key, ch, via);
    return ch;
  }
  var obj = { 'Date': parseDate_(dateStr), 'Person ID': person['ID'], 'Name': person['Full name'], 'Key': key };
  Object.keys(fields).forEach(function (k) { obj[k] = fields[k]; });
  appendRow_(TABS.ATT, obj);
  var made = {};
  ['Status', 'OT', 'In time', 'Out time'].forEach(function (k) { if (obj[k]) made[k] = ['', obj[k]]; });
  audit_(who, TABS.ATT, key, made, via);
  return made;
}

function cleanLoc_(loc) {
  if (!loc || typeof loc !== 'object') return '';
  var lat = Number(loc.lat), lng = Number(loc.lng), acc = Math.round(Number(loc.acc) || 0);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return '';
  return lat.toFixed(5) + ',' + lng.toFixed(5) + (acc ? ' ±' + acc + 'm' : '');
}

/* ------------------------------------------------- employee check-in */

/** kind = 'in' or 'out'. loc = {lat, lng, acc} or null. 'in' keeps the first time of the day. */
function checkIn(token, kind, loc) {
  var p = staff_(token);
  if (kind !== 'in' && kind !== 'out') throw new Error('E_GENERIC');
  if (p['Type'] === 'Team member') return memberCheckIn_(p, kind, loc);
  if (p['Type'] !== 'Employee') throw new Error('E_GENERIC');
  var day = todayStr_();
  return withLock_(function () {
    var cur = findBy_(TABS.ATT, 'Key', attKey_(p['ID'], day));
    var selfOk = String(p['Self check-in']).toLowerCase() === 'yes';
    var f = {};
    if (kind === 'in') {
      if (cur && cur['In time']) return { today: attOut_(cur) };
      f['In time'] = nowTime_();
      f['In location'] = cleanLoc_(loc);
      if (!cur || !cur['Status']) {
        f['Status'] = 'P';
        f['Source'] = 'Self';
        f['Marked by'] = p['Full name'];
        f['Confirmed'] = selfOk ? 'yes' : 'no';
      }
    } else {
      f['Out time'] = nowTime_();
      f['Out location'] = cleanLoc_(loc);
      if (!cur || !cur['Status']) {
        f['Status'] = 'P'; f['Source'] = 'Self'; f['Marked by'] = p['Full name']; f['Confirmed'] = selfOk ? 'yes' : 'no';
      }
    }
    upsertAtt_(p, day, f, p['Full name'], 'check-' + kind);
    return { today: attOut_(findBy_(TABS.ATT, 'Key', attKey_(p['ID'], day))) };
  });
}

/* --------------------------------------------- team member check-in */

function teamAttOut_(r) {
  if (!r) return null;
  return { status: String(r['Status']), ot: '', inTime: timeStr_(r['In time']), outTime: timeStr_(r['Out time']),
    source: String(r['Source'] || ''), confirmed: true };
}

function teamAttOn_(memberId, dateStr) { return teamAttOut_(findBy_(TABS.TEAM_ATT, 'Key', attKey_(memberId, dateStr))); }

/**
 * A team member checks in or out. It goes on Team attendance as Present (for records only,
 * never pay); the team lead can change the status afterwards.
 */
function memberCheckIn_(p, kind, loc) {
  var day = todayStr_();
  var key = attKey_(p['ID'], day);
  return withLock_(function () {
    var cur = findBy_(TABS.TEAM_ATT, 'Key', key);
    if (kind === 'in' && cur && cur['In time']) return { today: teamAttOut_(cur) };
    var f = kind === 'in' ? { 'In time': nowTime_(), 'In location': cleanLoc_(loc) } : { 'Out time': nowTime_(), 'Out location': cleanLoc_(loc) };
    if (!cur || !cur['Status']) { f['Status'] = 'P'; f['Source'] = 'Self'; f['Marked at'] = new Date(); }
    if (cur) {
      updateRow_(TABS.TEAM_ATT, cur._row, f);
    } else {
      var lead = findBy_(TABS.PEOPLE, 'ID', p['Team lead ID']);
      f['Date'] = parseDate_(day); f['Team lead ID'] = p['Team lead ID']; f['Team lead'] = leadName_(lead);
      f['Member ID'] = p['ID']; f['Member name'] = p['Display name'] || p['Full name']; f['Key'] = key;
      appendRow_(TABS.TEAM_ATT, f);
    }
    audit_(p['Full name'], TABS.TEAM_ATT, key, { 'Check': ['', kind + ' ' + (f['In time'] || f['Out time'])] }, 'check-' + kind);
    return { today: teamAttOn_(p['ID'], day) };
  });
}

/** One month for the signed-in employee: a day list and totals. month = 'yyyy-MM'. */
function myMonth(token, month) {
  var p = staff_(token);
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) month = todayStr_().slice(0, 7);
  return monthFor_(p, month);
}

function monthFor_(p, month) {
  var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  var days = new Date(y, m, 0).getDate();
  var from = month + '-01', to = month + '-' + ('0' + days).slice(-2);
  var team = p['Type'] === 'Team member';
  var idx = team ? teamAttIndex_(from, to) : attIndex_(from, to);
  var hol = holidaysMap_();
  var today = todayStr_();
  var joined = p['Joining date'] ? dateStrOf_(p['Joining date']) : '';
  var totals = { P: 0, A: 0, H: 0, L: 0, WO: 0, HOL: 0, ot: 0, unmarked: 0 };
  var list = [];
  for (var d = 1; d <= days; d++) {
    var ds = month + '-' + ('0' + d).slice(-2);
    var r = (team ? teamAttOut_ : attOut_)(idx[attKey_(p['ID'], ds)]);
    var item = { date: ds, day: d, weekday: parseDate_(ds).getDay(), holiday: hol[ds] || '' };
    if (r) {
      item.status = r.status; item.ot = r.ot; item.inTime = r.inTime; item.outTime = r.outTime; item.confirmed = r.confirmed;
    } else if (ds <= today && (!joined || ds >= joined)) {
      var def = defaultStatus_(ds, hol);
      item.status = def === 'P' ? '' : def;
    }
    if (item.status && totals[item.status] !== undefined) totals[item.status]++;
    else if (ds <= today && (!joined || ds >= joined)) totals.unmarked++;
    if (item.ot) totals.ot += Number(item.ot) || 0;
    list.push(item);
  }
  return { month: month, days: list, totals: totals };
}

/* ---------------------------------------------------- supervisor marking */

/** Who is marking: a supervisor (staff token) or an admin. */
function marker_(token) {
  var p = unsign_(token);
  if (p && p.k === 'a') { var a = admin_(token); return { name: String(a['Gmail']), admin: true }; }
  var s = staff_(token);
  if (String(s['Supervisor']).toLowerCase() !== 'yes') throw new Error('E_GENERIC');
  return { name: String(s['Full name']), admin: false, person: s };
}

function checkMarkDate_(m, dateStr) {
  checkDateStr_(dateStr);
  var back = daysBetween_(dateStr, todayStr_());
  if (back < 0) throw new Error('E_DATERANGE');
  if (!m.admin && back > (Number(setting_('markDaysBack')) || 7)) throw new Error('E_DATERANGE');
}

function activeEmployees_(dateStr) {
  return readTable_(TABS.PEOPLE).filter(function (p) {
    if (p['Type'] !== 'Employee') return false;
    if (p['Status'] === 'Active') return !p['Joining date'] || dateStrOf_(p['Joining date']) <= dateStr;
    // People who left are listed for days before they left.
    return p['Status'] === 'Left' && p['Exit date'] && dateStrOf_(p['Exit date']) >= dateStr;
  }).sort(function (a, b) { return String(a['Full name']).localeCompare(String(b['Full name'])); });
}

function markList(token, dateStr) {
  var m = marker_(token);
  dateStr = dateStr || todayStr_();
  checkMarkDate_(m, dateStr);
  var hol = holidaysMap_();
  var idx = attIndex_(dateStr, dateStr);
  var def = defaultStatus_(dateStr, hol);
  return {
    date: dateStr, holiday: hol[dateStr] || '', sunday: isSunday_(dateStr), today: todayStr_(),
    daysBack: m.admin ? 3650 : (Number(setting_('markDaysBack')) || 7),
    people: activeEmployees_(dateStr).map(function (p) {
      var r = attOut_(idx[attKey_(p['ID'], dateStr)]);
      return {
        id: String(p['ID']), name: String(p['Full name']), designation: String(p['Designation'] || ''),
        status: r && r.status ? r.status : def, ot: r ? r.ot : '', inTime: r ? r.inTime : '', outTime: r ? r.outTime : '',
        marked: !!(r && r.confirmed), selfOnly: !!(r && !r.confirmed)
      };
    })
  };
}

/** marks = [{id, status, ot}] for one date. Everyone saved is confirmed. */
function saveMarks(token, dateStr, marks) {
  var m = marker_(token);
  checkMarkDate_(m, dateStr);
  var allowed = {};
  activeEmployees_(dateStr).forEach(function (p) { allowed[String(p['ID'])] = p; });
  return withLock_(function () {
    var n = 0;
    (marks || []).forEach(function (x) {
      var p = allowed[String(x.id)];
      if (!p) return;
      if (ATT_STATUS.indexOf(x.status) < 0) throw new Error('E_GENERIC');
      var ot = OT_VALUES.indexOf(String(x.ot || '')) >= 0 ? String(x.ot || '') : '';
      upsertAtt_(p, dateStr, {
        'Status': x.status, 'OT': ot, 'Source': m.admin ? 'Admin' : 'Supervisor', 'Marked by': m.name, 'Confirmed': 'yes'
      }, m.name, m.admin ? 'app (admin)' : 'app (supervisor)');
      n++;
    });
    return { saved: n };
  });
}

/* ------------------------------------------------- team lead's team */

function teamMarkList(token, dateStr) {
  var p = staff_(token);
  if (p['Type'] !== 'Team lead') throw new Error('E_GENERIC');
  dateStr = dateStr || todayStr_();
  checkDateStr_(dateStr);
  if (daysBetween_(dateStr, todayStr_()) < 0) throw new Error('E_DATERANGE');
  var have = {};
  readTable_(TABS.TEAM_ATT).forEach(function (r) { if (dateStrOf_(r['Date']) === dateStr) have[String(r['Member ID'])] = r; });
  return {
    date: dateStr, today: todayStr_(),
    members: teamOf_(p['ID']).map(function (mb) {
      var r = have[mb.id];
      return { id: mb.id, name: mb.name, skill: mb.skill, status: r ? String(r['Status']) : '',
        inTime: r ? timeStr_(r['In time']) : '', outTime: r ? timeStr_(r['Out time']) : '' };
    })
  };
}

function saveTeamMarks(token, dateStr, marks) {
  var p = staff_(token);
  if (p['Type'] !== 'Team lead') throw new Error('E_GENERIC');
  checkDateStr_(dateStr);
  if (daysBetween_(dateStr, todayStr_()) < 0) throw new Error('E_DATERANGE');
  var mine = {};
  teamOf_(p['ID']).forEach(function (mb) { mine[mb.id] = mb; });
  return withLock_(function () {
    var n = 0;
    (marks || []).forEach(function (x) {
      var mb = mine[String(x.id)];
      if (!mb || TEAM_ATT_STATUS.indexOf(x.status) < 0) return;
      var key = attKey_(mb.id, dateStr);
      var row = findBy_(TABS.TEAM_ATT, 'Key', key);
      if (row) {
        if (String(row['Status']) !== x.status) updateRow_(TABS.TEAM_ATT, row._row, { 'Status': x.status, 'Marked at': new Date(), 'Source': 'Team lead' });
      } else appendRow_(TABS.TEAM_ATT, {
        'Date': parseDate_(dateStr), 'Team lead ID': p['ID'], 'Team lead': p['Display name'] || p['Full name'],
        'Member ID': mb.id, 'Member name': mb.name, 'Status': x.status, 'Marked at': new Date(), 'Key': key, 'Source': 'Team lead'
      });
      n++;
    });
    return { saved: n };
  });
}

/* ------------------------------------------------- admin: fix a day */

/** Used from the review queue: set one person's day, optionally closing the request. */
function adminSetAttendance(token, personId, dateStr, status, ot, requestId, reply) {
  var a = admin_(token);
  checkDateStr_(dateStr);
  if (ATT_STATUS.indexOf(status) < 0) throw new Error('E_GENERIC');
  var p = findBy_(TABS.PEOPLE, 'ID', personId);
  if (!p || p['Type'] !== 'Employee') throw new Error('E_GENERIC');
  withLock_(function () {
    upsertAtt_(p, dateStr, {
      'Status': status, 'OT': OT_VALUES.indexOf(String(ot || '')) >= 0 ? String(ot || '') : '',
      'Source': 'Admin', 'Marked by': String(a['Gmail']), 'Confirmed': 'yes'
    }, String(a['Gmail']), requestId ? 'request ' + requestId : 'app (admin)');
  });
  if (requestId) adminDecide(token, requestId, true, reply || '');
  return { ok: true };
}

function attendanceOn_(personId, dateStr) {
  return attOut_(findBy_(TABS.ATT, 'Key', attKey_(personId, dateStr)));
}

/* ---------------------------------------------- Attendance month view */

function refreshMonthView() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Attendance month', 'Which month? Type like 2026-11. Leave empty for this month.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var t = res.getResponseText().trim();
  var d = new Date();
  if (t) {
    if (!/^\d{4}-\d{2}$/.test(t)) { ui.alert('Type the month like 2026-11.'); return; }
    d = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, 1);
  }
  refreshMonthView_(d);
}

/**
 * Rebuilds the "Attendance month" tab: one row per employee, one column per day, live formulas
 * that read the Attendance tab, totals at the right. Edit attendance on the Attendance tab or in
 * the app, not here.
 */
function refreshMonthView_(anyDay) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(TABS.MONTH) || ss.insertSheet(TABS.MONTH);
  var att = ss.getSheetByName(TABS.ATT);
  var h = headers_(att);
  var col = function (name) { return colLetterOf_(h.indexOf(name) + 1); };
  var y = anyDay.getFullYear(), m = anyDay.getMonth();
  var days = new Date(y, m + 1, 0).getDate();
  var month = Utilities.formatDate(new Date(y, m, 1), TZ, 'yyyy-MM');
  var people = readTable_(TABS.PEOPLE).filter(function (p) { return p['Type'] === 'Employee' && p['Status'] !== 'Rejected' && p['Status'] !== 'Pending review'; })
    .sort(function (a, b) { return String(a['Full name']).localeCompare(String(b['Full name'])); });
  if (typeof sh.clear === 'function') sh.clear();
  var head = ['ID', 'Name'];
  for (var d = 1; d <= days; d++) head.push(String(d));
  head = head.concat(['P', 'H', 'A', 'L', 'OT days']);
  var rows = [['Month', month, 'Read-only view. Refresh: Om Team > Refresh attendance month. Edit on the Attendance tab or in the app.']];
  rows[0] = rows[0].concat(new Array(head.length - 3).fill(''));
  var out = [head];
  var statusCol = col('Status'), keyCol = col('Key'), otCol = col('OT');
  people.forEach(function (p, i) {
    var r = i + 3;
    var line = [p['ID'], p['Full name']];
    for (var d = 1; d <= days; d++) {
      var ds = month + '-' + ('0' + d).slice(-2);
      line.push('=IFERROR(INDEX(\'' + TABS.ATT + '\'!$' + statusCol + ':$' + statusCol + ',MATCH($A' + r + '&"|' + ds + '",\'' +
        TABS.ATT + '\'!$' + keyCol + ':$' + keyCol + ',0)),"")');
    }
    var first = colLetterOf_(3), last = colLetterOf_(2 + days);
    var range = first + r + ':' + last + r;
    line.push('=COUNTIF(' + range + ',"P")', '=COUNTIF(' + range + ',"H")', '=COUNTIF(' + range + ',"A")', '=COUNTIF(' + range + ',"L")');
    var lastDay = month + '-' + ('0' + days).slice(-2);
    line.push('=SUMIFS(\'' + TABS.ATT + '\'!$' + otCol + ':$' + otCol + ',\'' + TABS.ATT + '\'!$' + col('Person ID') + ':$' + col('Person ID') +
      ',$A' + r + ',\'' + TABS.ATT + '\'!$' + col('Date') + ':$' + col('Date') + ',">="&DATEVALUE("' + month + '-01"),\'' +
      TABS.ATT + '\'!$' + col('Date') + ':$' + col('Date') + ',"<="&DATEVALUE("' + lastDay + '"))');
    out.push(line);
  });
  sh.getRange(1, 1, 1, head.length).setValues(rows);
  sh.getRange(2, 1, out.length, head.length).setValues(out);
  sh.getRange(2, 1, 1, head.length).setFontWeight('bold').setBackground('#f0efec');
  sh.setFrozenRows(2);
  if (typeof sh.setFrozenColumns === 'function') sh.setFrozenColumns(2);
  if (people.length && typeof sh.setConditionalFormatRules === 'function') {
    var grid = sh.getRange(3, 3, people.length, days);
    sh.setConditionalFormatRules(Object.keys(ATT_COLOURS).map(function (k) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(ATT_COLOURS[k]).setRanges([grid]).build();
    }));
  }
}

function colLetterOf_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
