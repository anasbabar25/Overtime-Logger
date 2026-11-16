import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtD, fmtH, num, pad, sg, today } from '../utils';

const DASH = '–';

function dcls(v) {
  return v > 0 ? 'pos' : v < 0 ? 'neg' : '';
}

function GroupTable({ title, col, rows }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>{col}</th>
              <th className="n">Emp</th>
              <th className="n">Approved</th>
              <th className="n">Actual</th>
              <th className="n">Delta</th>
              <th className="n">Rejected</th>
              <th className="n">Pending</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.k}>
                <td>{g.k}</td>
                <td className="n">{g.emp}</td>
                <td className="n">{fmtH(g.est)}</td>
                <td className="n">
                  {fmtH(g.act)}
                  {g.noAct ? <span className="meta"> ({g.noAct} open)</span> : null}
                </td>
                <td className={`n ${dcls(g.dl)}`}>{sg(g.dl)}</td>
                <td className="n">{fmtH(g.rej)}</td>
                <td className="n">{fmtH(g.pend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Reports({ cfg, tab, me, tok, onAuthFail }) {
  const [mode, setMode] = useState('daily');
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [section, setSection] = useState('');
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportUrl, setExportUrl] = useState('');
  const [exportName, setExportName] = useState('OT Report.xlsx');
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState('');

  function range() {
    if (mode === 'daily') {
      const d = day || today();
      return [d, d];
    }
    const m = month || today().slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    return [`${m}-01`, `${m}-${pad(new Date(y, mo, 0).getDate())}`];
  }

  const [from, to] = range();
  const label = mode === 'daily' ? fmtD(from) : new Date(`${from}T00:00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (tab !== 'report') return undefined;
    let cancel = false;
    const [f, t] = range();
    setExportUrl('');
    setExportErr('');
    setLoading(true);
    setError('');
    api
      .getRequests(f, t)
      .then((all) => {
        if (!cancel) setReqs(all.filter((r) => r.otDate >= f && r.otDate <= t));
      })
      .catch((e) => {
        if (!cancel) setError(e.message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [tab, mode, day, month, section]);

  async function download() {
    if (!me) {
      setExportErr('Log in as an approver or power user to export.');
      setExportUrl('');
      return;
    }
    setExporting(true);
    setExportErr('');
    try {
      const [f, t] = range();
      const url = await api.exportReport(tok, f, t, section, label);
      setExportUrl(url);
      setExportName(`OT Report ${label}${section ? ' ' + section : ''}.xlsx`);
    } catch (e) {
      onAuthFail(e);
    } finally {
      setExporting(false);
    }
  }

  const filtered = reqs.filter((r) => !section || r.section === section);
  const lines = [];
  filtered.forEach((r) =>
    r.employees.forEach((e) =>
      lines.push({
        date: r.otDate,
        section: r.section,
        empId: e.empId,
        name: e.name,
        reason: e.reason,
        est: num(e.est),
        actual: e.actual,
        delta: e.actual != null ? num(e.actual) - num(e.est) : null,
        status: r.status,
        approver: r.approver,
        initiator: r.initiatorName && r.initiatorEmpNo ? `${r.initiatorName}-${r.initiatorEmpNo}` : r.initiatorName || '',
        decidedBy: r.decidedBy,
        comments: r.comments,
        remark: r.remark,
      }),
    ),
  );
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section));
  const cnt = (s) => filtered.filter((r) => r.status === s).length;
  const appr = lines.filter((l) => l.status === 'approved');
  const withAct = appr.filter((l) => l.actual != null);
  const planned = appr.reduce((a, l) => a + l.est, 0);
  const actual = withAct.reduce((a, l) => a + l.actual, 0);
  const delta = withAct.reduce((a, l) => a + l.delta, 0);

  function group(keyFn) {
    const map = new Map();
    lines.forEach((l) => {
      const k = keyFn(l) || DASH;
      const g = map.get(k) || { k, emp: 0, est: 0, act: 0, dl: 0, noAct: 0, rej: 0, pend: 0 };
      if (l.status === 'approved') {
        g.emp++;
        g.est += l.est;
        if (l.actual != null) {
          g.act += l.actual;
          g.dl += l.delta;
        } else g.noAct++;
      } else if (l.status === 'rejected') g.rej += l.est;
      else g.pend += l.est;
      map.set(k, g);
    });
    return [...map.values()];
  }
  const order = (arr, ref) => [...arr].sort((a, b) => ref.indexOf(a.k) - ref.indexOf(b.k));

  let body;
  if (loading) body = <div className="loading">Loading {label}…</div>;
  else if (error) body = <div className="empty">Couldn’t load this period. {error}</div>;
  else if (!lines.length) {
    body = (
      <div className="empty">
        <strong>
          No overtime recorded for {label}
          {section ? ` · ${section}` : ''}
        </strong>
        Pick another {mode === 'daily' ? 'date' : 'month'} or section.
      </div>
    );
  } else {
    body = (
      <>
        <div>
          <h2>
            {label}
            {section ? ` · ${section}` : ''}
          </h2>
          <p className="sub">
            {fmtD(from)}
            {from !== to ? ` – ${fmtD(to)}` : ''} · Hours · Delta = actual − approved, where actual is entered
          </p>
        </div>
        <div className="tiles">
          <div className="tile">
            <div className="k">Requests</div>
            <div className="v">{filtered.length}</div>
            <div className="s">
              {cnt('approved')} approved · {cnt('rejected')} rejected · {cnt('pending')} pending
            </div>
          </div>
          <div className="tile">
            <div className="k">Approved OT</div>
            <div className="v">{fmtH(planned)}</div>
            <div className="s">hrs · {appr.length} employee entries</div>
          </div>
          <div className="tile">
            <div className="k">Actual OT</div>
            <div className="v">{fmtH(actual)}</div>
            <div className="s">
              hrs · {withAct.length} of {appr.length} entered
            </div>
          </div>
          <div className="tile">
            <div className="k">Delta</div>
            <div className={`v ${dcls(delta)}`}>{sg(delta)}</div>
            <div className="s">Target 0</div>
          </div>
        </div>
        <div className="two">
          <GroupTable title="By section" col="Section" rows={order(group((l) => l.section), cfg.sections)} />
          <GroupTable title="By reason" col="Reason" rows={order(group((l) => l.reason), cfg.reasons)} />
          <GroupTable
            title="By approver"
            col="Decided by"
            rows={group((l) => (l.status === 'pending' ? '' : l.decidedBy)).filter((g) => g.k !== DASH)}
          />
        </div>
        <div className="panel">
          <h2>Detail</h2>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Section</th>
                  <th>Emp No</th>
                  <th>Name</th>
                  <th>Reason</th>
                  <th className="n">Est.</th>
                  <th className="n">Actual</th>
                  <th className="n">Delta</th>
                  <th>Status</th>
                  <th>Initiator</th>
                  <th>Approved / rejected by</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.date}-${l.empId}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtD(l.date)}</td>
                    <td>{l.section}</td>
                    <td>{l.empId}</td>
                    <td>{l.name}</td>
                    <td>{l.reason}</td>
                    <td className="n">{fmtH(l.est)}</td>
                    <td className="n">{fmtH(l.actual)}</td>
                    <td className={`n ${dcls(l.delta)}`}>{l.delta == null ? '–' : sg(l.delta)}</td>
                    <td>
                      <span className={`pill ${l.status}`}>{l.status}</span>
                    </td>
                    <td>{l.initiator}</td>
                    <td>{l.status === 'pending' ? `Sent to ${l.approver}` : l.decidedBy}</td>
                    <td style={{ minWidth: 180 }}>{[l.comments, l.remark && `Approver: ${l.remark}`].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="panel">
        <div className="row">
          <div className="seg" role="group" aria-label="Report period">
            <button type="button" aria-pressed={mode === 'daily'} onClick={() => setMode('daily')}>
              Daily
            </button>
            <button type="button" aria-pressed={mode === 'monthly'} onClick={() => setMode('monthly')}>
              Monthly
            </button>
          </div>
          <input type="date" value={day} hidden={mode !== 'daily'} style={{ width: 'auto' }} onChange={(ev) => setDay(ev.target.value)} />
          <input type="month" value={month} hidden={mode !== 'monthly'} style={{ width: 'auto' }} onChange={(ev) => setMonth(ev.target.value)} />
          <select value={section} style={{ width: 'auto' }} onChange={(ev) => setSection(ev.target.value)}>
            <option value="">All sections</option>
            {cfg.sections.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <span className="spacer" />
          <button className="btn primary" type="button" disabled={exporting} onClick={download}>
            {exporting ? 'Preparing…' : 'Export to Excel'}
          </button>
        </div>
        <div className="row" hidden={!exportUrl && !exportErr}>
          {exportErr ? <span className="err">{exportErr}</span> : null}
          {exportUrl ? (
            <a className="btn ok" href={exportUrl} download={exportName}>
              Download .xlsx
            </a>
          ) : null}
        </div>
      </div>
      <div className="list">{body}</div>
    </>
  );
}
