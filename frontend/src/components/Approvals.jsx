import { useState } from 'react';
import { api } from '../api';
import { fmtH, today, totals } from '../utils';
import { DayGroups } from './RequestCard';

export function Approvals({
  me,
  tok,
  reqs,
  onLoggedOut,
  onToast,
  onRefresh,
  onAction,
  busyId,
}) {
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState({});
  const [confirmAll, setConfirmAll] = useState(false);

  const mineReqs = reqs.filter((r) => r.approver === me);
  const pending = mineReqs
    .filter((r) => (r.status || 'pending') === 'pending')
    .sort((a, b) => a.otDate.localeCompare(b.otDate) || a.section.localeCompare(b.section));
  const approved = mineReqs
    .filter((r) => r.status === 'approved')
    .sort((a, b) => (b.decidedAt || b.otDate).localeCompare(a.decidedAt || a.otDate) || a.section.localeCompare(b.section));
  const mine = pending;

  async function approveAll() {
    if (confirmAll !== true) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
    setBusy(true);
    try {
      await api.decide(tok, mine.map((r) => r.id), 'approved', '');
      onToast(`Approved ${mine.length} requests`);
      await onRefresh();
    } catch (e) {
      if (/expired|Log in again/i.test(e.message)) onLoggedOut();
      onToast(e.message);
    } finally {
      setBusy(false);
    }
  }

  const todayIso = today();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row">
        <div>
          <h2>Waiting for approval</h2>
          <p className="sub">
            {pending.length
              ? `${pending.length} pending · ${fmtH(pending.reduce((sum, r) => sum + totals(r).est, 0))} hrs · ${approved.length} approved`
              : approved.length
                ? `Nothing waiting · ${approved.length} approved`
                : 'Nothing waiting for you.'}
          </p>
        </div>
        <span className="spacer" />
        <button className="btn" type="button" onClick={onRefresh}>
          Refresh
        </button>
        <button className="btn ok" type="button" hidden={mine.length < 2} disabled={busy} onClick={approveAll}>
          {confirmAll ? `Confirm: approve ${mine.length}` : `Approve all mine (${mine.length})`}
        </button>
      </div>
      <div className="list">
        {!pending.length ? (
          <div className="empty">
            <strong>No pending requests</strong>
            Requests sent to you appear here until you approve them.
          </div>
        ) : (
          <DayGroups
            list={pending}
            ctx="queue"
            me={me}
            todayIso={todayIso}
            busyId={busyId}
            remarkFor={(id) => remarks[id] || ''}
            onRemark={(id, value) => setRemarks((prev) => ({ ...prev, [id]: value }))}
            onAction={onAction}
          />
        )}
        {approved.length ? (
          <>
            <h2 style={{ marginTop: 8 }}>Approved</h2>
            <p className="sub">Requests you already approved. They also stay in Log and Reports.</p>
            <DayGroups list={approved} ctx="log" me={me} todayIso={todayIso} busyId={busyId} onAction={onAction} />
          </>
        ) : null}
      </div>
    </div>
  );
}
