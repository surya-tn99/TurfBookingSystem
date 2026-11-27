import { useEffect, useRef, useState } from 'react';
import { requestAuth, serviceUnavailableMessage } from '../auth';
import ManagerFeeAgreement from './ManagerFeeAgreement';

export default function ProfileSetup({ user, token, onComplete, onLogout }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const needsFeeTerms = user.role === 'owner' && !user.monthlyFeeTermsAccepted;
  const request = useRef(null);

  useEffect(() => () => request.current?.abort(), []);

  async function saveProfile(event) {
    event.preventDefault();
    if (request.current || (needsFeeTerms && !accepted)) return;

    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setSaving(true);

    try {
      const response = await requestAuth('me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.get('name'), phone: fields.get('phone'),
          ...(needsFeeTerms && { monthlyFeeTermsAccepted: accepted }) }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        onLogout();
        return;
      }
      if (response.ok && data.user?.id && data.user.needsProfile === false) {
        onComplete(data.user);
        return;
      }
      setError(data.message || 'Could not save your profile. Please try again.');
    } catch {
      if (!controller.signal.aborted) setError(serviceUnavailableMessage);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <main className="frame profile-layout">
      <section className="account-card" aria-labelledby="profile-title">
        <div className="brand account-brand">Pick<span>Turf</span></div>
        <h1 id="profile-title">Complete your profile</h1>
        <p className="account-intro">Confirm your name and add your phone number to get started.</p>
        <form className="profile-form" onSubmit={saveProfile}>
          <label className="profile-field">
            Full name
            <input name="name" autoComplete="name" defaultValue={user.name} maxLength={100} required />
          </label>
          <label className="profile-field">
            Phone number
            <input name="phone" type="tel" autoComplete="tel" aria-describedby="phone-hint" maxLength={32} required />
          </label>
          <p id="phone-hint" className="account-note">Use 10 digits for an Indian number. For other countries, include the country code.</p>
          {needsFeeTerms && <ManagerFeeAgreement accepted={accepted} onChange={setAccepted} />}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="profile-actions">
            <button className="button button-primary" type="submit" disabled={saving || (needsFeeTerms && !accepted)}>{saving ? 'Saving…' : 'Continue'}</button>
            <button className="button button-plain" type="button" onClick={onLogout}>Log out</button>
          </div>
        </form>
      </section>
    </main>
  );
}
