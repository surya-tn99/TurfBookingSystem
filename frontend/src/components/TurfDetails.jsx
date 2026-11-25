import { useEffect, useState } from 'react';
import { managerPath, ownerRequest, turfRating } from '../ownerApi';
import AppLink from './AppLink';
import { Dropdown } from './Dropdown';
import NameTooltip from './NameTooltip';
import Skeleton from './Skeleton';
import TurfPhotoSlideshow from './TurfPhotoSlideshow';
import TurfSetup from './TurfSetup';

const sections = [['revenue', 'Revenue'], ['pricing', 'Pricing and slots'], ['staff', 'Staff'], ['feedback', 'Customer feedback'], ['facilities', 'Facilities and photos']];

function Staff({ id }) {
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    ownerRequest('/' + id + '/staff', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setStaff(data.staff); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [id]);

  async function update(path, method, body) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const { member, memberId } = await ownerRequest('/' + id + '/staff' + path, { method, body });
      if (method === 'DELETE') {
        setStaff((current) => current.filter((item) => item._id !== memberId));
        setPendingRemoval(null);
      } else if (method === 'POST') {
        setStaff((current) => [...(current ?? []), member]);
      } else {
        setStaff((current) => current.map((item) => item._id === member._id ? member : item));
      }
      return true;
    } catch (failure) { setError(failure.message); return false; }
    finally { setBusy(false); }
  }

  return <section className="owner-panel owner-form">
    <h2>Turf staff</h2>
    <form className="owner-form" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (await update('', 'POST', Object.fromEntries(new FormData(form)))) form.reset();
    }}>
      <div className="owner-fields">
        <label>Staff name<input name="name" maxLength={100} required /></label>
        <label>Gmail address<input name="email" type="email" required /></label>
        <label>Phone number<input name="phone" type="tel" required /></label>
      </div>
      <button className="button button-primary" disabled={busy || (staff === null && !error)}>Add staff member</button>
    </form>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {staff === null && !error && <Skeleton label="Loading turf staff…" />}
    {staff?.length === 0 && <p>No staff members yet.</p>}
    {staff?.map((member) => <div className="owner-heading owner-edit-row" key={member._id}>
      <div className="staff-details"><strong><NameTooltip text={member.name} /></strong><p>{member.email} · {member.phone}</p><p>{member.isActive ? 'Active' : 'Inactive'}</p></div>
      {pendingRemoval === member._id ? (
        <div className="owner-actions">
          <span className="account-note">Remove this member’s access to the turf?</span>
          <button type="button" className="button button-outline" disabled={busy} onClick={() => setPendingRemoval(null)}>Cancel</button>
          <button type="button" className="button button-outline button-danger" disabled={busy} onClick={() => update('/' + member._id, 'DELETE')}>Confirm removal</button>
        </div>
      ) : (
        <div className="owner-actions">
          <button type="button" className="button button-outline" disabled={busy} onClick={() => update('/' + member._id, 'PATCH', { isActive: !member.isActive })}>{member.isActive ? 'Deactivate' : 'Reactivate'}</button>
          <button type="button" className="button button-outline button-danger" disabled={busy} onClick={() => setPendingRemoval(member._id)}>Remove</button>
        </div>
      )}
    </div>)}
  </section>;
}

export default function TurfDetails({ id, ownerEmail, navigate }) {
  const [turf, setTurf] = useState(null);
  const [section, setSection] = useState('revenue');
  const [editing, setEditing] = useState(false);
  const [removal, setRemoval] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    ownerRequest('/' + id, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setTurf(data.turf); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [id]);

  async function save(event, path, method) {
    event.preventDefault();
    if (busy || (method === 'PATCH' && removal)) return;
    setBusy(true);
    setError('');
    try {
      const { turf: updated } = await ownerRequest('/' + id + path, { method, body: Object.fromEntries(new FormData(event.currentTarget)) });
      setTurf(updated);
      setEditing(false);
      setRemoval(null);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  const nameMatches = removal?.name.trim() === turf?.name;
  const emailMatches = removal?.email.trim().toLowerCase() === ownerEmail?.toLowerCase();
  const canRemove = Boolean(removal && nameMatches && emailMatches);

  async function removeTurf(event) {
    event.preventDefault();
    if (!canRemove || busy) return;
    setBusy(true);
    setError('');
    try {
      await ownerRequest('/' + id, {
        method: 'DELETE',
        body: { confirmationName: removal.name.trim(), confirmationEmail: removal.email.trim() },
      });
      navigate(managerPath, { replace: true });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  const back = <AppLink href={managerPath} navigate={navigate} className="button button-outline owner-back">Back</AppLink>;
  if (!turf) return <main className="frame owner-page owner-narrow">{back}
    {error ? <p className="auth-error" role="alert">{error}</p> : <Skeleton label="Loading turf details…" variant="turf" />}
  </main>;
  const address = turf.address;
  return <main className="frame owner-page owner-narrow">
    {back}
    <TurfPhotoSlideshow photos={turf.media.images} />
    <section className="owner-panel owner-form">
      <div className="owner-heading turf-detail-title"><h1><NameTooltip text={turf.name} /></h1><button className="button button-outline" type="button" disabled={busy} aria-label="Edit turf name and contact details" onClick={() => { setEditing(!editing); setRemoval(null); }}>✎</button></div>
      <p>{[address.street, address.area, address.city, address.state, address.pincode].filter(Boolean).join(', ')}</p>
      <p>{turf.contactPhone} · {turf.contactEmail}</p>
      {address.mapPinUrl && <a href={address.mapPinUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>}
      <p className="account-note">{turfRating(turf)}</p>
      {editing && <form className="owner-form" onSubmit={(event) => save(event, '', 'PATCH')}>
        <div className="owner-fields">
          <label>Turf name<input name="name" defaultValue={turf.name} maxLength={100} required /></label>
          <label>Contact phone<input name="contactPhone" type="tel" defaultValue={turf.contactPhone} required /></label>
          <label>Contact email<input name="contactEmail" type="email" defaultValue={turf.contactEmail} required /></label>
        </div>
        <div className="owner-actions turf-detail-edit-actions">
          <button className="button button-primary" disabled={busy || Boolean(removal)}>Save details</button>
          <button className="button button-outline button-danger" type="button" disabled={busy || Boolean(removal)}
            onClick={() => { setError(''); setRemoval({ name: '', email: '' }); }}>Remove turf</button>
        </div>
      </form>}
      {removal && <form className="owner-form owner-edit-row" aria-labelledby="remove-turf-title" onSubmit={removeTurf}>
        <h2 id="remove-turf-title">Are you sure you want to remove this turf?</h2>
        <p>This cannot be undone. If you add this turf again, it must go through verification again.</p>
        <div className="owner-fields">
          <label>
            Exact turf name
            <input value={removal.name} onChange={(event) => setRemoval({ ...removal, name: event.target.value })}
              required maxLength={100} autoComplete="off" aria-invalid={Boolean(removal.name && !nameMatches)} />
          </label>
          <label>
            Your PickTurf sign-in email
            <input type="email" value={removal.email} onChange={(event) => setRemoval({ ...removal, email: event.target.value })}
              required maxLength={254} autoComplete="off" aria-invalid={Boolean(removal.email && !emailMatches)} />
          </label>
        </div>
        <div className="owner-actions">
          <button className="button button-outline button-danger" disabled={busy || !canRemove}>Confirm removal</button>
          <button className="button button-plain" type="button" disabled={busy} onClick={() => { setError(''); setRemoval(null); }}>Cancel</button>
        </div>
      </form>}
    </section>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <nav className="owner-actions turf-detail-nav" aria-label="Turf sections">
      {sections.map(([key, label]) => <button className="button button-outline" key={key} aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}
    </nav>
    <Dropdown className="turf-section-picker" label="Section" value={section} onChange={setSection}
      options={sections.map(([value, label]) => ({ value, label }))} />
    {section === 'revenue' && <section className="owner-panel"><h2>Revenue</h2><p>Revenue will appear here once bookings and payments are enabled.</p></section>}
    {section === 'pricing' && <TurfSetup id={id} navigate={navigate} section="pricing" onSaved={setTurf} />}
    {section === 'facilities' && <TurfSetup
      id={id}
      navigate={navigate}
      section="facilities"
      onSaved={setTurf}
      onMediaChange={(media) => setTurf((current) => ({ ...current, media }))}
    />}
    {section === 'staff' && <Staff id={id} />}
    {section === 'feedback' && <section className="owner-panel owner-form">
      <h2>Customer feedback</h2>
      {!turf.feedback?.length && <p>No customer feedback yet.</p>}
      {turf.feedback?.map((item) => <article className="owner-edit-row" key={item._id}>
        <strong>{item.name || 'Customer'} · {item.rating}/5</strong><p>{item.comment}</p>
        <form className="owner-form" onSubmit={(event) => save(event, '/feedback/' + item._id + '/reply', 'PUT')}>
          <label>Your reply<textarea name="reply" defaultValue={item.reply} maxLength={2000} required /></label>
          <button className="button button-primary" disabled={busy}>{item.reply ? 'Update reply' : 'Send reply'}</button>
        </form>
      </article>)}
    </section>}
  </main>;
}
