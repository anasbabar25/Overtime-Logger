import { useEffect, useState } from 'react';
import { fmtD, fmtH, num, sg, totals } from '../utils';

export function DayGroups({ list, todayIso, busyId, remarkFor, ...cardProps }) {
  const nodes = [];
  let last = '';
  for (const r of list) {
    if (r.otDate !== last) {
      nodes.push(
        <div className="day-h" key={`d-${cardProps.ctx}-${r.otDate}-${r.id}`}>
          {fmtD(r.otDate)}
          {r.otDate === todayIso ? ' · Today' : ''}
        </div>,
      );
      last = r.otDate;
    }
    nodes.push(
      <RequestCard
        key={r.id}
        r={r}
        todayIso={todayIso}
        busy={busyId === r.id}
        remark={remarkFor ? remarkFor(r.id) : ''}
        {...cardProps}
      />,
    );
  }
  return nodes;
}

export function RequestCard({ r, ctx, me, todayIso, busy, remark, onRemark, onAction }) {
  const st = r.status || 'pending';
  const t = totals(r);
  const editable = ctx === 'log' && st === 'approved' && r.otDate <= todayIso;
  const showAct = editable || t.hasAct;
  const [actuals, setActuals] = useState(() => r.employees.map((e) => (e.actual == null ? '' : e.actual)));
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const signature = `${r.status}|${r.decidedAt}|${r.employees.map((e) => e.actual ?? '').join(',')}`;

  useEffect(() => {
    setActuals(r.employees.map((e) => (e.actual == null ? '' : e.actual)));
    setConfirmWithdraw(false);
  }, [signature]);

  let foot = null;
  if (ctx === 'queue') {
    foot = (
      <div className="card-f">
        <input placeholder="Remark (optional)" value={remark || ''} onChange={(ev) => onRemark(r.id, ev.target.value)} />
        <button className="btn ok" type="button" disabled={busy} onClick={() => onAction('approved', r, remark || '')}>
          Approve
        </button>
        <button className="btn bad" type="button" disabled={busy} onClick={() => onAction('rejected', r, remark || '')}>
          Reject
        </button>
      </div>
    );
  } else {
    const buttons = [];
    if (editable) {
      buttons.push(
        <button
          className="btn"
          type="button"
          key="save"
          disabled={busy}
          onClick={() => onAction('saveact', r, actuals.map((v) => (v === '' ? null : num(v))))}
        >
          Save actual hours
        </button>,
      );
    }
    if (me && st !== 'pending') {
      buttons.push(
        <button className="btn link" type="button" key="back" disabled={busy} onClick={() => onAction('pending', r, '')}>
          Move back to pending
        </button>,
      );
    }
    if (st === 'pending') {
      buttons.push(
        <button
          className="btn link"
          type="button"
          key="withdraw"
          disabled={busy}
          onClick={() => {
            if (!confirmWithdraw) {
              setConfirmWithdraw(true);
              return;
            }
            onAction('withdraw', r);
          }}
        >
          {confirmWithdraw ? 'Tap again to withdraw' : 'Withdraw'}
        </button>,
      );
    }
    if (buttons.length) {
      foot = (
        <div className="card-f">
          <span className="spacer" />
          {buttons}
        </div>
      );
    }
  }

  const decided =
    st === 'pending' ? (
      <span className="meta">
        Sent {r.submittedAt} · waiting for {r.approver}
        {r.initiatorName ? ` · Initiator ${r.initiatorName}-${r.initiatorEmpNo}` : ''}
      </span>
    ) : (
      <span className="meta">
        <b>
          {st === 'approved' ? 'Approved' : 'Rejected'} by {r.decidedBy}
        </b>{' '}
        · {r.decidedAt}
        {r.decidedBy !== r.approver ? ` (sent to ${r.approver})` : ''}
        {r.initiatorName ? ` · Initiator ${r.initiatorName}-${r.initiatorEmpNo}` : ''}
      </span>
    );

  return (
    <article className={`card ${st}`}>
      <div className="card-h">
        <span className="sec">{r.section}</span>
        <span className="meta">{fmtD(r.otDate)}</span>
        {ctx === 'queue' && r.approver === me ? (
          <span className="mine">For you</span>
        ) : ctx === 'queue' ? (
          <span className="meta">For {r.approver}</span>
        ) : null}
        <span className="spacer" />
        <span className="meta">
          {r.initiatorName ? `${r.initiatorName}-${r.initiatorEmpNo} · ` : ''}
          {r.employees.length} emp · {fmtH(t.est)} hrs
        </span>
        <span className={`pill ${st}`}>{st}</span>
      </div>
      <div className="card-b">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Emp No</th>
                <th>Name</th>
                <th>Reason</th>
                <th className="n">Est.</th>
                {showAct && (
                  <>
                    <th className="n">Actual</th>
                    <th className="n">Delta</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {r.employees.map((e, i) => {
                const dl = e.actual != null ? num(e.actual) - num(e.est) : null;
                return (
                  <tr key={`${e.empId}-${i}`}>
                    <td className="n" style={{ textAlign: 'left' }}>
                      {e.empId}
                    </td>
                    <td>{e.name}</td>
                    <td>{e.reason}</td>
                    <td className="n">{fmtH(e.est)}</td>
                    {showAct && (
                      <>
                        <td className="n">
                          {editable ? (
                            <input
                              className="act"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max="24"
                              step="0.5"
                              value={actuals[i] ?? ''}
                              aria-label="Actual hours"
                              onChange={(ev) => setActuals((prev) => prev.map((v, idx) => (idx === i ? ev.target.value : v)))}
                            />
                          ) : (
                            fmtH(e.actual)
                          )}
                        </td>
                        <td className={`n ${dl > 0 ? 'pos' : dl < 0 ? 'neg' : ''}`}>{dl == null ? '–' : sg(dl)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="n">{fmtH(t.est)}</td>
                {showAct && (
                  <>
                    <td className="n">{t.hasAct ? fmtH(t.act) : '–'}</td>
                    <td className="n">{t.hasAct ? sg(t.act - t.est) : '–'}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
        {r.comments ? (
          <div className="note">
            <b>Comments</b>
            {r.comments}
          </div>
        ) : null}
        {r.remark ? (
          <div className="note">
            <b>Approver remark</b>
            {r.remark}
          </div>
        ) : null}
        {decided}
      </div>
      {foot}
    </article>
  );
}
