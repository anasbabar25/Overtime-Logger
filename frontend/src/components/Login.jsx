import { useEffect, useState } from 'react';
import { api } from '../api';
import { store } from '../utils';

const POWER_NAME = 'Power User';

export function Login({ cfg, pwStatus, powerStatus, onToast, onApproverAuthed, onPowerAuthed }) {
  return (
    <div className="two">
      <ApproverLogin cfg={cfg} pwStatus={pwStatus} onToast={onToast} onAuthed={onApproverAuthed} />
      <PowerLogin powerStatus={powerStatus} onToast={onToast} onAuthed={onPowerAuthed} />
    </div>
  );
}

function ApproverLogin({ cfg, pwStatus, onToast, onAuthed }) {
  const [authMode, setAuthMode] = useState('login');
  const [name, setName] = useState(() => {
    const saved = store.get('ot.approver');
    return cfg.approvers.includes(saved) ? saved : '';
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const creating = authMode === 'create';

  function switchMode() {
    setAuthMode(creating ? 'login' : 'create');
    setErr('');
  }

  function chooseName(next) {
    setName(next);
    const st = pwStatus.find((x) => x.name === next);
    if (st && !st.hasPassword && authMode === 'login') {
      setAuthMode('create');
      setErr(`${st.name} has no password yet. Create one with the setup code.`);
    }
  }

  async function submit(ev) {
    ev.preventDefault();
    setErr('');
    if (!name) return setErr('Choose your name.');
    if (!password) return setErr('Enter the password.');
    if (creating) {
      if (!code) return setErr('Enter the setup code.');
      if (password.length < 6) return setErr('Password must be at least 6 characters.');
      if (password !== confirm) return setErr('The two passwords don’t match.');
    }
    setBusy(true);
    try {
      const result = creating ? await api.createPassword(name, code, password) : await api.login(name, password);
      setPassword('');
      setConfirm('');
      setCode('');
      setAuthMode('login');
      onToast(`Logged in as ${result.name}`);
      onAuthed(result.token, result.name, result.role || 'approver');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel auth" onSubmit={submit} noValidate>
      <div>
        <h2>{creating ? 'Create or reset password' : 'Approver login'}</h2>
        <p className="sub">
          {creating
            ? 'Needs the setup code from the app’s settings. Use this the first time, or if a password is forgotten.'
            : 'Approvals are password protected. Your login is remembered on this phone for 30 days.'}
        </p>
      </div>
      <label className="f">
        Approver
        <select value={name} onChange={(ev) => chooseName(ev.target.value)}>
          <option value="" disabled>
            Choose…
          </option>
          {cfg.approvers.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className="f" hidden={!creating}>
        Setup code
        <input type="password" autoComplete="off" value={code} onChange={(ev) => setCode(ev.target.value)} />
      </label>
      <label className="f">
        <span>{creating ? 'New password (6+ characters)' : 'Password'}</span>
        <input
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
        />
      </label>
      <label className="f" hidden={!creating}>
        Confirm new password
        <input type="password" autoComplete="new-password" value={confirm} onChange={(ev) => setConfirm(ev.target.value)} />
      </label>
      <div className="err" hidden={!err}>
        {err}
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>
          {creating ? 'Save password and log in' : 'Log in'}
        </button>
        <span className="spacer" />
        <button className="btn link" type="button" onClick={switchMode}>
          {creating ? 'Back to login' : 'Create or reset password'}
        </button>
      </div>
    </form>
  );
}

function PowerLogin({ powerStatus, onToast, onAuthed }) {
  const [authMode, setAuthMode] = useState('login');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const creating = authMode === 'create';
  const hasPassword = !!powerStatus?.hasPassword;

  useEffect(() => {
    if (powerStatus && !powerStatus.hasPassword) setAuthMode('create');
  }, [powerStatus]);

  function switchMode() {
    setAuthMode(creating ? 'login' : 'create');
    setErr('');
  }

  async function submit(ev) {
    ev.preventDefault();
    setErr('');
    if (!password) return setErr('Enter the password.');
    if (creating) {
      if (!code) return setErr('Enter the setup code.');
      if (password.length < 6) return setErr('Password must be at least 6 characters.');
      if (password !== confirm) return setErr('The two passwords don’t match.');
    }
    setBusy(true);
    try {
      const result = creating
        ? await api.createPassword(POWER_NAME, code, password)
        : await api.login(POWER_NAME, password);
      setPassword('');
      setConfirm('');
      setCode('');
      setAuthMode('login');
      onToast(`Logged in as ${result.name}`);
      onAuthed(result.token, result.name, result.role || 'power');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel auth" onSubmit={submit} noValidate>
      <div>
        <h2>{creating ? 'Create or reset password' : 'Power user login'}</h2>
        <p className="sub">
          {creating
            ? 'Needs the setup code from the app’s settings. Use this the first time, or if a password is forgotten.'
            : 'Only the power user can upload the employee list. Login is remembered on this phone for 30 days.'}
        </p>
      </div>
      <label className="f" hidden={!creating}>
        Setup code
        <input type="password" autoComplete="off" value={code} onChange={(ev) => setCode(ev.target.value)} />
      </label>
      <label className="f">
        <span>{creating ? 'New password (6+ characters)' : 'Password'}</span>
        <input
          type="password"
          autoComplete={creating ? 'new-password' : 'current-password'}
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
        />
      </label>
      <label className="f" hidden={!creating}>
        Confirm new password
        <input type="password" autoComplete="new-password" value={confirm} onChange={(ev) => setConfirm(ev.target.value)} />
      </label>
      <div className="err" hidden={!err}>
        {err}
      </div>
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy}>
          {creating ? 'Save password and log in' : 'Log in'}
        </button>
        <span className="spacer" />
        <button className="btn link" type="button" onClick={switchMode} hidden={!hasPassword && creating}>
          {creating ? 'Back to login' : 'Create or reset password'}
        </button>
      </div>
    </form>
  );
}
