/**
 * Om Team Register: money (Phase 3).
 *
 * Pay setup     one row per person per change; the latest "Effective from" on or before the month end wins.
 * Advances & incentives   Advance (recovered in instalments), Incentive / Bonus (added), Other deduction.
 * Salary        one row per employee per month, made by "Run salary", checked, then locked.
 * Team lead ledger        money paid to / received from a team lead, with work done and pending notes.
 *
 * Pay rules (agreed in the plan):
 *   Monthly:  monthly salary ÷ days in the month × payable days. Payable = present + ½ × half days
 *             + Sundays + holidays (while employed). Leave is unpaid. Unmarked working days are unpaid.
 *   Daily:    daily rate × (present + ½ × half days). Sundays and holidays are not paid unless worked.
 *   OT:       OT days (0.5 or 1 each) × daily rate (monthly staff: monthly salary ÷ days in month).
 *   PF:       12% of earned basic, basic capped at ₹15,000.      Only if PF = yes.
 *   ESI:      0.75% of gross, rounded up, when gross ≤ ₹21,000.  Only if ESI = yes.
 *   Advance:  the instalments set on open advances, never more than what is owed or the net pay.
 * The rates and limits live in Settings & words.
 */

var MONEY_TYPES = ['Advance', 'Incentive', 'Bonus', 'Other deduction'];
var PAY_TYPES = ['Monthly', 'Daily'];
var PAY_MODES = ['Cash', 'Bank', 'UPI'];

function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function rupees_(n) { return Math.round(num_(n)); }

function moneySettings_() {
  return {
    pfRate: num_(setting_('pfRate')) || 12, pfCap: num_(setting_('pfWageCap')) || 15000,
    esiRate: num_(setting_('esiRate')) || 0.75, esiLimit: num_(setting_('esiLimit')) || 21000
  };
}

function monthBounds_(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('E_DATE');
  var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  var days = new Date(y, m, 0).getDate();
  return { from: month + '-01', to: month + '-' + ('0' + days).slice(-2), days: days };
}

/** The pay setup that applies to a person for a month, or null. */
function paySetupFor_(personId, monthEnd, rows) {
  rows = rows || readTable_(TABS.PAY);
  var best = null;
  rows.forEach(function (r) {
    if (String(r['Person ID']) !== String(personId)) return;
    var eff = r['Effective from'] ? dateStrOf_(r['Effective from']) : '0000-00-00';
    if (eff > monthEnd) return;
    if (!best || eff >= best.eff) best = { eff: eff, row: r };
  });
  if (!best) return null;
  var r = best.row;
  var type = PAY_TYPES.indexOf(String(r['Pay type'])) >= 0 ? String(r['Pay type']) : 'Monthly';
  return {
    type: type, rate: num_(type === 'Monthly' ? r['Monthly salary'] : r['Daily rate']),
    pf: String(r['PF']).toLowerCase() === 'yes', esi: String(r['ESI']).toLowerCase() === 'yes',
    uan: String(r['UAN'] || ''), esiNo: String(r['ESI number'] || '')
  };
}

/** Day counts for a person in a month, honouring joining and exit dates. */
function dayCounts_(p, b, idx, hol, upTo) {
  var joined = p['Joining date'] ? dateStrOf_(p['Joining date']) : '';
  var left = p['Exit date'] ? dateStrOf_(p['Exit date']) : '';
  var c = { P: 0, H: 0, A: 0, L: 0, off: 0, unmarked: 0, ot: 0, employedDays: 0 };
  for (var d = 1; d <= b.days; d++) {
    var ds = b.from.slice(0, 8) + ('0' + d).slice(-2);
    if (joined && ds < joined) continue;
    if (left && ds > left) continue;
    if (upTo && ds > upTo) continue;
    c.employedDays++;
    var r = idx[attKey_(p['ID'], ds)];
    var st = r && r['Status'] ? String(r['Status']) : defaultStatus_(ds, hol);
    if (!r || !r['Status']) { if (st === 'P') { c.unmarked++; continue; } }
    if (st === 'P') c.P++;
    else if (st === 'H') c.H++;
    else if (st === 'A') c.A++;
    else if (st === 'L') c.L++;
    else c.off++;
    if (r) c.ot += num_(r['OT']);
  }
  return c;
}

/** Works out pay from the inputs on a Salary row (also used to recalculate after sheet edits). */
function calcPay_(x, ms) {
  var dailyRate = x.payType === 'Monthly' ? x.rate / x.daysInMonth : x.rate;
  var basic = rupees_(dailyRate * x.payableDays);
  var otPay = rupees_(dailyRate * x.otDays);
  var gross = basic + otPay + rupees_(x.incentive);
  var pf = x.pf ? rupees_(Math.min(basic, ms.pfCap) * ms.pfRate / 100) : 0;
  var esi = x.esi && gross > 0 && gross <= ms.esiLimit ? Math.ceil(gross * ms.esiRate / 100) : 0;
  var beforeAdv = gross - pf - esi - rupees_(x.otherDeduction);
  var adv = Math.max(0, Math.min(rupees_(x.advanceRecovered), rupees_(x.advanceBefore), Math.max(0, beforeAdv)));
  return {
    dailyRate: Math.round(dailyRate * 100) / 100, basic: basic, otPay: otPay, gross: gross, pf: pf, esi: esi,
    advanceRecovered: adv, net: beforeAdv - adv, advanceLeft: rupees_(x.advanceBefore) - adv
  };
}

/** Advances owed by a person before a month, and the instalment due in it. */
function advanceState_(personId, month, entries, salaryRows) {
  var b = monthBounds_(month);
  var advances = entries.filter(function (e) {
    return String(e['Person ID']) === String(personId) && e['Type'] === 'Advance' && dateStrOf_(e['Date']) <= b.to;
  }).sort(function (a, c) { return dateStrOf_(a['Date']) < dateStrOf_(c['Date']) ? -1 : 1; });
  var recovered = 0;
  salaryRows.forEach(function (s) {
    if (String(s['Person ID']) === String(personId) && String(s['Locked']).toLowerCase() === 'yes' && String(s['Month']) < month) {
      recovered += num_(s['Advance recovered']);
    }
  });
  var owed = 0, due = 0, left = recovered;
  advances.forEach(function (a) {
    var amt = num_(a['Amount']);
    var paidOff = Math.min(amt, left); left -= paidOff;
    var remaining = amt - paidOff;
    owed += remaining;
    if (remaining > 0) due += Math.min(remaining, num_(a['Monthly recovery']) || remaining);
  });
  return { owed: rupees_(owed), due: rupees_(due) };
}

function sumEntries_(entries, personId, b, types) {
  return entries.filter(function (e) {
    var d = dateStrOf_(e['Date']);
    return String(e['Person ID']) === String(personId) && types.indexOf(String(e['Type'])) >= 0 && d >= b.from && d <= b.to;
  }).reduce(function (s, e) { return s + num_(e['Amount']); }, 0);
}

/** Everything needed to pay one employee for a month (not saved). */
function computeSalary_(p, month, ctx) {
  var b = monthBounds_(month);
  var setup = paySetupFor_(p['ID'], b.to, ctx.pay);
  var c = dayCounts_(p, b, ctx.idx, ctx.hol, ctx.upTo);
  var adv = advanceState_(p['ID'], month, ctx.entries, ctx.salary);
  var x = {
    payType: setup ? setup.type : 'Monthly', rate: setup ? setup.rate : 0, daysInMonth: b.days,
    payableDays: 0, otDays: c.ot, incentive: sumEntries_(ctx.entries, p['ID'], b, ['Incentive', 'Bonus']),
    otherDeduction: sumEntries_(ctx.entries, p['ID'], b, ['Other deduction']),
    advanceBefore: adv.owed, advanceRecovered: adv.due, pf: !!(setup && setup.pf), esi: !!(setup && setup.esi)
  };
  x.payableDays = x.payType === 'Monthly' ? c.P + c.H * 0.5 + c.off : c.P + c.H * 0.5;
  var warnings = [];
  if (!setup) warnings.push('No pay setup');
  if (c.unmarked) warnings.push(c.unmarked + ' day(s) not marked');
  return { inputs: x, counts: c, pay: calcPay_(x, ctx.ms), warnings: warnings };
}

function salaryCtx_(month) {
  var b = monthBounds_(month);
  return {
    pay: readTable_(TABS.PAY), idx: attIndex_(b.from, b.to), hol: holidaysMap_(),
    entries: readTable_(TABS.MONEY), salary: readTable_(TABS.SALARY), ms: moneySettings_()
  };
}

function salaryRowObj_(p, month, s, who) {
  var x = s.inputs, y = s.pay, c = s.counts;
  return {
    'Month': month, 'Person ID': p['ID'], 'Name': p['Full name'], 'Pay type': x.payType, 'Rate': x.rate,
    'Days in month': x.daysInMonth, 'Present': c.P, 'Half days': c.H, 'Leave': c.L, 'Absent': c.A,
    'Sundays & holidays': c.off, 'Not marked': c.unmarked, 'Payable days': x.payableDays, 'OT days': x.otDays,
    'Basic pay': y.basic, 'OT pay': y.otPay, 'Incentive': x.incentive, 'Gross': y.gross,
    'PF applies': x.pf ? 'yes' : 'no', 'PF': y.pf, 'ESI applies': x.esi ? 'yes' : 'no', 'ESI': y.esi,
    'Other deduction': x.otherDeduction, 'Advance before': x.advanceBefore, 'Advance recovered': y.advanceRecovered,
    'Net pay': y.net, 'Advance left': y.advanceLeft, 'Warnings': s.warnings.join('; '),
    'Locked': 'no', 'Run by': who, 'Run at': new Date(), 'Key': attKey_(p['ID'], month)
  };
}

/** Salary rows read back as numbers for the app. */
function salaryOut_(r) {
  var o = {};
  ['Month', 'Person ID', 'Name', 'Pay type', 'PF applies', 'ESI applies', 'Warnings', 'Locked', 'Mode', 'Payslip'].forEach(function (k) { o[k] = String(r[k] || ''); });
  ['Rate', 'Days in month', 'Present', 'Half days', 'Leave', 'Absent', 'Sundays & holidays', 'Not marked', 'Payable days',
    'OT days', 'Basic pay', 'OT pay', 'Incentive', 'Gross', 'PF', 'ESI', 'Other deduction', 'Advance before',
    'Advance recovered', 'Net pay', 'Advance left'].forEach(function (k) { o[k] = num_(r[k]); });
  o['Paid on'] = fmtDate_(r['Paid on']);
  o['Month'] = monthStr_(r['Month']);
  return o;
}

function monthStr_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM');
  return String(v || '');
}

/* ------------------------------------------------------- admin: salary */

function employeesInMonth_(b) {
  return readTable_(TABS.PEOPLE).filter(function (p) {
    if (p['Type'] !== 'Employee') return false;
    if (p['Status'] !== 'Active' && p['Status'] !== 'Left') return false;
    if (p['Joining date'] && dateStrOf_(p['Joining date']) > b.to) return false;
    if (p['Exit date'] && dateStrOf_(p['Exit date']) < b.from) return false;
    return true;
  }).sort(function (a, c) { return String(a['Full name']).localeCompare(String(c['Full name'])); });
}

/** Makes or remakes the month's unlocked salary rows. Locked rows are never touched. */
function adminRunSalary(token, month) {
  var a = admin_(token);
  var b = monthBounds_(month);
  return withLock_(function () {
    var ctx = salaryCtx_(month);
    var existing = {};
    ctx.salary.forEach(function (r) { if (monthStr_(r['Month']) === month) existing[String(r['Person ID'])] = r; });
    employeesInMonth_(b).forEach(function (p) {
      var cur = existing[String(p['ID'])];
      if (cur && String(cur['Locked']).toLowerCase() === 'yes') return;
      var obj = salaryRowObj_(p, month, computeSalary_(p, month, ctx), String(a['Gmail']));
      if (cur) { delete obj['Month']; updateRow_(TABS.SALARY, cur._row, obj); }
      else appendRow_(TABS.SALARY, obj);
    });
    audit_(String(a['Gmail']), TABS.SALARY, month, { 'Run': ['', 'salary run'] }, 'app (admin)');
    return adminSalary(token, month);
  });
}

/**
 * Recalculates unlocked rows from what is typed on them (Rate, Payable days, OT days, Incentive,
 * Other deduction, Advance recovered, PF / ESI applies), so admins can adjust in the sheet.
 */
function recalcMonth_(month) {
  var ms = moneySettings_();
  readTable_(TABS.SALARY).forEach(function (r) {
    if (monthStr_(r['Month']) !== month || String(r['Locked']).toLowerCase() === 'yes') return;
    var x = {
      payType: String(r['Pay type']) === 'Daily' ? 'Daily' : 'Monthly', rate: num_(r['Rate']), daysInMonth: num_(r['Days in month']) || 30,
      payableDays: num_(r['Payable days']), otDays: num_(r['OT days']), incentive: num_(r['Incentive']),
      otherDeduction: num_(r['Other deduction']), advanceBefore: num_(r['Advance before']), advanceRecovered: num_(r['Advance recovered']),
      pf: String(r['PF applies']).toLowerCase() === 'yes', esi: String(r['ESI applies']).toLowerCase() === 'yes'
    };
    var y = calcPay_(x, ms);
    updateRow_(TABS.SALARY, r._row, {
      'Basic pay': y.basic, 'OT pay': y.otPay, 'Gross': y.gross, 'PF': y.pf, 'ESI': y.esi,
      'Advance recovered': y.advanceRecovered, 'Net pay': y.net, 'Advance left': y.advanceLeft
    });
  });
}

function adminRecalcSalary(token, month) {
  admin_(token);
  monthBounds_(month);
  withLock_(function () { recalcMonth_(month); });
  return adminSalary(token, month);
}

function adminSalary(token, month) {
  admin_(token);
  monthBounds_(month);
  var rows = readTable_(TABS.SALARY).filter(function (r) { return monthStr_(r['Month']) === month; }).map(salaryOut_);
  var t = { gross: 0, net: 0, pf: 0, esi: 0, adv: 0 };
  rows.forEach(function (r) { t.gross += r['Gross']; t.net += r['Net pay']; t.pf += r['PF']; t.esi += r['ESI']; t.adv += r['Advance recovered']; });
  return {
    month: month, rows: rows, totals: t,
    locked: rows.length > 0 && rows.every(function (r) { return r['Locked'] === 'yes'; }),
    anyLocked: rows.some(function (r) { return r['Locked'] === 'yes'; })
  };
}

/** Recalculates, locks every row of the month and makes the payslip PDFs. */
function adminLockSalary(token, month) {
  var a = admin_(token);
  monthBounds_(month);
  withLock_(function () {
    recalcMonth_(month);
    readTable_(TABS.SALARY).forEach(function (r) {
      if (monthStr_(r['Month']) !== month || String(r['Locked']).toLowerCase() === 'yes') return;
      var url = '';
      try { url = makePayslipPdf_(salaryOut_(r)); } catch (e) { console.warn('payslip pdf failed: ' + e); }
      updateRow_(TABS.SALARY, r._row, { 'Locked': 'yes', 'Payslip': url });
    });
    audit_(String(a['Gmail']), TABS.SALARY, month, { 'Locked': ['no', 'yes'] }, 'app (admin)');
  });
  return adminSalary(token, month);
}

/** Records payment for every locked, unpaid row of the month (or just one person). */
function adminMarkPaid(token, month, paidOn, mode, personId) {
  var a = admin_(token);
  checkDateStr_(paidOn);
  if (PAY_MODES.indexOf(mode) < 0) throw new Error('E_GENERIC');
  withLock_(function () {
    readTable_(TABS.SALARY).forEach(function (r) {
      if (monthStr_(r['Month']) !== month || String(r['Locked']).toLowerCase() !== 'yes' || r['Paid on']) return;
      if (personId && String(r['Person ID']) !== String(personId)) return;
      var ch = updateRow_(TABS.SALARY, r._row, { 'Paid on': parseDate_(paidOn), 'Mode': mode });
      audit_(String(a['Gmail']), TABS.SALARY, String(r['Key']), ch, 'app (admin)');
    });
  });
  return adminSalary(token, month);
}

/* ------------------------------------------------ admin: money entries */

function adminAddMoney(token, entry) {
  var a = admin_(token);
  entry = entry || {};
  var p = findBy_(TABS.PEOPLE, 'ID', entry.personId);
  if (!p || p['Type'] !== 'Employee') throw new Error('E_GENERIC');
  if (MONEY_TYPES.indexOf(entry.type) < 0) throw new Error('E_GENERIC');
  var amount = rupees_(entry.amount);
  if (amount <= 0) throw new Error('E_FIELD:amount:err.amount');
  var rec = entry.type === 'Advance' ? rupees_(entry.recovery) : '';
  if (entry.type === 'Advance' && (rec <= 0 || rec > amount)) throw new Error('E_FIELD:recovery:err.recovery');
  var date = checkDateStr_(entry.date || todayStr_());
  return withLock_(function () {
    var id = nextId_(TABS.MONEY, 'Entry ID', 'MN');
    appendRow_(TABS.MONEY, {
      'Entry ID': id, 'Date': parseDate_(date), 'Person ID': p['ID'], 'Name': p['Full name'], 'Type': entry.type,
      'Amount': amount, 'Monthly recovery': rec, 'Note': String(entry.note || '').slice(0, 500),
      'Entered by': String(a['Gmail']), 'Entered at': new Date()
    });
    audit_(String(a['Gmail']), TABS.MONEY, id, { 'Amount': ['', String(amount)] }, 'app (admin)');
    return { ok: true, id: id };
  });
}

function adminAddLedger(token, entry) {
  var a = admin_(token);
  entry = entry || {};
  var p = findBy_(TABS.PEOPLE, 'ID', entry.leadId);
  if (!p || p['Type'] !== 'Team lead') throw new Error('E_GENERIC');
  var amount = rupees_(entry.amount);
  if (amount <= 0) throw new Error('E_FIELD:amount:err.amount');
  if (entry.direction !== 'paid' && entry.direction !== 'received') throw new Error('E_GENERIC');
  var date = checkDateStr_(entry.date || todayStr_());
  return withLock_(function () {
    var id = nextId_(TABS.LEDGER, 'Entry ID', 'TL');
    appendRow_(TABS.LEDGER, {
      'Entry ID': id, 'Date': parseDate_(date), 'Team lead ID': p['ID'], 'Team lead': p['Display name'] || p['Full name'],
      'Paid to them': entry.direction === 'paid' ? amount : '', 'Received from them': entry.direction === 'received' ? amount : '',
      'What for': String(entry.whatFor || '').slice(0, 300), 'Work done': String(entry.workDone || '').slice(0, 500),
      'Work pending': String(entry.workPending || '').slice(0, 500), 'Entered by': String(a['Gmail']), 'Entered at': new Date()
    });
    audit_(String(a['Gmail']), TABS.LEDGER, id, { 'Amount': ['', (entry.direction === 'paid' ? '-' : '+') + amount] }, 'app (admin)');
    return { ok: true, id: id };
  });
}

/** Lists for the admin money forms. */
function adminMoneyLists(token) {
  admin_(token);
  var people = readTable_(TABS.PEOPLE).filter(function (p) { return p['Status'] === 'Active'; });
  var entries = readTable_(TABS.MONEY), salary = readTable_(TABS.SALARY);
  var month = todayStr_().slice(0, 7);
  return {
    employees: people.filter(function (p) { return p['Type'] === 'Employee'; }).map(function (p) {
      return { id: String(p['ID']), name: String(p['Full name']), advance: advanceState_(p['ID'], month, entries, salary).owed };
    }),
    leads: people.filter(function (p) { return p['Type'] === 'Team lead'; }).map(function (p) {
      return { id: String(p['ID']), name: String(p['Display name'] || p['Full name']), balance: ledgerFor_(p['ID']).balance };
    }),
    recent: entries.slice(-10).reverse().map(function (e) {
      return { id: String(e['Entry ID']), date: fmtDate_(e['Date']), name: String(e['Name']), type: String(e['Type']), amount: num_(e['Amount']) };
    })
  };
}

/* ------------------------------------------------------ staff: my money */

function ledgerFor_(leadId) {
  var bal = 0;
  var rows = readTable_(TABS.LEDGER).filter(function (r) { return String(r['Team lead ID']) === String(leadId); })
    .sort(function (a, b) { return dateStrOf_(a['Date']) < dateStrOf_(b['Date']) ? -1 : dateStrOf_(a['Date']) > dateStrOf_(b['Date']) ? 1 : 0; })
    .map(function (r) {
      var paid = num_(r['Paid to them']), got = num_(r['Received from them']);
      bal += paid - got;
      return {
        id: String(r['Entry ID']), date: fmtDate_(r['Date']), paid: paid, received: got, whatFor: String(r['What for'] || ''),
        workDone: String(r['Work done'] || ''), workPending: String(r['Work pending'] || ''), balance: bal
      };
    });
  return { entries: rows.reverse(), balance: bal, totalPaid: rows.reduce(function (s, r) { return s + r.paid; }, 0) };
}

/**
 * Employees: this month so far (estimate from attendance), advance owed, this month's
 * incentives and locked payslips. Team leads: their ledger with work notes.
 */
function myMoney(token) {
  var p = staff_(token);
  if (p['Type'] === 'Team lead') return { lead: true, ledger: ledgerFor_(p['ID']) };
  var month = todayStr_().slice(0, 7);
  var ctx = salaryCtx_(month);
  ctx.upTo = todayStr_();
  var est = computeSalary_(p, month, ctx);
  var adv = advanceState_(p['ID'], month, ctx.entries, ctx.salary);
  var b = monthBounds_(month);
  return {
    lead: false, month: month,
    soFar: { payableDays: est.inputs.payableDays, otDays: est.inputs.otDays, gross: est.pay.gross, hasSetup: est.warnings.indexOf('No pay setup') < 0 },
    advanceOwed: adv.owed,
    extras: ctx.entries.filter(function (e) {
      var d = dateStrOf_(e['Date']);
      return String(e['Person ID']) === String(p['ID']) && d >= b.from && d <= b.to;
    }).map(function (e) { return { date: fmtDate_(e['Date']), type: String(e['Type']), amount: num_(e['Amount']), note: String(e['Note'] || '') }; }),
    payslips: ctx.salary.filter(function (r) {
      return String(r['Person ID']) === String(p['ID']) && String(r['Locked']).toLowerCase() === 'yes';
    }).map(function (r) { return { month: monthStr_(r['Month']), net: num_(r['Net pay']), paidOn: fmtDate_(r['Paid on']) }; })
      .sort(function (a, c) { return a.month < c.month ? 1 : -1; })
  };
}

/** One locked payslip for the signed-in employee (admins: any person). */
function getPayslip(token, month, personId) {
  var t = unsign_(token);
  var pid;
  if (t && t.k === 'a') { admin_(token); pid = personId; } else { pid = staff_(token)['ID']; }
  var r = findBy_(TABS.SALARY, 'Key', attKey_(pid, month));
  if (!r || String(r['Locked']).toLowerCase() !== 'yes') throw new Error('E_GENERIC');
  return payslipData_(salaryOut_(r));
}

function payslipData_(s) {
  var p = findBy_(TABS.PEOPLE, 'ID', s['Person ID']) || {};
  var setup = paySetupFor_(s['Person ID'], monthBounds_(s['Month']).to) || {};
  return {
    org: setting_('orgName'), month: s['Month'], id: s['Person ID'], name: s['Name'],
    designation: String(p['Designation'] || ''), department: String(p['Department'] || ''),
    bank: mask_(p['Bank account']), uan: setup.uan || '', esiNo: setup.esiNo || '', s: s
  };
}

/** A one-page bilingual payslip as HTML (used for the PDF and mirrored by the app screen). */
function payslipHtml_(d) {
  var s = d.s;
  var esc = function (v) { return String(v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var inr = function (n) { return '₹ ' + Number(n).toLocaleString('en-IN'); };
  var row = function (a, b, v) { return '<tr><td>' + a + ' <span style="color:#777">/ ' + b + '</span></td><td style="text-align:right">' + v + '</td></tr>'; };
  return '<html><head><meta charset="utf-8"><style>body{font:13px Arial,"Noto Sans Devanagari",sans-serif;color:#222;margin:28px}' +
    'h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:6px;border-bottom:1px solid #ddd}' +
    '.tot td{font-weight:bold;border-top:2px solid #222}</style></head><body>' +
    '<h1>' + esc(d.org) + '</h1><div>Payslip / वेतन पर्ची · ' + esc(d.month) + '</div>' +
    '<table>' + row('Name', 'नाम', esc(d.name) + ' (' + esc(d.id) + ')') +
    (d.designation ? row('Designation', 'पद', esc(d.designation)) : '') +
    (d.bank ? row('Bank account', 'बैंक खाता', esc(d.bank)) : '') +
    (d.uan ? row('UAN', 'UAN', esc(d.uan)) : '') + (d.esiNo ? row('ESI number', 'ESI नंबर', esc(d.esiNo)) : '') + '</table>' +
    '<table>' + row('Pay type', 'वेतन प्रकार', s['Pay type'] === 'Daily' ? 'Daily ' + inr(s['Rate']) : 'Monthly ' + inr(s['Rate'])) +
    row('Present', 'हाज़िर', s['Present']) + row('Half days', 'आधे दिन', s['Half days']) + row('Leave (unpaid)', 'छुट्टी (बिना वेतन)', s['Leave']) +
    row('Absent', 'गैरहाज़िर', s['Absent']) + row('Payable days', 'वेतन के दिन', s['Payable days']) + row('OT days', 'ओवरटाइम दिन', s['OT days']) + '</table>' +
    '<table>' + row('Basic pay', 'मूल वेतन', inr(s['Basic pay'])) + row('Overtime', 'ओवरटाइम', inr(s['OT pay'])) +
    row('Incentive / bonus', 'इंसेंटिव / बोनस', inr(s['Incentive'])) + '<tr class="tot"><td>Gross / कुल</td><td style="text-align:right">' + inr(s['Gross']) + '</td></tr>' +
    (s['PF'] ? row('PF', 'PF', '− ' + inr(s['PF'])) : '') + (s['ESI'] ? row('ESI', 'ESI', '− ' + inr(s['ESI'])) : '') +
    (s['Other deduction'] ? row('Other deduction', 'अन्य कटौती', '− ' + inr(s['Other deduction'])) : '') +
    (s['Advance recovered'] ? row('Advance recovered', 'एडवांस कटौती', '− ' + inr(s['Advance recovered'])) : '') +
    '<tr class="tot"><td>Net pay / हाथ में</td><td style="text-align:right">' + inr(s['Net pay']) + '</td></tr>' +
    (s['Advance left'] ? row('Advance still owed', 'बाकी एडवांस', inr(s['Advance left'])) : '') + '</table>' +
    (s['Paid on'] ? '<p>Paid on / भुगतान: ' + esc(s['Paid on']) + ' · ' + esc(s['Mode']) + '</p>' : '') +
    '</body></html>';
}

/** Saves a PDF payslip in the private Drive folder: Payslips/<month>/. Returns its URL (admins only). */
function makePayslipPdf_(s) {
  var root = docsFolder_();
  var it = root.getFoldersByName('Payslips');
  var ps = it.hasNext() ? it.next() : root.createFolder('Payslips');
  var mi = ps.getFoldersByName(s['Month']);
  var mf = mi.hasNext() ? mi.next() : ps.createFolder(s['Month']);
  var blob = Utilities.newBlob(payslipHtml_(payslipData_(s)), 'text/html', 'payslip.html').getAs('application/pdf')
    .setName('Payslip ' + s['Month'] + ' ' + s['Person ID'] + ' ' + s['Name'] + '.pdf');
  return mf.createFile(blob).getUrl();
}
