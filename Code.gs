/**
 * OT Approvals — Google Apps Script web app
 * Log: "Requests" tab. Employee list: "Employees" tab (edit it there to add / remove people).
 *
 * >>> EDIT THESE SETTINGS BEFORE DEPLOYING <<<
 */
const CONFIG = {
  // Secret code needed to CREATE or RESET an approver password. Keep it private. CHANGE IT.
  SETUP_CODE: 'PKG-OT-2026',
  // Approvers shown in the drop-down. Add an email to get an alert for each request sent to that approver.
  APPROVERS: [
    { name: 'Imran Aziz Salaria', email: '' },
    { name: 'Iftikhar Alam', email: '' },
  ],
  // Optional PIN supervisors enter to submit requests. Leave '' for no PIN.
  STAFF_PIN: '',
};

const SECTIONS = ['Flexo', 'Roto', 'Lamination', 'Extrusion', 'Slitting', 'Finishing', 'QA', 'WIP', 'Planning', 'Office', 'WCM'];
const REASONS = ['Reliever absent', 'Reliever on rest', 'Extra loading', 'Extra work required', 'Machine not manned', 'Training', 'WCM activity'];

const SHEET = 'Requests';
const EMP_SHEET = 'Employees';
const HEAD = ['Request ID', 'Submitted At', 'OT Date', 'Section', 'Emp No', 'Employee Name', 'Reason',
  'Est. Hrs', 'Actual Hrs', 'Delta', 'Comments', 'Approver', 'Status', 'Decided By', 'Approver Remark', 'Decided At'];
const C = {}; HEAD.forEach((h, i) => C[h] = i);
const TZ = 'Asia/Karachi';
const SESSION_DAYS = 30;

/* ---------------- sheet menu ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('OT App')
    .addItem('Reload employee list (all 535 from the code)', 'resetEmployees')
    .addToUi();
}
/** Replaces the Employees tab with the full built-in list. Run from the "OT App" menu in the sheet. */
function resetEmployees() {
  const ss = SpreadsheetApp.getActive();
  const old = ss.getSheetByName(EMP_SHEET);
  if (old) old.setName(EMP_SHEET + ' (old ' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmm') + ')');
  const n = employees_().length; // recreates the tab from SEED_EMPLOYEES
  try { SpreadsheetApp.getUi().alert('Employees tab reloaded: ' + n + ' employees.'); } catch (e) { }
  return n;
}

/* ---------------- web app entry ---------------- */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('OT Approvals')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------------- sheets ---------------- */
function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (sh && sh.getLastColumn() > 0) {
    const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    if (h.join('|') !== HEAD.join('|')) { sh.setName(SHEET + ' (old ' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmm') + ')'); sh = null; }
  }
  if (!sh) {
    sh = ss.insertSheet(SHEET, 0);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#0b6a86').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    ['Request ID', 'Submitted At', 'OT Date', 'Emp No', 'Decided At'].forEach(h => sh.getRange(1, C[h] + 1, sh.getMaxRows()).setNumberFormat('@'));
    sh.getRange(2, C['Est. Hrs'] + 1, sh.getMaxRows(), 3).setNumberFormat('0.0');
    sh.setColumnWidth(C['Comments'] + 1, 260);
  }
  return sh;
}
function empSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(EMP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(EMP_SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
    const rows = [['Employee Number', 'Name', 'Section']].concat(SEED_EMPLOYEES);
    sh.getRange(1, 1, rows.length, 3).setValues(rows);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#0b6a86').setFontColor('#ffffff');
    sh.setFrozenRows(1); sh.autoResizeColumns(1, 3);
  }
  return sh;
}
function employees_() {
  const sh = empSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 3).getDisplayValues()
    .map(r => [String(r[0]).trim(), String(r[1]).replace(/\s+/g, ' ').trim(), String(r[2]).trim()])
    .filter(r => r[0] && r[1]);
}
function rows_() {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, HEAD.length).getDisplayValues().map((r, i) => ({ r, row: i + 2 }));
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function num_(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function staff_(pin, token) {
  if (!CONFIG.STAFF_PIN) return;
  if (token && session_(token, true)) return;
  if (String(pin || '') !== String(CONFIG.STAFF_PIN)) throw new Error('Supervisor PIN is wrong.');
}
function approverNames_() { return CONFIG.APPROVERS.map(a => a.name); }

/* ---------------- approver passwords & sessions ---------------- */
const P = () => PropertiesService.getScriptProperties();
function hash_(salt, pw) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8));
}
function pwKey_(name) { return 'pw:' + name; }
function hasPassword_(name) { return !!P().getProperty(pwKey_(name)); }
function verify_(name, pw) {
  const v = P().getProperty(pwKey_(name));
  if (!v) return false;
  const [salt, h] = v.split(':');
  return hash_(salt, String(pw)) === h;
}
function setPw_(name, pw) {
  if (String(pw).length < 6) throw new Error('Password must be at least 6 characters.');
  const salt = Utilities.getUuid();
  P().setProperty(pwKey_(name), salt + ':' + hash_(salt, String(pw)));
  // sign out every phone of this approver
  const all = P().getProperties();
  Object.keys(all).forEach(k => { if (k.indexOf('ses:') === 0 && all[k].split('|')[0] === name) P().deleteProperty(k); });
}
function newSession_(name) {
  const t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  P().setProperty('ses:' + t, name + '|' + (Date.now() + SESSION_DAYS * 864e5));
  return t;
}
/** Returns the approver name for a session token, or throws. */
function session_(token, quiet) {
  const v = token && P().getProperty('ses:' + token);
  if (v) {
    const [name, exp] = v.split('|');
    if (Date.now() < +exp && approverNames_().indexOf(name) >= 0) return name;
    P().deleteProperty('ses:' + token);
  }
  if (quiet) return null;
  throw new Error('Approver login has expired. Log in again.');
}
function checkName_(name) { if (approverNames_().indexOf(name) < 0) throw new Error('Unknown approver.'); }

function approverStatus() { return CONFIG.APPROVERS.map(a => ({ name: a.name, hasPassword: hasPassword_(a.name) })); }
function login(name, pw) {
  checkName_(name);
  if (!hasPassword_(name)) throw new Error('No password yet. Choose “Create password”.');
  if (!verify_(name, pw)) { Utilities.sleep(800); throw new Error('Wrong password.'); }
  return { token: newSession_(name), name };
}
/** First-time creation, or reset if forgotten. Needs the setup code from CONFIG. */
function createPassword(name, setupCode, pw) {
  checkName_(name);
  if (String(setupCode) !== String(CONFIG.SETUP_CODE)) { Utilities.sleep(800); throw new Error('Setup code is wrong.'); }
  setPw_(name, pw);
  return { token: newSession_(name), name };
}
function changePassword(token, oldPw, newPw) {
  const name = session_(token);
  if (!verify_(name, oldPw)) { Utilities.sleep(800); throw new Error('Current password is wrong.'); }
  setPw_(name, newPw);
  return { token: newSession_(name), name };
}
function logout(token) { if (token) P().deleteProperty('ses:' + token); return true; }
function whoAmI(token) { return session_(token, true); }

/* ---------------- data API ---------------- */
function group_(list) {
  const map = {};
  list.forEach(({ r }) => {
    const id = r[C['Request ID']];
    if (!map[id]) map[id] = {
      id, submittedAt: r[C['Submitted At']], otDate: r[C['OT Date']], section: r[C['Section']],
      comments: r[C['Comments']], approver: r[C['Approver']], status: r[C['Status']] || 'pending',
      decidedBy: r[C['Decided By']], remark: r[C['Approver Remark']], decidedAt: r[C['Decided At']], employees: []
    };
    map[id].employees.push({
      empId: r[C['Emp No']], name: r[C['Employee Name']], reason: r[C['Reason']],
      est: num_(r[C['Est. Hrs']]), actual: r[C['Actual Hrs']] === '' ? null : num_(r[C['Actual Hrs']])
    });
  });
  return Object.keys(map).map(k => map[k]);
}

function getConfig() {
  return {
    sections: SECTIONS, reasons: REASONS, approvers: approverNames_(), staffPinRequired: !!CONFIG.STAFF_PIN,
    employees: employees_(), today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')
  };
}

function getRequests(from, to) {
  return group_(rows_().filter(({ r }) => {
    const d = r[C['OT Date']];
    return (d >= from && d <= to) || (r[C['Status']] || 'pending') === 'pending';
  }));
}

function submitRequest(p, pin) {
  staff_(pin);
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.otDate)) throw new Error('Pick the date of OT.');
  if (!p.section) p.section = (p.employees && p.employees[0] && p.employees[0].section) || '';
  if (approverNames_().indexOf(p.approver) < 0) throw new Error('Pick an approver.');
  if (!p.employees || !p.employees.length) throw new Error('Add at least one employee.');
  const emps = {}; employees_().forEach(e => emps[e[0]] = e[1]);
  const seen = {};
  p.employees.forEach((e, i) => {
    if (!emps[e.empId]) throw new Error('Employee ' + (i + 1) + ': pick a name from the list.');
    if (seen[e.empId]) throw new Error(emps[e.empId] + ' is listed twice.');
    seen[e.empId] = 1;
    e.name = emps[e.empId]; // name always comes from the Employees tab
    if (!(num_(e.est) > 0 && num_(e.est) <= 16)) throw new Error('Employee ' + (i + 1) + ': hours must be 0.5 to 16.');
    if (REASONS.indexOf(e.reason) < 0) throw new Error('Employee ' + (i + 1) + ': choose a reason.');
  });

  const id = 'R' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
  const at = now_();
  const values = p.employees.map(e => {
    const row = new Array(HEAD.length).fill('');
    row[C['Request ID']] = id; row[C['Submitted At']] = at; row[C['OT Date']] = p.otDate; row[C['Section']] = p.section;
    row[C['Emp No']] = e.empId; row[C['Employee Name']] = e.name; row[C['Reason']] = e.reason; row[C['Est. Hrs']] = num_(e.est);
    row[C['Comments']] = String(p.comments || '').trim(); row[C['Approver']] = p.approver; row[C['Status']] = 'pending';
    return row;
  });
  withLock_(() => { const sh = sheet_(); sh.getRange(sh.getLastRow() + 1, 1, values.length, HEAD.length).setValues(values); });

  const ap = CONFIG.APPROVERS.find(a => a.name === p.approver);
  if (ap && ap.email) {
    try {
      const hrs = p.employees.reduce((a, e) => a + num_(e.est), 0);
      MailApp.sendEmail(ap.email, `OT request: ${p.section}, ${p.otDate.split('-').reverse().join('.')} (${hrs} hrs)`,
        p.employees.map(e => `• ${e.empId} ${e.name} — ${e.est} hrs — ${e.reason}`).join('\n') +
        `\n\nComments: ${p.comments || '-'}\n\nOpen the app to approve: ${ScriptApp.getService().getUrl()}`);
    } catch (err) { /* request is saved even if email fails */ }
  }
  return id;
}

function decide(token, ids, status, remark) {
  const who = session_(token);
  if (['approved', 'rejected', 'pending'].indexOf(status) < 0) throw new Error('Unknown status.');
  ids = [].concat(ids);
  return withLock_(() => {
    const sh = sheet_();
    const at = status === 'pending' ? '' : now_();
    let n = 0;
    rows_().forEach(({ r, row }) => {
      if (ids.indexOf(r[C['Request ID']]) < 0) return;
      sh.getRange(row, C['Status'] + 1, 1, 4).setValues([[status, status === 'pending' ? '' : who, status === 'pending' ? '' : (remark || ''), at]]);
      n++;
    });
    if (!n) throw new Error('Request not found. It may have been withdrawn.');
    return n;
  });
}

function withdraw(id, pin, token) {
  staff_(pin, token);
  return withLock_(() => {
    const sh = sheet_();
    const hits = rows_().filter(({ r }) => r[C['Request ID']] === id);
    if (!hits.length) throw new Error('Request not found.');
    if (hits.some(({ r }) => (r[C['Status']] || 'pending') !== 'pending')) throw new Error('Only pending requests can be withdrawn.');
    hits.map(h => h.row).sort((a, b) => b - a).forEach(row => sh.deleteRow(row));
    return true;
  });
}

function saveActuals(id, actuals, pin, token) {
  staff_(pin, token);
  return withLock_(() => {
    const sh = sheet_();
    const hits = rows_().filter(({ r }) => r[C['Request ID']] === id);
    if (!hits.length) throw new Error('Request not found.');
    hits.forEach(({ r, row }, i) => {
      const a = actuals[i];
      const est = num_(r[C['Est. Hrs']]);
      sh.getRange(row, C['Actual Hrs'] + 1, 1, 2).setValues(a === null || a === '' || a === undefined ? [['', '']] : [[num_(a), num_(a) - est]]);
    });
    return true;
  });
}

/** Builds an Excel-ready report file in Drive (folder "OT Reports") and returns links. Approvers only. */
function exportReport(token, from, to, section, label) {
  session_(token);
  const reqs = group_(rows_().filter(({ r }) => r[C['OT Date']] >= from && r[C['OT Date']] <= to && (!section || r[C['Section']] === section)));
  const lines = [];
  reqs.forEach(q => q.employees.forEach(e => lines.push([
    q.otDate, q.section, e.empId, e.name, e.reason, e.est, e.actual === null ? '' : e.actual, e.actual === null ? '' : e.actual - e.est,
    q.status, q.approver, q.decidedBy, q.comments, q.remark
  ])));
  lines.sort((a, b) => (a[0] + a[1] + a[2]).localeCompare(b[0] + b[1] + b[2]));
  lines.forEach(l => l[0] = l[0].split('-').reverse().join('.'));

  const agg = (keyFn, order) => {
    const m = {};
    reqs.forEach(q => q.employees.forEach(e => {
      const k = keyFn(q, e) || '-';
      const g = m[k] || (m[k] = [k, 0, 0, 0, 0, 0, 0]);
      if (q.status === 'approved') { g[1]++; g[2] += e.est; if (e.actual !== null) { g[3] += e.actual; g[4] += e.actual - e.est; } }
      else if (q.status === 'rejected') g[5] += e.est; else g[6] += e.est;
    }));
    return Object.keys(m).sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b))).map(k => m[k]);
  };
  const cnt = s => reqs.filter(q => q.status === s).length;
  const appr = lines.filter(l => l[8] === 'approved');
  const sum = (arr, i) => arr.reduce((a, l) => a + (l[i] === '' ? 0 : l[i]), 0);
  const blank = ['', '', '', '', '', '', ''];
  const H = g => [g, 'Employees (approved)', 'Approved hrs', 'Actual hrs', 'Delta', 'Rejected hrs', 'Pending hrs'];
  const summary = [
    ['OVERTIME (OT) REPORT', '', '', '', '', '', ''], ['Period: ' + label + (section ? ' · ' + section : ''), '', '', '', '', '', ''], blank,
    ['Requests approved', cnt('approved'), '', '', '', '', ''], ['Requests rejected', cnt('rejected'), '', '', '', '', ''], ['Requests pending', cnt('pending'), '', '', '', '', ''],
    ['Approved OT hours', sum(appr, 5), '', '', '', '', ''], ['Actual OT hours', sum(appr, 6), '', '', '', '', ''], ['Delta (Actual - Approved)', sum(appr, 7), '', '', '', '', ''],
    blank, H('Section')].concat(agg(q => q.section, SECTIONS))
    .concat([blank, H('Reason')]).concat(agg((q, e) => e.reason, REASONS))
    .concat([blank, H('Decided by')]).concat(agg(q => q.decidedBy));

  const ss = SpreadsheetApp.create('OT Report ' + label + (section ? ' ' + section : ''));
  const s1 = ss.getSheets()[0].setName('Summary');
  s1.getRange(1, 1, summary.length, 7).setValues(summary);
  s1.getRange(1, 1).setFontWeight('bold').setFontSize(14); s1.autoResizeColumns(1, 7);
  const s2 = ss.insertSheet('Detail');
  const dh = ['Date', 'Section', 'Emp No', 'Employee Name', 'Reason', 'Estimated OT Hours', 'Actual OT Hours', 'Delta (Actual - Planned)',
    'Status', 'Approver', 'Decided By', 'Comments', 'Approver Remark'];
  s2.getRange(1, 1, 1, dh.length).setValues([dh]).setFontWeight('bold');
  if (lines.length) { s2.getRange(2, 3, lines.length, 1).setNumberFormat('@'); s2.getRange(2, 1, lines.length, dh.length).setValues(lines); }
  s2.setFrozenRows(1); s2.autoResizeColumns(1, dh.length);
  try {
    const par = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
    const base = par.hasNext() ? par.next() : DriveApp.getRootFolder();
    const it = base.getFoldersByName('OT Reports');
    DriveApp.getFileById(ss.getId()).moveTo(it.hasNext() ? it.next() : base.createFolder('OT Reports'));
  } catch (err) { }
  return { sheetUrl: ss.getUrl(), xlsxUrl: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx' };
}

/* ---------------- employee list (loaded into the "Employees" tab the first time the app runs) ---------------- */
const SEED_EMPLOYEES = [
  ["20008499", "Farhat Afzal", "Art"],
  ["20009555", "Hassan Bin Zahid", "Art"],
  ["20008952", "Maham", "Art"],
  ["20008376", "Mekaiel Akhtar", "Art"],
  ["20007755", "Muhammad Adeel", "Art"],
  ["20008803", "Muhammad Hassan Zahid", "Art"],
  ["20009419", "Muhammad Rehman Irshad", "Art"],
  ["20007715", "Muhammad Salman Khalid", "Art"],
  ["20008959", "Muhammad Waqar Khan", "Art"],
  ["20008823", "Namra Qayyum", "Art"],
  ["20005646", "Sabika Shiekh", "Art"],
  ["20008886", "Sayyed Qasim Hussain", "Art"],
  ["20007855", "Syed Ali Abbas", "Art"],
  ["20008210", "Syed Danish Zakir", "Art"],
  ["20003948", "Usman Ali", "Art"],
  ["20008678", "Zain Hamza", "Art"],
  ["20006140", "Adnan Yasin", "Engineering"],
  ["20009407", "Ahsan Ali", "Engineering"],
  ["20009687", "Ahsan Rehman", "Engineering"],
  ["20007568", "Akhlaq Ahmad", "Engineering"],
  ["993428", "Amir Khalid", "Engineering"],
  ["20004056", "Amir Shehzad", "Engineering"],
  ["20004147", "Asghar Ali", "Engineering"],
  ["20004674", "Danial Rafique", "Engineering"],
  ["20009634", "Farman Ali", "Engineering"],
  ["20009124", "Ghulam Mustafa", "Engineering"],
  ["20006240", "Hafiz Ghulam Murtaza", "Engineering"],
  ["20004838", "Ikram Muhammad", "Engineering"],
  ["20008431", "Khuram Muneer", "Engineering"],
  ["993281", "MUHAMMAD AWAIS", "Engineering"],
  ["993025", "Mirza Mohsin Baig", "Engineering"],
  ["20004972", "Muhammad Aamir Riaz", "Engineering"],
  ["20007108", "Muhammad Amjad", "Engineering"],
  ["20002550", "Muhammad Asghar Shah", "Engineering"],
  ["20008035", "Muhammad Asif", "Engineering"],
  ["20007990", "Muhammad Asif Raza", "Engineering"],
  ["20006225", "Muhammad Fayyaz", "Engineering"],
  ["20009744", "Muhammad Ramzan", "Engineering"],
  ["20003536", "Muhammad Raza", "Engineering"],
  ["20006942", "Muhammad Riaz", "Engineering"],
  ["20006555", "Muhammad Sajjad", "Engineering"],
  ["20002549", "Muhammad Salaih", "Engineering"],
  ["992292", "Muhammad Saleem", "Engineering"],
  ["20006228", "Muhammad Shahzad Bhatti", "Engineering"],
  ["20008429", "Muhammad Shoaib", "Engineering"],
  ["20002232", "Muhammad Umair Ul Atiq", "Engineering"],
  ["20006241", "Muhammad Wasim", "Engineering"],
  ["20007235", "Muhammad Yousaf", "Engineering"],
  ["20004984", "Muhammad Zain Ul Ab Din", "Engineering"],
  ["20008207", "Muhammad Zohaib Khan", "Engineering"],
  ["20006453", "Mukhtar Iqbal", "Engineering"],
  ["20000720", "Nisar Ahmad", "Engineering"],
  ["20009743", "Rao Anees Ur Rehman", "Engineering"],
  ["20002132", "Shahbaz Yousaf", "Engineering"],
  ["20000515", "Shahzad Saleem", "Engineering"],
  ["20007579", "Shoaib Idrees", "Engineering"],
  ["20005077", "Syed Ghazanfar Abbas Zaidi", "Engineering"],
  ["20007395", "Wajid Ali", "Engineering"],
  ["993751", "Waseem Hussain", "Engineering"],
  ["20004182", "Yasir Amin", "Engineering"],
  ["20002128", "Yousaf Barkat Bhatti", "Engineering"],
  ["20007434", "Zahid Hussain", "Engineering"],
  ["991663", "Aamir Shahzad", "Extrusion"],
  ["993778", "Abu Baker Latif", "Extrusion"],
  ["20008327", "Ahmad Rehman", "Extrusion"],
  ["20008038", "Asif Raza", "Extrusion"],
  ["993780", "Hamid Ali Bajwa", "Extrusion"],
  ["20002203", "Khuram Shahzad", "Extrusion"],
  ["20002262", "Liaqat Ali", "Extrusion"],
  ["992748", "M Adnan", "Extrusion"],
  ["20002216", "Malik Adil Hussain", "Extrusion"],
  ["992538", "Mr. Usama Khan Sherwani", "Extrusion"],
  ["20008033", "Muhammad Amin", "Extrusion"],
  ["20009709", "Muhammad Arshed Kashif", "Extrusion"],
  ["20009581", "Muhammad Bilal", "Extrusion"],
  ["20004677", "Muhammad Parvez", "Extrusion"],
  ["991679", "Muhammad Saqib Bhutta", "Extrusion"],
  ["990428", "Muhammad Umair", "Extrusion"],
  ["20003470", "Muhammad Zaheer Ahmad", "Extrusion"],
  ["20009814", "Musharaf ali", "Extrusion"],
  ["20004046", "Qaiser Iqbal", "Extrusion"],
  ["20003104", "Qamar Subhani", "Extrusion"],
  ["20006226", "Rashid Ali", "Extrusion"],
  ["20004487", "Rizwan Yousaf", "Extrusion"],
  ["20009719", "Saif Ullah", "Extrusion"],
  ["20008603", "Shafqat Lateef", "Extrusion"],
  ["991330", "Shahbaz Haider", "Extrusion"],
  ["20008325", "Shahbaz Maqsood", "Extrusion"],
  ["20004336", "Shahid Javed Iqbal", "Extrusion"],
  ["992544", "abdul Mannan", "Extrusion"],
  ["990382", "Abdul Majeed", "Finishing"],
  ["20002222", "Abdul Qayyum", "Finishing"],
  ["20009732", "Abdul Rauf", "Finishing"],
  ["992596", "Abdul Rehman", "Finishing"],
  ["20003468", "Abid Gulzar", "Finishing"],
  ["990394", "Akbar Khan", "Finishing"],
  ["20000869", "Ali Muhammad", "Finishing"],
  ["992746", "Ali Sabir", "Finishing"],
  ["992526", "Ameer Hamza", "Finishing"],
  ["20004855", "Amir Hussain Shaheen", "Finishing"],
  ["20003047", "Amjad Mahmood", "Finishing"],
  ["20003067", "Asghar Ali", "Finishing"],
  ["992708", "Asif Nawaz", "Finishing"],
  ["20003927", "Asif Ramzan", "Finishing"],
  ["20003727", "Aurang Zeb", "Finishing"],
  ["990446", "Awais Ali", "Finishing"],
  ["992703", "Azmat ali", "Finishing"],
  ["20002229", "Babar Shahzad", "Finishing"],
  ["992767", "Ch Irfan Najam", "Finishing"],
  ["992830", "Farhan Rasool", "Finishing"],
  ["990404", "Farhan khan", "Finishing"],
  ["20009489", "Faryad Ali", "Finishing"],
  ["992482", "Fiaz ahmad", "Finishing"],
  ["20004830", "Ghulam Abbas", "Finishing"],
  ["991705", "Hafiz Muhammad Naeem", "Finishing"],
  ["993026", "Haris Junaid", "Finishing"],
  ["992756", "Haseeb Shabaz", "Finishing"],
  ["992376", "Hassan Mahboob", "Finishing"],
  ["993804", "Husnain Ali", "Finishing"],
  ["20002151", "Ijaz Ahmad", "Finishing"],
  ["20009123", "Imran Hussain", "Finishing"],
  ["990378", "Imran Hussain", "Finishing"],
  ["20002205", "Imran Khan", "Finishing"],
  ["990422", "Imtiaz Ali", "Finishing"],
  ["990409", "Ishfaq hussain", "Finishing"],
  ["990374", "Kaleem ullah", "Finishing"],
  ["20002129", "Lall Din", "Finishing"],
  ["992994", "M Faizan cheema", "Finishing"],
  ["990690", "M Husnain", "Finishing"],
  ["990405", "M Khalid Hussain", "Finishing"],
  ["990395", "Majid khan", "Finishing"],
  ["20002148", "Maqbool Hussain", "Finishing"],
  ["990352", "Mazhar Hussain", "Finishing"],
  ["990397", "Mohammad Mujahid", "Finishing"],
  ["20001589", "Mohammad Saleem", "Finishing"],
  ["992734", "Mubashar Ali", "Finishing"],
  ["990357", "Mudassar Hussain Shah", "Finishing"],
  ["993082", "Muhammad Adnan", "Finishing"],
  ["990346", "Muhammad Afzal", "Finishing"],
  ["20003478", "Muhammad Akram", "Finishing"],
  ["20002233", "Muhammad Ali", "Finishing"],
  ["20002246", "Muhammad Amin", "Finishing"],
  ["20009727", "Muhammad Amin", "Finishing"],
  ["20003473", "Muhammad Ashfaq", "Finishing"],
  ["990449", "Muhammad Awais", "Finishing"],
  ["990328", "Muhammad Azam", "Finishing"],
  ["990433", "Muhammad Azeem", "Finishing"],
  ["990419", "Muhammad Bilal", "Finishing"],
  ["992071", "Muhammad Bilal", "Finishing"],
  ["20004847", "Muhammad Ejaz", "Finishing"],
  ["990390", "Muhammad Imran sleeve", "Finishing"],
  ["20002159", "Muhammad Latif", "Finishing"],
  ["20002201", "Muhammad Nadeem", "Finishing"],
  ["20002141", "Muhammad Raza", "Finishing"],
  ["20005539", "Muhammad Saeed", "Finishing"],
  ["990345", "Muhammad Saeed", "Finishing"],
  ["20000508", "Muhammad Shahbaz", "Finishing"],
  ["20004831", "Muhammad Shazad", "Finishing"],
  ["20002236", "Muhammad Suleman", "Finishing"],
  ["20006929", "Muhammad Usama", "Finishing"],
  ["991743", "Muhammad Yameen", "Finishing"],
  ["20002140", "Muhammad Yar", "Finishing"],
  ["990350", "Muhammad Yousaf", "Finishing"],
  ["20002238", "Muhammad Yousaf Salik", "Finishing"],
  ["992476", "Muhammad Zaid", "Finishing"],
  ["991674", "Muhammad farooq", "Finishing"],
  ["990333", "Muqaddas Hussain", "Finishing"],
  ["992250", "Murad ali", "Finishing"],
  ["993013", "Muzammil Rizwan", "Finishing"],
  ["990308", "Nazeer Ahmad", "Finishing"],
  ["20003472", "Nazir Ahmad", "Finishing"],
  ["20003548", "Nisar Ahmad", "Finishing"],
  ["20002127", "Pervaiz Veroo", "Finishing"],
  ["992718", "Qaseem Aslam", "Finishing"],
  ["20002259", "Ramzan Anwar", "Finishing"],
  ["990371", "Ramzan Rafique", "Finishing"],
  ["990376", "Rizwan ali", "Finishing"],
  ["20004678", "Sajid Ghafoor", "Finishing"],
  ["990343", "Shahid Ali Shah", "Finishing"],
  ["990360", "Shahwaiz Ali", "Finishing"],
  ["20002147", "Sharafat Ali", "Finishing"],
  ["20004713", "Shehzad Ali", "Finishing"],
  ["992709", "Sohail Ahmed", "Finishing"],
  ["991671", "Syed Mubashir usman", "Finishing"],
  ["20003479", "Tariq Ali", "Finishing"],
  ["990355", "Tariq Idrees", "Finishing"],
  ["991260", "Tariq Muneer", "Finishing"],
  ["992619", "Wajid Hussain", "Finishing"],
  ["20003068", "Wajid Sadiq Masih", "Finishing"],
  ["993301", "Wajid Saleem", "Finishing"],
  ["20002152", "Yasir Naeem Ashraf", "Finishing"],
  ["990356", "Zafar Iqbal", "Finishing"],
  ["990353", "Zaheer ud Din Babar", "Finishing"],
  ["20009087", "Zahid Ali Shouqat", "Finishing"],
  ["20003152", "Abdul Hameed", "Flexo"],
  ["990473", "Aqib", "Flexo"],
  ["993378", "Faisal Ali", "Flexo"],
  ["993014", "Hafiz Muhammad Zahid", "Flexo"],
  ["993005", "Kashif Ali", "Flexo"],
  ["990344", "M Yaseen", "Flexo"],
  ["992626", "M Zeeshan", "Flexo"],
  ["20003069", "Muhammad Ashfaq", "Flexo"],
  ["20003544", "Muhammad Awais Amjid", "Flexo"],
  ["20003038", "Muhammad Ayub", "Flexo"],
  ["20009620", "Muhammad Danish", "Flexo"],
  ["20009122", "Muhammad Dawood", "Flexo"],
  ["20003538", "Muhammad Fayyaz Khan", "Flexo"],
  ["20002144", "Muhammad Ilyas", "Flexo"],
  ["20003902", "Muhammad Mudassar Nazar", "Flexo"],
  ["993318", "Muhammad Zubair", "Flexo"],
  ["20009557", "Nasir Sohail", "Flexo"],
  ["990475", "Qaisar Raza", "Flexo"],
  ["20009695", "Qasim Khan", "Flexo"],
  ["993223", "Rana Ahsan Ahmed", "Flexo"],
  ["20004858", "Rasheed Alam", "Flexo"],
  ["20004714", "Sajid Iqbal", "Flexo"],
  ["20008137", "Shakir Saleem Mughal", "Flexo"],
  ["20008142", "Shamsher Khan", "Flexo"],
  ["20009559", "Sharafat Amanat", "Flexo"],
  ["992424", "Tahir Mehmood", "Flexo"],
  ["20004471", "Tauqeer Ahmad", "Flexo"],
  ["20008138", "Tayyab Hassan", "Flexo"],
  ["20004538", "Uzman Ashraf", "Flexo"],
  ["20004925", "Akbar Ali", "Lamination"],
  ["991943", "Ali Raza", "Lamination"],
  ["20006530", "Amir Rasheed", "Lamination"],
  ["992742", "Fiyyaz Ahmed", "Lamination"],
  ["20003155", "Gulzar Hussain", "Lamination"],
  ["20009156", "Hafiz Abdul Waheed", "Lamination"],
  ["992131", "Hafiz M Farqan", "Lamination"],
  ["20004521", "Imran Shoukat", "Lamination"],
  ["20009721", "Kamran Rafaqat", "Lamination"],
  ["993387", "M Imtiaz", "Lamination"],
  ["992831", "M Jahangir", "Lamination"],
  ["992727", "Mazhar Saeed", "Lamination"],
  ["20003150", "Mehboob Alam", "Lamination"],
  ["20002231", "Mubashar Hussain Arshad", "Lamination"],
  ["20009718", "Muhammad Ahmad", "Lamination"],
  ["20002196", "Muhammad Amjid Khan", "Lamination"],
  ["20000530", "Muhammad Arshad", "Lamination"],
  ["20006165", "Muhammad Awais Ahmad", "Lamination"],
  ["20008014", "Muhammad Awais Mushtaq", "Lamination"],
  ["20008506", "Muhammad Azhar", "Lamination"],
  ["20002221", "Muhammad Hassan", "Lamination"],
  ["20002244", "Muhammad Ilyas", "Lamination"],
  ["20000552", "Muhammad Ilyas", "Lamination"],
  ["20004275", "Muhammad Irfan", "Lamination"],
  ["20004273", "Muhammad Khurram Siddique", "Lamination"],
  ["20004044", "Muhammad Rizwan", "Lamination"],
  ["20002251", "Muhammad Shahid Khan", "Lamination"],
  ["20008016", "Muhammad Umer", "Lamination"],
  ["20009611", "Muhammad Yasir", "Lamination"],
  ["993304", "Naeem Iqbal", "Lamination"],
  ["20009639", "Omer", "Lamination"],
  ["20003831", "Sajed Mahmood", "Lamination"],
  ["20008015", "Sajjad Ahmad", "Lamination"],
  ["20008012", "Sakhawat Mustafa", "Lamination"],
  ["20009637", "Saqib Rafique", "Lamination"],
  ["993779", "Shahid Ashraf", "Lamination"],
  ["20003546", "Shahzad Hassan", "Lamination"],
  ["20008013", "Shahzad Hussain", "Lamination"],
  ["20004281", "Syed Irfan Abbas Kazmi", "Lamination"],
  ["20006220", "Syed Kashif Hussain", "Lamination"],
  ["992980", "Syed Qasim Ali", "Lamination"],
  ["992567", "Syed Sheraz Haider", "Lamination"],
  ["993777", "Syed mohsin raza", "Lamination"],
  ["991728", "Waqar Mushtaq", "Lamination"],
  ["992580", "Waseem akthar", "Lamination"],
  ["20002213", "Zahid Abbas", "Lamination"],
  ["20009576", "Zahid Ali", "Lamination"],
  ["20006458", "Zahid Sattar", "Lamination"],
  ["990400", "Zaki Shah", "Lamination"],
  ["20007584", "Abbas Ali", "Management"],
  ["20009758", "Abdur Rehman Sheikh", "Management"],
  ["20000727", "Abid Hussain", "Management"],
  ["20009825", "Aeman Ashraf", "Management"],
  ["20008842", "Afshal Amir", "Management"],
  ["20008284", "Ahmad Fazal", "Management"],
  ["20009465", "Ali Adil Sheikh", "Management"],
  ["20009716", "Ali Tahir", "Management"],
  ["20009625", "Amir", "Management"],
  ["20008254", "Ammar Farooq", "Management"],
  ["20009766", "Aqdas Ali", "Management"],
  ["20000503", "Athar Riaz", "Management"],
  ["20003572", "Atif Ali", "Management"],
  ["20009761", "Eisha Raza", "Management"],
  ["20008166", "Ghulam Mustafa", "Management"],
  ["20009762", "Gulnoor Sohail", "Management"],
  ["20009371", "Hafiz Muhammad Usman Ahmad", "Management"],
  ["20009845", "Hafiz Muhammad Yousaf Akram", "Management"],
  ["20007207", "IMRAN AZIZ SALARIA", "Management"],
  ["20007738", "Iftikhar Alam Shah", "Management"],
  ["20008861", "Imran Imtiaz", "Management"],
  ["20005024", "Johnson Yaqoob", "Management"],
  ["20006709", "Kashif Shahzad", "Management"],
  ["20000523", "Khalid Bashir", "Management"],
  ["20009608", "Khawaja Bilal Ahmed Wyne", "Management"],
  ["20008988", "Khuldoon Ali Raza", "Management"],
  ["20000527", "M Saeed", "Management"],
  ["20008178", "Malik Daniyal Jan", "Management"],
  ["20007870", "Mamoona Syed", "Management"],
  ["20008543", "Mansoor Ahmed Mirza", "Management"],
  ["20000690", "Maqsood Ahmed", "Management"],
  ["20009763", "Minhal", "Management"],
  ["20007792", "Mohsin Rafiq", "Management"],
  ["20008613", "Mubarak Ali Khan", "Management"],
  ["20001153", "Muhammad Abid", "Management"],
  ["20009613", "Muhammad Anas Bin Azam", "Management"],
  ["20008944", "Muhammad Hamza Zaib", "Management"],
  ["20009834", "Muhammad Ibrahim", "Management"],
  ["20009824", "Muhammad Jahanzaib Hassan Shah", "Management"],
  ["20008230", "Muhammad Mohsin Ali Akhtar", "Management"],
  ["20009626", "Muhammad Osama", "Management"],
  ["20009617", "Muhammad Saad Bin Ayub", "Management"],
  ["20009533", "Muhammad Shoaib Khan", "Management"],
  ["20003734", "Muhammad Tanveer", "Management"],
  ["20009414", "Muhammad Umair", "Management"],
  ["20009339", "Muhammad Umair Shafique", "Management"],
  ["20007053", "Muhammad Umer Farooq", "Management"],
  ["20008280", "Muhammad Usama Saeed", "Management"],
  ["20009600", "Muhammad Usman", "Management"],
  ["20009753", "Murad Ali", "Management"],
  ["20009729", "Naveed Bhatti", "Management"],
  ["20008542", "Nazish Siddiqui", "Management"],
  ["20007790", "Rafaqat Ali", "Management"],
  ["20008630", "Saba Naz", "Management"],
  ["20009833", "Samiya Gohar", "Management"],
  ["20009523", "Shahid Saeed", "Management"],
  ["20008691", "Shahmeer Aslam", "Management"],
  ["20008715", "Shehroz Khalid", "Management"],
  ["20009668", "Sheza Shamim", "Management"],
  ["20009305", "Syed Hussnain Zaidi", "Management"],
  ["20002281", "Syed Kaleem Haider Kazmi", "Management"],
  ["20004864", "Syeda Zehra Qaiser", "Management"],
  ["20005628", "Tanvir Ahmad Awan", "Management"],
  ["20009701", "Umar Shouk Butt", "Management"],
  ["20008845", "Umer Javed", "Management"],
  ["20009772", "Usama Majeed", "Management"],
  ["20008821", "Uzair Asad", "Management"],
  ["20009751", "Warda", "Management"],
  ["20009720", "Zeeshan Ali", "Management"],
  ["20009532", "Zoya Ahmed", "Management"],
  ["20002206", "Arshad Ali", "Office Clerk"],
  ["993204", "Khalid Hussian", "Office Clerk"],
  ["993557", "Meer Wali Khan", "Planning"],
  ["20008615", "Sabahat Raza Khan", "Planning"],
  ["20006434", "Abdul Rauf", "Quality assurance"],
  ["20004288", "Ahmad Khan", "Quality assurance"],
  ["20002537", "Amjad Ali", "Quality assurance"],
  ["20003675", "Ghaznfar Ali", "Quality assurance"],
  ["20006754", "Kashif Shahzad", "Quality assurance"],
  ["993239", "Khizar Ali", "Quality assurance"],
  ["20000526", "M Jamil Anjum", "Quality assurance"],
  ["20000666", "M Munir", "Quality assurance"],
  ["20003108", "M Murtaza", "Quality assurance"],
  ["20004959", "M Usman Baig", "Quality assurance"],
  ["20006394", "Muhammad Imran Haider", "Quality assurance"],
  ["20007337", "Rana Usman Asgher", "Quality assurance"],
  ["20000445", "Shoaib Ismail", "Quality assurance"],
  ["20009684", "Laila Fatima", "R&D"],
  ["20000671", "Mohammad Saleem", "R&D"],
  ["20009619", "Muhammad Ramzan", "R&D"],
  ["20006962", "Muhammad Sajid Dilshad", "R&D"],
  ["20006963", "Shahid Mehmood Mufti", "R&D"],
  ["990472", "Abbas", "Reproduction"],
  ["991919", "Abdul Qadeer", "Reproduction"],
  ["20007386", "Abdul Qadir", "Reproduction"],
  ["20003867", "Adnan Alam", "Reproduction"],
  ["20000625", "Agha Kashif Ali", "Reproduction"],
  ["20004053", "Ahsan Imtiaz", "Reproduction"],
  ["20002417", "Akbar Ali", "Reproduction"],
  ["990815", "Allah Wasaya", "Reproduction"],
  ["20007351", "Amir Younis", "Reproduction"],
  ["20002143", "Arshad Mahmood", "Reproduction"],
  ["20008642", "Ayub Shah", "Reproduction"],
  ["992867", "BAGH ALI", "Reproduction"],
  ["20007078", "Faisal", "Reproduction"],
  ["20008282", "Farhan kazmi", "Reproduction"],
  ["20007881", "HUMAYUN REHMAN", "Reproduction"],
  ["20009738", "Hafiz Muhammad Ismail", "Reproduction"],
  ["993123", "Hassan jahnzaib", "Reproduction"],
  ["20007882", "IJAZ AHMAD", "Reproduction"],
  ["20000635", "Ijaz Ahmad", "Reproduction"],
  ["992099", "Irshad Hussain", "Reproduction"],
  ["993120", "Kabeer Khan", "Reproduction"],
  ["20003036", "Kamran", "Reproduction"],
  ["20004026", "Khalil Ahmad", "Reproduction"],
  ["990474", "M Shahbaz", "Reproduction"],
  ["20001693", "M. Riaz", "Reproduction"],
  ["20007410", "M.Shahid", "Reproduction"],
  ["20004244", "Mohsan ABID", "Reproduction"],
  ["990299", "Mr Sana ul Haq", "Reproduction"],
  ["20002237", "Mr.Asghar Ali", "Reproduction"],
  ["20003521", "Mr.Muhammad Irfan", "Reproduction"],
  ["20003434", "Mr.Muhammad Ramzan", "Reproduction"],
  ["20004114", "Mr.Mushtaq Ahmad", "Reproduction"],
  ["20002000", "Mr.Raza-e-Mustafa", "Reproduction"],
  ["20003869", "Muazzam Khan", "Reproduction"],
  ["33301-09125909", "Mubashir Ali", "Reproduction"],
  ["20009560", "Muhammad Ahmad", "Reproduction"],
  ["20000628", "Muhammad Aslam", "Reproduction"],
  ["20009516", "Muhammad Azam", "Reproduction"],
  ["20009681", "Muhammad Hamza", "Reproduction"],
  ["20003049", "Muhammad Imran", "Reproduction"],
  ["20008909", "Muhammad Irfan", "Reproduction"],
  ["992730", "Muhammad Khubaib", "Reproduction"],
  ["20007352", "Naeem Akhtar", "Reproduction"],
  ["20000633", "Naveed Ahmad", "Reproduction"],
  ["20000636", "Rehan Ali", "Reproduction"],
  ["20007842", "Saifal Suleman", "Reproduction"],
  ["20009749", "Sarfraz Ali", "Reproduction"],
  ["20000572", "Sh.Naeem Ahmad", "Reproduction"],
  ["20003783", "Shabbir Ali", "Reproduction"],
  ["20006574", "Shahid", "Reproduction"],
  ["20003040", "Shehzad Anwer", "Reproduction"],
  ["20008662", "Sheraz", "Reproduction"],
  ["992704", "Abdul Aziz", "Roto"],
  ["20004040", "Ahmad Fayyaz", "Roto"],
  ["993748", "Amir Azeem", "Roto"],
  ["20003378", "Amjad Ali", "Roto"],
  ["990438", "Asad Akhtar", "Roto"],
  ["993752", "CHAUDHRY NOUMAN ALI", "Roto"],
  ["20007992", "Ghulam Hassan", "Roto"],
  ["993251", "Ghulam Qadir", "Roto"],
  ["992716", "Gulraiz Ahmad", "Roto"],
  ["20002198", "Ishtiaq Ahmad", "Roto"],
  ["20008981", "Khalil Ahmad", "Roto"],
  ["993749", "M Sanaullah", "Roto"],
  ["993558", "MUHAMMAD ARSLAN KHAN", "Roto"],
  ["20009688", "Malik Sarfraz Asghar", "Roto"],
  ["20003401", "Muhammad Asif Iqbal", "Roto"],
  ["20008893", "Muhammad Atiq", "Roto"],
  ["992517", "Muhammad Ibrar", "Roto"],
  ["20004472", "Muhammad Irfan", "Roto"],
  ["20005072", "Muhammad Javed", "Roto"],
  ["20009296", "Muhammad Mustafa", "Roto"],
  ["20004226", "Muhammad Naeem Bhatti", "Roto"],
  ["993783", "Muhammad Nouman", "Roto"],
  ["20008982", "Muhammad Shahid", "Roto"],
  ["20008892", "Muhammad Usman", "Roto"],
  ["20009317", "Muhammad Waqas", "Roto"],
  ["20006454", "Muhammad Yousaf Subhani", "Roto"],
  ["20007986", "Mujahid Javed", "Roto"],
  ["20006229", "Noman Ahmad", "Roto"],
  ["20002220", "Saber Hussain", "Roto"],
  ["990469", "Saif Ullah", "Roto"],
  ["993227", "Saif Zaman", "Roto"],
  ["20002242", "Shahid Ali", "Roto"],
  ["20003259", "Shahzad Alam", "Roto"],
  ["20009490", "Shujaat Hussain", "Roto"],
  ["991040", "Sohail Ahmed", "Roto"],
  ["20000544", "Syed Yawar Hussain Bukhari", "Roto"],
  ["20004998", "Syed Zeeshan Haider", "Roto"],
  ["20005000", "Tariq Nazeer", "Roto"],
  ["20003648", "Tayyab Allah Rakha", "Roto"],
  ["20009622", "Usama Faryad", "Roto"],
  ["993209", "Usman Rehman", "Roto"],
  ["993290", "Waqar Younas", "Roto"],
  ["993737", "Zarar Hussain", "Roto"],
  ["20009621", "Zeeshan Ali", "Roto"],
  ["20003220", "Farhan Naveed", "Sales Support Officer"],
  ["20009795", "Ameer Hamza Subhani", "Shift Supervisor"],
  ["20009781", "Muhammad Taha Khalid", "Shift Supervisor"],
  ["20009782", "Zohiab Liaqat", "Shift Supervisor"],
  ["990386", "Abad ali", "Slitting"],
  ["20002189", "Agha Shahzad Karim Ullah", "Slitting"],
  ["20006542", "Ahmad Saood Anwar", "Slitting"],
  ["20009382", "Ali Akbar", "Slitting"],
  ["993337", "Amir Ali", "Slitting"],
  ["990572", "Amir Butt", "Slitting"],
  ["20002202", "Arshad Naeem", "Slitting"],
  ["993254", "Asghar Ali", "Slitting"],
  ["20002294", "Ashraf Ali", "Slitting"],
  ["20004136", "Asif Mushtaq", "Slitting"],
  ["20002121", "Dawood Ahmad", "Slitting"],
  ["20004846", "Farhan Ramzan", "Slitting"],
  ["20004134", "Fiaz Ahmed", "Slitting"],
  ["20003845", "Ghulam Rasool", "Slitting"],
  ["993244", "Hafiz Atif Rasool", "Slitting"],
  ["20005010", "Hafiz Muhammad Irfan", "Slitting"],
  ["990348", "Haroon Rasheed", "Slitting"],
  ["991509", "Hassan Nawaz", "Slitting"],
  ["20002252", "Imran Ali", "Slitting"],
  ["993072", "Imran Ashraf", "Slitting"],
  ["20002217", "Imtiaz Ali", "Slitting"],
  ["20008034", "Ishtiaq Ahmed", "Slitting"],
  ["992479", "Khurram akram", "Slitting"],
  ["992378", "M Babar Hussain", "Slitting"],
  ["990297", "M. Azhar", "Slitting"],
  ["992086", "M. afzal Haneef", "Slitting"],
  ["991408", "Mohammad Imran", "Slitting"],
  ["991300", "Mohammad Saleem", "Slitting"],
  ["991291", "Mohammad Waqas Arif", "Slitting"],
  ["20004913", "Muddasar Irfan", "Slitting"],
  ["20004415", "Muddassar Hussain", "Slitting"],
  ["20009484", "Muhammad Ahmad Khan", "Slitting"],
  ["20003433", "Muhammad Akram", "Slitting"],
  ["990436", "Muhammad Asim", "Slitting"],
  ["20003780", "Muhammad Awais", "Slitting"],
  ["993020", "Muhammad Awais", "Slitting"],
  ["20009090", "Muhammad Awais Munir", "Slitting"],
  ["20003469", "Muhammad Fayyaz", "Slitting"],
  ["20003514", "Muhammad Jamil", "Slitting"],
  ["20002161", "Muhammad Javed Iqbal", "Slitting"],
  ["991672", "Muhammad Kamran Aslam", "Slitting"],
  ["20002223", "Muhammad Ramzan Aslam", "Slitting"],
  ["20003975", "Muhammad Saleem", "Slitting"],
  ["20003778", "Muhammad Sarfraz Rana", "Slitting"],
  ["20000513", "Muhammad Sarwar", "Slitting"],
  ["20002200", "Muhammad Shafique", "Slitting"],
  ["990354", "Muhammad Shafique", "Slitting"],
  ["20003492", "Muhammad Shahid", "Slitting"],
  ["20002250", "Muhammad Tariq", "Slitting"],
  ["20008864", "Muhammad Umer Shahzad", "Slitting"],
  ["20002243", "Muhammad Yameen", "Slitting"],
  ["990349", "Muhammad ibrar", "Slitting"],
  ["990393", "Mushtaq salakhan", "Slitting"],
  ["990306", "Nadeem pervaiz", "Slitting"],
  ["20002227", "Naveed Ali", "Slitting"],
  ["20002560", "S. M. Sabir Imam", "Slitting"],
  ["20003516", "Salamat Ali", "Slitting"],
  ["20004088", "Shafiq Ur Rehman", "Slitting"],
  ["20002192", "Shoukat Ali", "Slitting"],
  ["20004413", "Syed Baqar Hussain", "Slitting"],
  ["20003600", "Tanveer Ahmad", "Slitting"],
  ["990424", "Tariq Ali", "Slitting"],
  ["990392", "Tariq Ali", "Slitting"],
  ["20002139", "Tasawar Hussain", "Slitting"],
  ["992817", "Umair Siddique", "Slitting"],
  ["993073", "Usman Yousaf", "Slitting"],
  ["20007567", "Waqas Dawood", "Slitting"],
  ["20004086", "Hafiz Habib Ur Rehman", "Union"],
  ["20004279", "Hafiz Muhammad Irfan", "Union"],
  ["20002138", "Mahmood Ali Rehan", "Union"],
  ["20002228", "Nadeem Qaiser", "Union"]
];
