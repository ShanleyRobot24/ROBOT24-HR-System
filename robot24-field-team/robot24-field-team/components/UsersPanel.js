'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';
import { callApi } from '@/lib/api';
import Drawer from './Drawer';
import RowMenu from './RowMenu';

const ACCESS = [
  ['production', 'Production and assignments', 'Directory, assignments, and flights, trains and hotels. No rates, bills or bank details.'],
  ['hr_finance', 'HR and finance', 'Everything above, plus invoices, bills, payments, documents and reports.'],
  ['admin', 'Admin', 'Everything, plus editing personnel, managing users and the audit trail.'],
];
const accessName = (r) => (ACCESS.find(([k]) => k === r) || ACCESS[0])[1];

function welcome({ name, email, password, link, reset }) {
  const first = (name || '').trim().split(' ')[0];
  return `Hi${first ? ` ${first}` : ''},

${reset ? 'Your password for the Robot24 Field Team app has been reset.' : 'You now have access to the Robot24 Field Team app.'}

Sign in here: ${link}
Email: ${email}
Temporary password: ${password}

Once signed in, click "Password" at the top to choose your own.

Robot24`;
}

function Credentials({ result, onDone }) {
  const [copied, setCopied] = useState(false);
  const text = welcome(result);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="cred">
      <p className="cred-ok">{result.reset ? 'Password reset' : 'Account created'} for <strong>{result.email}</strong>. Send them this message:</p>
      <pre className="cred-msg">{text}</pre>
      <div className="drawer-actions">
        <a className="btn" href={`mailto:${result.email}?subject=${encodeURIComponent('Your Robot24 Field Team login')}&body=${encodeURIComponent(text)}`}>Email it</a>
        <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy message'}</button>
        <span className="spacer" />
        <button className="btn primary" onClick={onDone}>Done</button>
      </div>
      <p className="hint">The password is only shown now. If it gets lost, use Reset password.</p>
    </div>
  );
}

export default function UsersPanel({ users, reload }) {
  const { profile: me } = useAuth();
  const [status, setStatus] = useState({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'production', isApprover: false });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const link = typeof window !== 'undefined' ? window.location.origin : '';

  const loadStatus = useCallback(async () => {
    try {
      const out = await callApi('/api/admin-users', { action: 'list' });
      setStatus(Object.fromEntries(out.users.map((u) => [u.id, u])));
    } catch { /* sign-in status is optional */ }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus, users]);

  async function update(u, patch) {
    if (u.id === me.id && patch.role && patch.role !== 'admin' && !confirm('Remove your own admin access? You will not be able to undo this yourself.')) return;
    const { error } = await supabase.from('profiles').update(patch).eq('id', u.id);
    if (error) alert(error.message);
    reload();
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const out = await callApi('/api/admin-users', { action: 'create', ...form });
      setResult({ name: form.fullName, email: out.email, password: out.password, link });
      reload();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function act(u, action) {
    const name = u.full_name || u.email;
    if (action === 'remove' && !confirm(`Remove ${name}'s access? They will no longer be able to sign in. Everything they did stays in the records and audit trail. You can restore access later.`)) return;
    if (action === 'reset' && !confirm(`Reset ${name}'s password? Their old password stops working straight away.`)) return;
    try {
      const out = await callApi('/api/admin-users', { action, userId: u.id });
      if (action === 'reset') { setResult({ name: u.full_name, email: out.email, password: out.password, link, reset: true }); setAdding(true); }
      reload();
      loadStatus();
    } catch (err) { alert(err.message); }
  }

  function close() {
    setAdding(false); setResult(null); setError('');
    setForm({ fullName: '', email: '', role: 'production', isApprover: false });
  }

  const sorted = [...users].sort((a, b) => Number(!!status[a.id]?.removed) - Number(!!status[b.id]?.removed) || (a.full_name || a.email).localeCompare(b.full_name || b.email));

  return (
    <>
      <div className="toolbar">
        <p className="hint" style={{ margin: 0 }}>{users.length} user{users.length === 1 ? '' : 's'}. Change access or the approver tick right in the list.</p>
        <span className="spacer" />
        <button className="btn primary" onClick={() => { setResult(null); setAdding(true); }}>+ Add user</button>
      </div>

      <div className="table-wrap">
        <table className="users-table">
          <thead><tr><th>Name</th><th>Access</th><th>Approver</th><th>Last signed in</th><th></th></tr></thead>
          <tbody>
            {sorted.map((u) => {
              const st = status[u.id] || {};
              const self = u.id === me?.id;
              return (
                <tr key={u.id} className={`no-hover ${st.removed ? 'inactive' : ''}`}>
                  <td>
                    <input className="name-input" defaultValue={u.full_name || ''} placeholder="Add a name" onBlur={(e) => e.target.value !== (u.full_name || '') && update(u, { full_name: e.target.value || null })} />
                    <span className="sub2">{u.email}{self ? ', you' : ''}</span>
                  </td>
                  <td>
                    {st.removed ? <span className="chip alert">Access removed</span> : (
                      <select value={u.role === 'assignments' ? 'production' : u.role} onChange={(e) => update(u, { role: e.target.value })}>
                        {ACCESS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    )}
                  </td>
                  <td><label className="check"><input type="checkbox" checked={!!u.is_approver} disabled={st.removed} onChange={(e) => update(u, { is_approver: e.target.checked })} /> Approves bills</label></td>
                  <td className="nowrap">{st.last_sign_in_at ? new Date(st.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <span className="muted">Never</span>}</td>
                  <td className="actions">
                    {st.removed ? <button className="btn sm" onClick={() => act(u, 'restore')}>Restore access</button> : <>
                      <RowMenu items={[{ label: 'Reset password', onClick: () => act(u, 'reset') }, !self && { label: 'Remove access', onClick: () => act(u, 'remove'), danger: true }]} />
                    </>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && (
        <Drawer title={result ? (result.reset ? 'New password' : 'User added') : 'Add a user'} onClose={close}>
          {result ? <Credentials result={result} onDone={close} /> : (
            <form className="add-user" onSubmit={create}>
              <label>Full name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Raveena Ganiga" autoFocus /></label>
              <label>Work email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@robot24.com" /></label>
              <fieldset className="access-choice">
                <legend>What can they do?</legend>
                {ACCESS.map(([k, label, text]) => (
                  <label key={k} className={`access-card ${form.role === k ? 'on' : ''}`}>
                    <input type="radio" name="role" value={k} checked={form.role === k} onChange={() => setForm({ ...form, role: k })} />
                    <span><strong>{label}</strong><span className="sub2">{text}</span></span>
                  </label>
                ))}
              </fieldset>
              <label className="check approver-tick"><input type="checkbox" checked={form.isApprover} onChange={(e) => setForm({ ...form, isApprover: e.target.checked })} /> Can approve bills</label>
              {error && <p className="err">{error}</p>}
              <div className="drawer-actions">
                <span className="hint">A temporary password is created for you.</span>
                <span className="spacer" />
                <button className="btn primary" disabled={busy}>{busy ? 'Creating' : 'Create user'}</button>
              </div>
            </form>
          )}
        </Drawer>
      )}
    </>
  );
}

export { accessName };
