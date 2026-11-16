import { useState } from 'react';
import { api } from '../api';

export function Account({ tok, onAccountClose, onAuthed, onLoggedOut, onToast }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwErr, setPwErr] = useState('');

  async function submitPassword(ev) {
    ev.preventDefault();
    setPwErr('');
    if (!oldPw || !newPw) return setPwErr('Fill in all three fields.');
    if (newPw.length < 6) return setPwErr('New password must be at least 6 characters.');
    if (newPw !== newPw2) return setPwErr('The new passwords don’t match.');
    try {
      const result = await api.changePassword(tok, oldPw, newPw);
      setOldPw('');
      setNewPw('');
      setNewPw2('');
      onAccountClose();
      onAuthed(result.token, result.name, result.role);
      onToast('Password changed');
    } catch (e) {
      setPwErr(e.message);
    }
  }

  async function logout() {
    try {
      await api.logout(tok);
    } catch {
      /* still clear the local session */
    }
    onAccountClose();
    onLoggedOut();
    onToast('Logged out');
  }

  return (
    <form className="panel auth" onSubmit={submitPassword} noValidate>
      <div>
        <h2>Change password</h2>
        <p className="sub">Changing it logs you out on your other phones. Forgotten passwords can be reset from the Log in tab with the setup code.</p>
      </div>
      <label className="f">
        Current password
        <input type="password" autoComplete="current-password" value={oldPw} onChange={(ev) => setOldPw(ev.target.value)} />
      </label>
      <label className="f">
        New password (6+ characters)
        <input type="password" autoComplete="new-password" value={newPw} onChange={(ev) => setNewPw(ev.target.value)} />
      </label>
      <label className="f">
        Confirm new password
        <input type="password" autoComplete="new-password" value={newPw2} onChange={(ev) => setNewPw2(ev.target.value)} />
      </label>
      <div className="err" hidden={!pwErr}>
        {pwErr}
      </div>
      <div className="row">
        <button className="btn primary" type="submit">
          Change password
        </button>
        <button className="btn" type="button" onClick={onAccountClose}>
          Cancel
        </button>
        <span className="spacer" />
        <button className="btn bad" type="button" onClick={logout}>
          Log out
        </button>
      </div>
    </form>
  );
}
