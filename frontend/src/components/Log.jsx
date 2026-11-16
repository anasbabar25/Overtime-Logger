import { useState } from 'react';
import { addDays, today } from '../utils';
import { DayGroups } from './RequestCard';

export function Log({ cfg, reqs, me, busyId, onAction }) {
  const [from, setFrom] = useState(() => addDays(today(), -90));
  const [to, setTo] = useState(() => addDays(today(), 30));
  const [section, setSection] = useState('');
  const [status, setStatus] = useState('');
  const rows = reqs
    .filter((r) => (!from || r.otDate >= from) && (!to || r.otDate <= to) && (!section || r.section === section) && (!status || r.status === status))
    .sort((a, b) => b.otDate.localeCompare(a.otDate) || a.section.localeCompare(b.section));

  return (
    <>
      <div className="panel">
        <div className="grid">
          <label className="f">
            From
            <input type="date" value={from} onChange={(ev) => setFrom(ev.target.value)} />
          </label>
          <label className="f">
            To
            <input type="date" value={to} onChange={(ev) => setTo(ev.target.value)} />
          </label>
          <label className="f">
            Section
            <select value={section} onChange={(ev) => setSection(ev.target.value)}>
              <option value="">All sections</option>
              {cfg.sections.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="f">
            Status
            <select value={status} onChange={(ev) => setStatus(ev.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>
      </div>
      <div className="list">
        {rows.length ? (
          <DayGroups list={rows} ctx="log" me={me} todayIso={today()} busyId={busyId} onAction={onAction} />
        ) : (
          <div className="empty">
            <strong>No requests in this range</strong>
            Requests from the last two months show here. Older months are in Reports.
          </div>
        )}
      </div>
    </>
  );
}
