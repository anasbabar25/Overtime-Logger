import { useMemo, useRef, useState } from 'react';
import { fmtH, norm, num, store, today } from '../utils';

let rowKey = 1;

export function empLabel(e) {
  return e ? `${e[1]}-${e[0]}` : '';
}

function matches(employees, query) {
  const q = norm(query);
  return employees
    .filter((e) => !q || norm(e[1]).includes(q) || String(e[0]).includes(q) || norm(empLabel(e)).includes(q))
    .sort((a, b) => a[2].localeCompare(b[2]) || a[1].localeCompare(b[1]));
}

function EmployeeCombo({ label, placeholder, employees, empId, query, onPick, onQuery }) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((e) => e[0] === empId);
  const effective = selected && (query === selected[1] || query === empLabel(selected)) ? '' : query;
  const list = useMemo(() => matches(employees, effective), [employees, effective]);

  function pick(id) {
    const emp = employees.find((e) => e[0] === id);
    onPick(emp || null);
    setOpen(false);
  }

  let lastGroup = null;
  return (
    <div className="f en combo">
      {label}
      <input
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={label}
        value={query}
        onFocus={(ev) => {
          ev.target.select();
          setOpen(true);
        }}
        onChange={(ev) => {
          onQuery(ev.target.value);
          setOpen(true);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            if (list[0]) pick(list[0][0]);
          } else if (ev.key === 'Escape') setOpen(false);
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            if (!empId && query) {
              const found = matches(employees, query);
              const exact = found.filter((e) => norm(e[1]) === norm(query) || e[0] === query.trim() || norm(empLabel(e)) === norm(query));
              const hit = exact[0] || (found.length === 1 ? found[0] : null);
              if (hit && (exact.length === 1 || found.length === 1)) pick(hit[0]);
            }
          }, 180);
        }}
      />
      <div
        className="opts"
        hidden={!open}
        onPointerDown={(ev) => ev.preventDefault()}
        onClick={(ev) => {
          const btn = ev.target.closest('.opt');
          if (btn) pick(btn.dataset.emp);
        }}
      >
        <div className="oh">
          {list.length} of {employees.length} employees
          {query ? '' : ' · type a name or Emp No to search'}
        </div>
        {list.flatMap((e) => {
          const group = e[2] || 'Other sections';
          const header = group !== lastGroup;
          lastGroup = group;
          const option = (
            <button type="button" className="opt" data-emp={e[0]} key={e[0]}>
              <span>{empLabel(e)}</span>
              <small>{e[2]}</small>
            </button>
          );
          return header ? [<div className="og" key={`g-${group}`}>{group}</div>, option] : [option];
        })}
        {!list.length ? <div className="oh">No employee matches “{query}”.</div> : null}
      </div>
    </div>
  );
}

function EmpRow({ row, employees, reasons, canRemove, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef(row);
  const onChangeRef = useRef(onChange);
  rowRef.current = row;
  onChangeRef.current = onChange;
  const selected = employees.find((e) => e[0] === row.empId);
  const effective = selected && row.query === selected[1] ? '' : row.query;
  const list = useMemo(() => matches(employees, effective), [employees, effective]);

  function pick(id) {
    const emp = employees.find((e) => e[0] === id);
    const current = rowRef.current;
    onChangeRef.current({
      ...current,
      empId: emp ? emp[0] : '',
      query: emp ? emp[1] : current.query,
      section: emp ? emp[2] : '',
    });
    setOpen(false);
  }

  let lastGroup = null;
  return (
    <div className="emp">
      <div className="f en combo">
        Employee
        <input
          type="text"
          autoComplete="off"
          placeholder="Type name or Emp No"
          aria-label="Employee"
          value={row.query}
          onFocus={(ev) => {
            ev.target.select();
            setOpen(true);
          }}
          onChange={(ev) => {
            onChange({ ...row, empId: '', query: ev.target.value, section: '' });
            setOpen(true);
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              if (list[0]) pick(list[0][0]);
            } else if (ev.key === 'Escape') setOpen(false);
          }}
          onBlur={() => {
            setTimeout(() => {
              setOpen(false);
              const current = rowRef.current;
              if (!current.empId && current.query) {
                const found = matches(employees, current.query);
                const exact = found.filter((e) => norm(e[1]) === norm(current.query) || e[0] === current.query.trim());
                const hit = exact[0] || (found.length === 1 ? found[0] : null);
                if (hit && (exact.length === 1 || found.length === 1)) pick(hit[0]);
              }
            }, 180);
          }}
        />
        <div className="opts" hidden={!open} onPointerDown={(ev) => ev.preventDefault()} onClick={(ev) => {
          const btn = ev.target.closest('.opt');
          if (btn) pick(btn.dataset.emp);
        }}>
          <div className="oh">
            {list.length} of {employees.length} employees
            {row.query ? '' : ' · type a name or Emp No to search'}
          </div>
          {list.flatMap((e) => {
            const group = e[2] || 'Other sections';
            const header = group !== lastGroup;
            lastGroup = group;
            const option = (
              <button type="button" className="opt" data-emp={e[0]} key={e[0]}>
                <span>{e[1]}</span>
                <small>
                  {e[0]} · {e[2]}
                </small>
              </button>
            );
            return header ? [<div className="og" key={`g-${group}`}>{group}</div>, option] : [option];
          })}
          {!list.length ? <div className="oh">No employee matches “{row.query}”.</div> : null}
        </div>
      </div>
      <label className="f no">
        Emp No
        <input className="empno" readOnly tabIndex={-1} value={row.empId} />
      </label>
      <label className="f se">
        Section
        <input className="empno" readOnly tabIndex={-1} value={row.section} />
      </label>
      <label className="f">
        Est. hrs
        <input
          type="number"
          inputMode="decimal"
          min="0.5"
          max="16"
          step="0.5"
          value={row.est}
          onChange={(ev) => onChange({ ...row, est: ev.target.value })}
        />
      </label>
      <label className="f rs">
        Reason
        <select value={row.reason} onChange={(ev) => onChange({ ...row, reason: ev.target.value })}>
          <option value="" disabled>
            Choose…
          </option>
          {reasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn x" aria-label="Remove employee" onClick={() => canRemove && onRemove()}>
        ✕
      </button>
    </div>
  );
}

export function NewRequest({ cfg, pin, setPin, onSubmit }) {
  const [otDate, setOtDate] = useState(today());
  const [approver, setApprover] = useState(() => {
    const saved = store.get('ot.apr');
    return cfg.approvers.includes(saved) ? saved : '';
  });
  const [initiatorEmpNo, setInitiatorEmpNo] = useState(() => store.get('ot.initiator') || '');
  const [initiatorQuery, setInitiatorQuery] = useState(() => {
    const id = store.get('ot.initiator');
    const emp = cfg.employees.find((e) => e[0] === id);
    return emp ? empLabel(emp) : '';
  });
  const [comments, setComments] = useState('');
  const [rows, setRows] = useState(() => [{ key: rowKey++, empId: '', query: '', section: '', est: '4', reason: '' }]);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);

  const total = rows.reduce((sum, row) => sum + num(row.est), 0);
  const empMap = useMemo(() => new Map(cfg.employees.map((e) => [e[0], e])), [cfg.employees]);

  function updateRow(next) {
    setRows((prev) => prev.map((row) => (row.key === next.key ? next : row)));
  }

  async function submit(ev) {
    ev.preventDefault();
    setErr('');
    const bad = (m) => setErr(m);
    const employees = rows.map((row) => ({
      empId: row.empId,
      name: empMap.get(row.empId)?.[1] || '',
      section: empMap.get(row.empId)?.[2] || row.section || '',
      typed: row.query.trim(),
      est: num(row.est),
      reason: row.reason,
    }));
    const payload = {
      otDate,
      section: employees[0]?.section || '',
      approver,
      initiatorEmpNo,
      comments: comments.trim(),
      employees,
    };
    if (!payload.otDate) return bad('Pick the date of OT.');
    if (!payload.approver) return bad('Pick the approver.');
    if (!payload.initiatorEmpNo) return bad('Pick the initiator name.');
    const seen = new Set();
    for (const [k, e] of payload.employees.entries()) {
      if (!e.empId) {
        return bad(
          e.typed
            ? `Employee ${k + 1}: “${e.typed}” isn’t in the list. Tap a name from the suggestions.`
            : `Employee ${k + 1}: choose a name.`,
        );
      }
      if (seen.has(e.empId)) return bad(`${e.name} is listed twice.`);
      seen.add(e.empId);
      if (!(e.est > 0 && e.est <= 16)) return bad(`${e.name}: hours must be 0.5 to 16.`);
      if (!e.reason) return bad(`${e.name}: choose a reason.`);
    }
    if (cfg.staffPinRequired && !pin) return bad('Enter the supervisor PIN.');
    setSending(true);
    try {
      await onSubmit(payload, pin);
      store.set('ot.initiator', initiatorEmpNo);
      setRows([{ key: rowKey++, empId: '', query: '', section: '', est: '4', reason: '' }]);
      setComments('');
      setOtDate(today());
      setErr('');
    } catch (e) {
      bad(e.message || 'Couldn’t send. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div>
        <h2>Overtime pre-approval request</h2>
        <p className="sub">Fill before the OT is worked. Enter actual hours next day from the Log.</p>
      </div>
      <div className="grid">
        <label className="f">
          Date of OT
          <input type="date" value={otDate} onChange={(ev) => setOtDate(ev.target.value)} />
        </label>
        <EmployeeCombo
          label="Initiator Name"
          placeholder="Type name or Emp No"
          employees={cfg.employees}
          empId={initiatorEmpNo}
          query={initiatorQuery}
          onPick={(emp) => {
            setInitiatorEmpNo(emp ? emp[0] : '');
            setInitiatorQuery(emp ? empLabel(emp) : '');
          }}
          onQuery={(value) => {
            setInitiatorEmpNo('');
            setInitiatorQuery(value);
          }}
        />
        <label className="f">
          Approver
          <select value={approver} onChange={(ev) => setApprover(ev.target.value)}>
            <option value="" disabled>
              Choose…
            </option>
            {cfg.approvers.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="f" hidden={!cfg.staffPinRequired}>
          Supervisor PIN
          <input type="password" inputMode="numeric" value={pin} onChange={(ev) => setPin(ev.target.value)} />
        </label>
      </div>
      <div className="emps">
        {rows.map((row) => (
          <EmpRow
            key={row.key}
            row={row}
            employees={cfg.employees}
            reasons={cfg.reasons}
            canRemove={rows.length > 1}
            onChange={updateRow}
            onRemove={() => {
              if (rows.length > 1) setRows((prev) => prev.filter((item) => item.key !== row.key));
            }}
          />
        ))}
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => setRows((prev) => [...prev, { key: rowKey++, empId: '', query: '', section: '', est: '4', reason: prev.at(-1)?.reason || '' }])}
        >
          + Add employee
        </button>
        <span className="spacer" />
        <span className="meta">
          Total {fmtH(total)} hrs · {rows.length} employee{rows.length > 1 ? 's' : ''}
        </span>
      </div>
      <label className="f">
        Comments
        <textarea
          value={comments}
          placeholder="Machine, order no., who is absent, anything the approver should know"
          onChange={(ev) => setComments(ev.target.value)}
        />
      </label>
      <div className="err" hidden={!err}>
        {err}
      </div>
      <div className="row end">
        <button type="submit" className="btn primary" disabled={sending} style={{ flex: 1, maxWidth: 320 }}>
          {sending ? 'Sending…' : 'Send for approval'}
        </button>
      </div>
    </form>
  );
}
