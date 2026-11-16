import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Account } from './components/Account';
import { Approvals } from './components/Approvals';
import { Employees } from './components/Employees';
import { Log } from './components/Log';
import { Login } from './components/Login';
import { NewRequest } from './components/NewRequest';
import { Reports } from './components/Reports';
import { addDays, fmtD, store, today } from './utils';

const TABS = ['new', 'queue', 'log', 'report', 'employees', 'login'];

export default function App() {
  const [cfg, setCfg] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [me, setMe] = useState(null);
  const [role, setRole] = useState(null);
  const [tok, setTok] = useState(null);
  const [tab, setTabState] = useState('new');
  const [ready, setReady] = useState(false);
  const [pwStatus, setPwStatus] = useState([]);
  const [powerStatus, setPowerStatus] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [pin, setPin] = useState(() => store.get('ot.pin') || '');
  const [busyId, setBusyId] = useState(null);
  const toastTimer = useRef(null);
  const loadingRef = useRef(false);
  const bootedLoad = useRef(false);
  const meRef = useRef(null);
  const tabRef = useRef('new');
  meRef.current = me;
  tabRef.current = tab;

  const isPower = role === 'power';
  const isApprover = role === 'approver';
  const approverMe = isApprover ? me : null;
  const approverTok = isApprover ? tok : null;

  function showToast(message) {
    setToastMsg(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }

  async function load() {
    if (loadingRef.current) {
      loadingRef.pending = true;
      return;
    }
    loadingRef.current = true;
    try {
      do {
        loadingRef.pending = false;
        setReqs(await api.getRequests(addDays(today(), -730), addDays(today(), 90)));
      } while (loadingRef.pending);
    } catch (e) {
      showToast(`Couldn’t load requests: ${e.message}`);
    } finally {
      loadingRef.current = false;
    }
  }

  function setAuth(token, name, nextRole) {
    setTok(token);
    setMe(name);
    setRole(name ? nextRole || null : null);
    store.set('ot.tok', token);
    if (name) store.set('ot.approver', name);
    else store.set('ot.approver', '');
    store.set('ot.role', name ? nextRole || '' : '');
    if (!name) setAccountOpen(false);
  }

  function setTab(next) {
    setTabState(next);
    store.set('ot.tab', next);
  }

  function allowedTabs(nextRole) {
    return TABS.filter((id) => {
      if (id === 'employees') return nextRole === 'power';
      if (id === 'queue') return nextRole === 'approver';
      if (id === 'login') return !nextRole;
      return true;
    });
  }

  function visibleTabs() {
    const tabs = [
      ['new', 'New request'],
      ['log', 'Log'],
      ['report', 'Reports'],
    ];
    if (isApprover) tabs.splice(1, 0, ['queue', 'Approvals']);
    if (isPower) tabs.push(['employees', 'Employees']);
    if (!isApprover && !isPower) tabs.push(['login', 'Log in']);
    return tabs;
  }

  useEffect(() => {
    let cancel = false;
    (async () => {
      let config = null;
      try {
        config = await api.getConfig();
        if (!cancel) setCfg(config);
      } catch (e) {
        if (!cancel) showToast(`Couldn’t load settings: ${e.message}`);
      }
      const token = store.get('ot.tok');
      let name = null;
      let nextRole = null;
      if (token) {
        try {
          const who = await api.whoAmI(token);
          name = who.name;
          nextRole = who.role || null;
        } catch {
          name = null;
        }
      }
      if (cancel) return;
      setAuth(name ? token : null, name, nextRole);
      api.approverStatus().then((rows) => {
        if (!cancel) setPwStatus(rows);
      }).catch(() => {});
      api.powerStatus().then((row) => {
        if (!cancel) setPowerStatus(row);
      }).catch(() => {});
      const saved = store.get('ot.tab');
      const allowed = allowedTabs(nextRole);
      const fallback = name && nextRole === 'approver' ? 'queue' : name && nextRole === 'power' ? 'employees' : 'new';
      const next = allowed.includes(saved) ? saved : saved === 'approver' || saved === 'power' ? 'login' : fallback;
      setTab(next);
      setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!bootedLoad.current) {
      bootedLoad.current = true;
      load();
      return;
    }
    if (tab === 'queue' || tab === 'log') load();
  }, [ready, tab]);

  useEffect(() => {
    if (!ready) return undefined;
    const onVis = () => {
      if (!document.hidden && (tabRef.current === 'queue' || tabRef.current === 'log')) load();
    };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(() => {
      if (!document.hidden && tabRef.current === 'queue' && meRef.current) load();
    }, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
    };
  }, [ready]);

  async function submit(payload, pinValue) {
    await api.submitRequest(payload, pinValue);
    store.set('ot.apr', payload.approver);
    if (pinValue) store.set('ot.pin', pinValue);
    showToast(`Sent to ${payload.approver}: ${payload.section}, ${fmtD(payload.otDate)}`);
    await load();
    setTab('log');
  }

  async function onAction(act, r, extra) {
    setBusyId(r.id);
    try {
      if (act === 'approved' || act === 'rejected' || act === 'pending') {
        await api.decide(tok, [r.id], act, extra || '');
        showToast(act === 'pending' ? 'Moved back to pending' : act === 'approved' ? 'Approved' : 'Rejected');
      } else if (act === 'withdraw') {
        await api.withdraw(r.id, pin, tok);
        showToast('Request withdrawn');
      } else if (act === 'saveact') {
        await api.saveActuals(r.id, extra, pin, tok);
        showToast('Actual hours saved');
      }
      await load();
    } catch (e) {
      if (/expired|Log in again/i.test(e.message)) {
        setAuth(null, null, null);
        setTab('login');
      }
      showToast(e.message);
    } finally {
      setBusyId(null);
    }
  }

  function onAuthFail(e) {
    if (/expired|Log in again/i.test(e.message)) {
      setAuth(null, null, null);
      setTab('login');
    }
    showToast(e.message);
  }

  const pending = reqs.filter((r) => (r.status || 'pending') === 'pending');
  const badge = approverMe ? pending.filter((r) => r.approver === approverMe).length : 0;
  const loggedIn = isApprover || isPower;

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <h1>OT Approvals</h1>
            <span>Overtime pre-approval · Operations</span>
          </div>
          {loggedIn ? (
            <button className="role" type="button" onClick={() => setAccountOpen((open) => !open)}>
              {isPower ? 'Power User · Account' : `${me} · Account`}
            </button>
          ) : null}
        </div>
      </header>
      <nav className="tabs">
        <div className="wrap" role="tablist">
          {visibleTabs().map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={!accountOpen && tab === id}
              onClick={() => {
                setAccountOpen(false);
                setTab(id);
              }}
            >
              {label}{' '}
              {id === 'queue' ? (
                <span className="count" hidden={!badge}>
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>
      <main>
        <div className="wrap">
          {!cfg ? (
            <p className="loading">Loading…</p>
          ) : (
            <>
              <section id="tab-account" hidden={!accountOpen || !loggedIn}>
                <Account
                  tok={tok}
                  onAccountClose={() => setAccountOpen(false)}
                  onAuthed={(token, name, nextRole) => {
                    setAuth(token, name, nextRole);
                    if (nextRole === 'power') api.powerStatus().then(setPowerStatus).catch(() => {});
                    else api.approverStatus().then(setPwStatus).catch(() => {});
                  }}
                  onLoggedOut={() => {
                    setAuth(null, null, null);
                    setTab('login');
                  }}
                  onToast={showToast}
                />
              </section>
              <section id="tab-new" hidden={accountOpen || tab !== 'new'}>
                <NewRequest cfg={cfg} pin={pin} setPin={setPin} onSubmit={submit} />
              </section>
              <section id="tab-login" hidden={accountOpen || tab !== 'login' || loggedIn}>
                <Login
                  cfg={cfg}
                  pwStatus={pwStatus}
                  powerStatus={powerStatus}
                  onToast={showToast}
                  onApproverAuthed={(token, name, nextRole) => {
                    setAuth(token, name, nextRole || 'approver');
                    api.approverStatus().then(setPwStatus).catch(() => {});
                    setTab('queue');
                    load();
                  }}
                  onPowerAuthed={(token, name, nextRole) => {
                    setAuth(token, name, nextRole || 'power');
                    api.powerStatus().then(setPowerStatus).catch(() => {});
                    setTab('employees');
                    api.getConfig().then(setCfg).catch(() => {});
                  }}
                />
              </section>
              <section id="tab-queue" hidden={accountOpen || tab !== 'queue' || !isApprover}>
                <Approvals
                  me={approverMe}
                  tok={approverTok}
                  reqs={reqs}
                  onLoggedOut={() => {
                    setAuth(null, null, null);
                    setTab('login');
                  }}
                  onToast={showToast}
                  onRefresh={load}
                  onAction={onAction}
                  busyId={busyId}
                />
              </section>
              <section id="tab-log" hidden={accountOpen || tab !== 'log'}>
                <Log cfg={cfg} reqs={reqs} me={approverMe} busyId={busyId} onAction={onAction} />
              </section>
              <section id="tab-report" hidden={accountOpen || tab !== 'report'}>
                <Reports cfg={cfg} tab={tab} me={loggedIn ? me : null} tok={loggedIn ? tok : null} onAuthFail={onAuthFail} />
              </section>
              <section id="tab-employees" hidden={accountOpen || tab !== 'employees' || !isPower}>
                <Employees
                  cfg={cfg}
                  isPower={isPower}
                  tok={isPower ? tok : null}
                  onToast={showToast}
                  onImported={async () => {
                    try {
                      setCfg(await api.getConfig());
                    } catch (e) {
                      showToast(e.message);
                    }
                  }}
                />
              </section>
            </>
          )}
        </div>
      </main>
      <div className="toast" hidden={!toastMsg}>
        {toastMsg}
      </div>
    </>
  );
}
