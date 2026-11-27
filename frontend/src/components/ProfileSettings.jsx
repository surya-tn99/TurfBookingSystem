import { useEffect, useRef, useState } from 'react';
import { requestAuth, serviceUnavailableMessage } from '../auth';
import { managerPath } from '../ownerApi';
import AppLink from './AppLink';

export default function ProfileSettings({ user, token, navigate, onSave, onSessionExpired, onDeleted }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const request = useRef(null);
  const isManager = user.role === 'owner';
  const nameChanged = name.trim() !== user.name;
  const phoneChanged = phone.trim() !== (user.phone ?? '');
  const canSave = (nameChanged || phoneChanged) && name.trim() && (!phoneChanged || phone.trim());
  useEffect(() => () => request.current?.abort(), []);

  async function saveProfile(event) {
    event.preventDefault();
    if (!canSave || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setNotice('');
    setSaving(true);

    try {
      const response = await requestAuth('me/profile', {
        method: 'PATCH', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(nameChanged && { name }), ...(phoneChanged && { phone }) }),
      });
      if (controller.signal.aborted) return;
      if (response.status === 401) { onSessionExpired(); return; }
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.ok && data.user?.id === user.id) {
        setName(data.user.name);
        setPhone(data.user.phone);
        onSave(data.user);
        setNotice('Profile updated.');
      } else {
        setError(data.message || 'Could not update your profile. Please try again.');
      }
    } catch {
      if (!controller.signal.aborted) setError(serviceUnavailableMessage);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  async function removeAccount() {
    if (!confirming || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setDeleteError('');
    setDeleting(true);
    try {
      const response = await requestAuth('me', {
        method: 'DELETE', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (controller.signal.aborted) return;
      if (response.status === 204) { onDeleted(); return; }
      if (response.status === 401) { onSessionExpired(); return; }
      const data = await response.json();
      if (!controller.signal.aborted) setDeleteError(data.message || 'Could not delete your account. Please try again.');
    } catch {
      if (!controller.signal.aborted) setDeleteError(serviceUnavailableMessage);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setDeleting(false);
    }
  }

  return <main className="frame profile-layout">
    <AppLink className="button button-outline owner-back profile-back" href={isManager ? managerPath : '/'} navigate={(href) => {
      if (window.history.state?.fromProfileMenu) window.history.back();
      else navigate(href, { replace: true });
    }}>Back</AppLink>
    <section className="account-card" aria-labelledby="profile-settings-title">
      <h1 id="profile-settings-title">Profile</h1>
      <form className="profile-form" onSubmit={saveProfile}>
        <label className="profile-field">Display name
          <input name="name" autoComplete="name" value={name} maxLength={100} required disabled={saving || deleting}
            onChange={(event) => { setName(event.target.value); setNotice(''); setError(''); }} />
        </label>
        <label className="profile-field">Contact number
          <input name="phone" type="tel" autoComplete="tel" value={phone} maxLength={32} required={Boolean(user.phone)} disabled={saving || deleting}
            onChange={(event) => { setPhone(event.target.value); setNotice(''); setError(''); }} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="account-note" role="status">{notice}</p>}
        <div className="profile-actions">
          <button className="button button-primary" type="submit" disabled={saving || deleting || !canSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
      {!isManager && <section className="profile-section" aria-labelledby="profile-wallet-title">
        <h2 id="profile-wallet-title">Wallet</h2>
        <AppLink className="button button-outline" href="/wallet" navigate={(href) => navigate(href, { state: { fromProfile: true } })}>Open Wallet</AppLink>
      </section>}
      <section className="profile-section" aria-labelledby="delete-account-title">
        <h2 id="delete-account-title">Delete account</h2>
        <p className="account-note">{isManager ? 'Remove all your registered turfs in Dashboard first.' : 'Cancel any active bookings in Wallet first.'}</p>
        {isManager && <div><AppLink className="button button-outline" href={managerPath} navigate={navigate}>Open Dashboard</AppLink></div>}
        {confirming && <p>This permanently deletes your PickTurf account.</p>}
        {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}
        <div className="profile-actions">
          {confirming ? <>
            <button className="button button-outline button-danger" type="button" disabled={saving || deleting}
              onClick={removeAccount}>{deleting ? 'Deleting…' : 'Delete my account'}</button>
            <button className="button button-outline" type="button" disabled={deleting}
              onClick={() => { setConfirming(false); setDeleteError(''); }}>Cancel</button>
          </> : <button className="button button-outline button-danger" type="button" disabled={saving} onClick={() => setConfirming(true)}>Delete account</button>}
        </div>
      </section>
    </section>
  </main>;
}
