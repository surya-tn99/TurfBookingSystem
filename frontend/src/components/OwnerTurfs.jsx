import { useEffect, useState } from 'react';
import { indiaCities } from '../indiaCities';
import { managerPath, ownerRequest, turfPath, turfRating } from '../ownerApi';
import AppLink from './AppLink';
import LoadingImage from './LoadingImage';
import Skeleton from './Skeleton';

export function TurfStatus({ turf }) {
  return turf.verificationStatus === 'verified' ? null : <span className="turf-status turf-status-pending">Pending</span>;
}

export function OwnerDashboard({ user, navigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    ownerRequest('', { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, []);

  return (
    <main className="frame owner-page">
      <div className="owner-heading"><h1>Welcome, {user.name}.</h1></div>
      <h2>My turfs</h2>
      {!data && !error && <Skeleton label="Loading turfs…" variant="cards" />}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {data?.turfs.length === 0 && <p className="account-note">Add your first turf to start setting it up.</p>}
      <div className="owner-turf-grid">
        {data?.turfs.map((turf) => (
          <AppLink className="owner-panel owner-turf" key={turf._id} href={turfPath(turf._id)} navigate={navigate}>
            {turf.media.images[0] ? <LoadingImage className="owner-turf-photo" src={turf.media.images[0]} loading="lazy" />
              : <div className="owner-turf-photo turf-image-empty" aria-hidden="true" />}
            <TurfStatus turf={turf} />
            <h3>{turf.name}</h3>
            <p className="account-note">{turfRating(turf)}</p>
          </AppLink>
        ))}
      </div>
    </main>
  );
}

export function TurfRegistration({ user, navigate }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!accepted || busy) return;
    const fields = new FormData(event.currentTarget);
    const address = Object.fromEntries(['state', 'city', 'street', 'area', 'pincode', 'mapPinUrl'].map((key) => [key, fields.get(key)]));
    setBusy(true);
    setError('');
    try {
      const { turf } = await ownerRequest('', {
        method: 'POST', body: {
          name: fields.get('name'), contactPhone: fields.get('contactPhone'), contactEmail: fields.get('contactEmail'),
          address, gstNumber: fields.get('gstNumber'), commissionAccepted: accepted,
        },
      });
      navigate(turfPath(turf._id) + '/setup', { replace: true });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="frame owner-page owner-narrow">
      <AppLink className="button button-outline owner-back" href={managerPath} navigate={navigate}>Back</AppLink>
      <h1>Register a turf</h1>
      <form className="owner-panel owner-form" onSubmit={submit}>
        <h2>Turf and contact details</h2>
        <div className="owner-fields registration-identity">
          <label>Turf name<input name="name" maxLength={100} required /></label>
          <label>Turf email<input name="contactEmail" type="email" defaultValue={user.email} required /></label>
          <label>Contact phone<input name="contactPhone" type="tel" defaultValue={user.phone || ''} required /></label>
          <label>GSTIN<input name="gstNumber" minLength={15} maxLength={15} required /></label>
        </div>
        <h2>Location</h2>
        <div className="registration-location">
          <label>State or union territory<select name="state" required value={state} onChange={(event) => setState(event.target.value)}>
            <option value="">Select state</option>{Object.keys(indiaCities).map((name) => <option key={name}>{name}</option>)}
          </select></label>
          <label>City<input key={state} name="city" list="turf-cities" required disabled={!state} placeholder="Select or enter a city" /></label>
          <datalist id="turf-cities">{indiaCities[state]?.map((city) => <option key={city} value={city} />)}</datalist>
          <label className="registration-full">Address line 1<input name="street" required /></label>
          <label className="registration-full">Address line 2 (optional)<input name="area" /></label>
          <label>Pincode<input name="pincode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
          <label>Google Maps location link<input type="url" name="mapPinUrl" required /></label>
        </div>
        <label className="owner-agreement"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required />I agree to the 3% platform commission on every customer booking.</label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-primary registration-submit" aria-busy={busy} disabled={!accepted || busy}>{busy ? 'Registering…' : 'Register and continue'}</button>
      </form>
    </main>
  );
}
