import { useState } from 'react';
import { api } from '../api';

export function Employees({ cfg, isPower, tok, onImported, onToast }) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [uploadErr, setUploadErr] = useState('');

  async function upload(ev) {
    ev.preventDefault();
    const file = ev.target.file?.files?.[0];
    setUploadErr('');
    if (!isPower) return setUploadErr('Log in as the power user to upload the employee list.');
    if (!file) return setUploadErr('Choose an Excel file (.xlsx).');
    setBusy(true);
    try {
      const result = await api.importEmployees(tok, file);
      onToast(`Saved ${result.count} employees`);
      setFileName('');
      ev.target.reset();
      await onImported();
    } catch (e) {
      setUploadErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const sections = [...new Set((cfg.employees || []).map((e) => e[2]).filter(Boolean))].sort();

  return (
    <>
      <form className="panel" onSubmit={upload}>
        <div>
          <h2>Employee list</h2>
          <p className="sub">Upload an Excel file with columns EMPLOY, NAME, SECTION. This replaces the current list and is used in the employee search.</p>
        </div>
        <div className="row">
          <input
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(ev) => setFileName(ev.target.files?.[0]?.name || '')}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload and save'}
          </button>
        </div>
        {fileName ? <p className="sub">{fileName}</p> : null}
        <div className="err" hidden={!uploadErr}>
          {uploadErr}
        </div>
      </form>

      <div className="panel">
        <div>
          <h2>{cfg.employees?.length || 0} employees</h2>
          <p className="sub">{sections.length} sections in the current list</p>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th className="n">People</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec) => (
                <tr key={sec}>
                  <td>{sec}</td>
                  <td className="n">{cfg.employees.filter((e) => e[2] === sec).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
