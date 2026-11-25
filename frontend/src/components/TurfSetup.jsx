import { useEffect, useState } from 'react';
import { ownerRequest, turfPath } from '../ownerApi';
import AppLink from './AppLink';
import { Dropdown, SuggestionInput } from './Dropdown';
import { TurfStatus } from './OwnerTurfs';
import Skeleton from './Skeleton';
import LoadingImage from './LoadingImage';
import NameTooltip from './NameTooltip';

const sportSuggestions = {
  outdoor: ['5v5 Football', '7v7 Football', 'Box Cricket', 'Tennis', 'Basketball'],
  indoor: ['Badminton', 'Pickleball', 'Futsal', 'Box Cricket', 'Volleyball'],
  hybrid: ['5v5 Football', 'Box Cricket', 'Pickleball', 'Badminton', 'Basketball'],
};
const equipmentSuggestions = ['Football', 'Cricket Bat & Ball', 'Badminton Racket', 'Pickleball Paddle', 'Training Bibs', 'Cones'];
const ruleSuggestions = ['No metal spikes', 'Arrive 10 minutes before your slot', 'No smoking or alcohol on premises'];
const blankSlot = { startTime: '06:00', endTime: '07:00', price: 0, isActive: true };
const blankEquipment = { name: '', price: 0, maxCount: 1, isAvailable: true };

function TrashIcon() {
  return (
    <svg className="slot-trash" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5h13M8 5.5V3h4v2.5m2.5 0-.7 11h-7.6l-.7-11M8.5 8.5v5m3-5v5" />
    </svg>
  );
}

function Field({ label, value, update, type = 'text', options, ...props }) {
  if (options) return <Dropdown label={label} options={options} value={String(value ?? options[0])} onChange={update} />;
  return <label>{label}
    <input {...props} type={type} value={value ?? ''} onChange={(event) => update(type === 'number' ? event.target.valueAsNumber || 0 : event.target.value)} />
  </label>;
}

function Toggle({ label, value, update }) {
  return <label className="owner-agreement"><input type="checkbox" checked={Boolean(value)} onChange={(event) => update(event.target.checked)} />{label}</label>;
}

function BookingPolicyFields({ label, value, onChange, children }) {
  return <div>
    <Toggle label={label + ' available'} value={value?.available} update={(available) => onChange({ ...value, available })} />
    {value?.available && <>
      <label>
        {label} cutoff (hours before the slot starts)
        <input type="number" min="0" step="any" required value={value.cutoffHours ?? ''}
          onChange={(event) => onChange({ ...value, cutoffHours: event.target.value === '' ? null : event.target.valueAsNumber })} />
      </label>
      {children}
    </>}
  </div>;
}

function ListEditor({ label, suggestions, items, update }) {
  const [input, setInput] = useState('');
  const query = input.trim().toLowerCase();
  const available = suggestions.filter((item) => !items.some((existing) => existing.toLowerCase() === item.toLowerCase()));
  function add(text) {
    const value = text.trim();
    if (!value || items.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    update([...items, value]);
    setInput('');
  }
  return <>
    <div className="owner-actions owner-list-input">
      <SuggestionInput label={label} value={input} suggestions={available} maxLength={200} onChange={setInput} onChoose={add} onSubmit={add} />
      <button className="button button-outline" type="button" disabled={!query || items.some((item) => item.toLowerCase() === query)} onClick={() => add(input)}>Add</button>
    </div>
    <ul className="owner-chips">
      {items.map((item) => <li key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => update(items.filter((value) => value !== item))}>×</button></li>)}
    </ul>
  </>;
}

function minutes(value) {
  if (!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(value)) return NaN;
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function clock(value) {
  return [Math.floor(value / 60), value % 60].map((part) => String(part).padStart(2, '0')).join(':');
}

export default function TurfSetup({ id, navigate, onSaved, onMediaChange, section = 'all' }) {
  const showPricing = section !== 'facilities';
  const showFacilities = section !== 'pricing';
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [suggestions, setSuggestions] = useState({});
  const [showSlotBuilder, setShowSlotBuilder] = useState(false);
  const [pendingSlotRemoval, setPendingSlotRemoval] = useState(null);
  const [builder, setBuilder] = useState({ open: '06:00', close: '22:00', price: 0 });

  useEffect(() => {
    const controller = new AbortController();
    ownerRequest('/' + id, { signal: controller.signal }).then(({ turf }) => {
      if (!controller.signal.aborted) setDraft(turf);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    if (showPricing) {
      ownerRequest('/' + id + '/sports', { signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) setSuggestions(result.suggestions);
      }).catch(() => {});
    }
    return () => controller.abort();
  }, [id, attempt, showPricing]);

  const set = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const setRow = (key, index, field, value) => setDraft((previous) => ({
    ...previous, [key]: previous[key].map((row, i) => i === index ? { ...row, [field]: value } : row),
  }));
  const facility = (key, value) => setDraft((previous) => ({ ...previous, facilities: { ...previous.facilities, [key]: value } }));
  const nestedFacility = (group, key, value) => setDraft((previous) => ({
    ...previous, facilities: { ...previous.facilities, [group]: { ...previous.facilities?.[group], [key]: value } },
  }));
  const field = (label, key, value, update, props) => <Field label={label} value={value?.[key]} update={(next) => update(key, next)} {...props} />;

  async function perform(path, options, message, replaceDraft = false) {
    if (busy) return false;
    const isUpload = Boolean(options.onUploadProgress);
    if (path === '/media' && !isUpload) setPhotoProgress(null);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { turf } = await ownerRequest('/' + id + path, options);
      setDraft((previous) => ({
        ...(replaceDraft ? turf : previous), verificationStatus: turf.verificationStatus, isConfigured: turf.isConfigured,
        media: { ...(replaceDraft ? turf.media : previous.media), images: turf.media.images },
      }));
      if (isUpload) setPhotoProgress({ phase: 'done', message });
      else setNotice(message);
      if (path === '/media') onMediaChange?.(turf.media);
      if (replaceDraft) {
        setPendingSlotRemoval(null);
        onSaved?.(turf);
      }
      return true;
    } catch (failure) {
      if (isUpload) setPhotoProgress({ phase: 'error', message: failure.message });
      else setError(failure.message);
      return false;
    }
    finally { setBusy(false); }
  }

  function generateSlots() {
    const start = minutes(builder.open);
    const end = minutes(builder.close);
    const duration = draft.slotDurationMinutes;
    if (!(end - start >= duration) || start < 0 || end > 1440) {
      setError('Choose same-day opening and closing times with room for at least one slot.');
      return;
    }
    setError('');
    const generated = [];
    for (let time = start; time + duration <= end; time += duration) {
      const startTime = clock(time);
      const endTime = clock(time + duration);
      if (!draft.timeSlots.some((slot) => slot.isActive && startTime < slot.endTime && slot.startTime < endTime)) {
        generated.push({ ...blankSlot, startTime, endTime, price: builder.price });
      }
    }
    set('timeSlots', [...draft.timeSlots, ...generated]);
    setNotice(generated.length ? `Added ${generated.length} slots.` : 'No slots added. The existing active slots cover this window.');
  }

  function save(event) {
    event.preventDefault();
    const { sports, slotDurationMinutes, timeSlots, equipment, facilities, regulations, policies } = draft;
    perform('/configure', {
      method: 'PUT', body: { sports, slotDurationMinutes, timeSlots, equipment, facilities, regulations, policies },
    }, 'Configuration saved.', true);
  }

  async function upload(event) {
    const input = event.target;
    const files = [...input.files];
    if (!files.length || busy) return;
    if (files.length + draft.media.images.length > 10 || files.some((file) => file.size > 5 * 1024 * 1024)) {
      setPhotoProgress({ phase: 'error', message: 'Choose up to 10 photos per turf, with a maximum of 5 MB per image.' });
    } else {
      const body = new FormData();
      for (const file of files) body.append('images', file);
      setPhotoProgress({ phase: 'uploading', percent: 0 });
      await perform('/media', { method: 'POST', body, onUploadProgress: setPhotoProgress }, 'Photos uploaded.');
    }
    input.value = '';
  }

  const Wrapper = onSaved ? 'section' : 'main';
  const wrapperClass = onSaved ? 'owner-form' : 'frame owner-page';
  const back = <AppLink className="button button-outline owner-back" href={turfPath(id)} navigate={navigate}>Back</AppLink>;
  if (!draft) return <Wrapper className={wrapperClass}>
    {!onSaved && back}
    {error ? <><p className="auth-error" role="alert">{error}</p><button className="button button-outline" onClick={() => { setError(''); setAttempt(attempt + 1); }}>Retry</button></> : (
      <Skeleton label={section === 'pricing' ? 'Loading pricing and slots…' : section === 'facilities' ? 'Loading facilities and photos…' : 'Loading turf setup…'} />
    )}
  </Wrapper>;

  const { facilities = {}, policies = {}, media } = draft;
  const rescheduling = policies.rescheduling ?? (Number.isFinite(policies.freeRescheduleHours)
    ? { available: true, cutoffHours: policies.freeRescheduleHours }
    : undefined);
  const venueType = facilities.venueType || 'outdoor';
  return (
    <Wrapper className={wrapperClass}>
      {!onSaved && back}
      {!onSaved && <div className="owner-heading">
        <h1><NameTooltip text={`Set up ${draft.name}`} fullName={draft.name} /></h1>
        <TurfStatus turf={draft} />
      </div>}
      <form className="owner-form" onSubmit={save}>
        <fieldset className="owner-form-fields" disabled={busy}>
          {showPricing && <><section className="owner-panel">
            <h2>Sports you host</h2>
            {field('Venue type', 'venueType', facilities, facility, { options: ['outdoor', 'indoor', 'hybrid'] })}
            <ListEditor label="Find or add a sport" suggestions={suggestions[venueType]?.length ? suggestions[venueType] : sportSuggestions[venueType]} items={draft.sports} update={(items) => set('sports', items)} />
          </section>
          <section className="owner-panel">
            <div className="owner-heading"><h2>Pricing and Slots</h2>
              <button type="button" className="button button-outline" aria-expanded={showSlotBuilder} aria-label={showSlotBuilder ? 'Close slot controls' : 'Show slot controls'} onClick={() => setShowSlotBuilder(!showSlotBuilder)}>{showSlotBuilder ? '×' : '+'}</button>
            </div>
            <p className="account-note">This schedule repeats daily. Use 24-hour times and 24:00 for midnight.</p>
            {showSlotBuilder && <><div className="owner-fields">
              {field('Opening time', 'open', builder, (key, value) => setBuilder({ ...builder, [key]: value }))}
              {field('Closing time', 'close', builder, (key, value) => setBuilder({ ...builder, [key]: value }))}
              <Field label="Duration (minutes)" options={['30', '60', '90']} value={draft.slotDurationMinutes} update={(value) => set('slotDurationMinutes', Number(value))} />
              {field('Base price (₹)', 'price', builder, (key, value) => setBuilder({ ...builder, [key]: value }), { type: 'number', min: 0, step: '.01' })}
            </div>
            <div className="owner-actions">
              <button type="button" className="button button-outline" onClick={generateSlots}>Generate fixed slots</button>
              <button type="button" className="button button-outline" onClick={() => set('timeSlots', [...draft.timeSlots, { ...blankSlot }])}>Add slot</button>
            </div></>}
            {draft.timeSlots.map((slot, index) => {
              const update = (key, value) => setRow('timeSlots', index, key, value);
              return <div className={`owner-fields owner-edit-row slot-config-row${slot.isActive ? '' : ' slot-config-inactive'}`} key={index}>
                {field('Start time', 'startTime', slot, update)}{field('End time', 'endTime', slot, update)}
                {field('Price (₹)', 'price', slot, update, { type: 'number', min: 0, step: '.01' })}
                <p className="slot-row-status slot-state">{slot.isActive ? 'Active' : 'Inactive'}</p>
                {pendingSlotRemoval === index && <p className="account-note slot-row-status" role="status">Remove the {slot.startTime}–{slot.endTime} slot?</p>}
                <div className="owner-actions slot-row-actions">
                  {pendingSlotRemoval === index ? (
                    <>
                      <button type="button" className="button button-outline" onClick={() => setPendingSlotRemoval(null)}>Cancel</button>
                      <button type="button" className="button button-outline button-danger" onClick={() => {
                        set('timeSlots', draft.timeSlots.filter((_, i) => i !== index));
                        setPendingSlotRemoval(null);
                      }}>Confirm removal</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="button button-outline" onClick={() => update('isActive', !slot.isActive)}>
                        {slot.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button type="button" className="button button-outline button-danger slot-remove" onClick={() => setPendingSlotRemoval(index)}>
                        <TrashIcon />
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>;
            })}
          </section>
          <section className="owner-panel">
            <h2>Equipment rentals</h2>
            {draft.equipment.map((item, index) => {
              const update = (key, value) => setRow('equipment', index, key, value);
              return <div className="owner-fields owner-edit-row owner-equipment-row" key={index}>
                <SuggestionInput label="Equipment name" value={item.name} suggestions={equipmentSuggestions} onChange={(value) => update('name', value)} required />
                {field('Rental price (₹)', 'price', item, update, { type: 'number', min: 0, step: '.01' })}
                {field('Maximum available count', 'maxCount', item, update, { type: 'number', min: 1, required: true })}
                <Toggle label="Available for rent" value={item.isAvailable} update={(value) => update('isAvailable', value)} />
                <button type="button" className="button button-plain slot-remove" onClick={() => set('equipment', draft.equipment.filter((_, i) => i !== index))}>
                  <TrashIcon />
                  Remove
                </button>
              </div>;
            })}
            <button type="button" className="button button-outline" onClick={() => set('equipment', [...draft.equipment, { ...blankEquipment }])}>Add equipment</button>
          </section></>}
          {showFacilities && <section className="owner-panel">
            <h2>Facilities and surface</h2>
            {[
              ['parking', 'Parking', [['twoWheelerCapacity', 'Two-wheeler capacity'], ['fourWheelerCapacity', 'Four-wheeler capacity']]],
              ['restrooms', 'Restrooms and changing rooms', [['washroomCount', 'Washroom count'], ['changingRoomCount', 'Changing room count']]],
            ].map(([group, label, counts]) => <div className="owner-facility" key={group}>
              <Toggle label={label} value={facilities[group]?.available} update={(value) => nestedFacility(group, 'available', value)} />
              {facilities[group]?.available && <div className="owner-fields">
                {counts.map(([key, title]) => <Field key={key} label={title} type="number" min={0} value={facilities[group]?.[key] ?? 0} update={(value) => nestedFacility(group, key, value)} />)}
                <Field label={label + ' notes'} value={facilities[group]?.notes} update={(value) => nestedFacility(group, 'notes', value)} />
              </div>}
            </div>)}
            <div className="facility-amenities">
              <Toggle label="Floodlights" value={facilities.floodlights?.available} update={(value) => nestedFacility('floodlights', 'available', value)} />
              {[['drinkingWater', 'Drinking water'], ['cafeteria', 'Cafeteria'], ['seatingArea', 'Seating'], ['coveredRoof', 'Covered roof']].map(([key, label]) => <Toggle key={key} label={label} value={facilities[key]} update={(value) => facility(key, value)} />)}
            </div>
          </section>}
          {showPricing && <section className="owner-panel">
            <h2>Rules and policies</h2>
            <ListEditor label="Add a turf rule" suggestions={ruleSuggestions} items={draft.regulations} update={(items) => set('regulations', items)} />
            <div className="owner-form">
              <BookingPolicyFields label="Cancellation" value={policies.cancellation} onChange={(value) => set('policies', { ...policies, cancellation: value })} />
              <BookingPolicyFields label="Rescheduling" value={rescheduling} onChange={(value) => set('policies', { ...policies, rescheduling: value })}>
                <p className="account-note">A booking can be rescheduled once. A 12-hour cutoff means a 10 PM slot can be rescheduled up to 10 AM that day.</p>
              </BookingPolicyFields>
            </div>
          </section>}
          {showFacilities && <section className="owner-panel">
            <h2>Turf photos</h2>
            <label>Turf photos ({media.images.length}/10)<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={media.images.length >= 10} onChange={upload} /></label>
            <p className="account-note">JPEG, PNG or WebP, up to 5 MB per image.</p>
            {(photoProgress?.phase === 'uploading' || photoProgress?.phase === 'saving') && (
              <div className="photo-upload-progress">
                <div className="photo-upload-status">
                  <span role="status">{photoProgress.phase === 'saving' ? 'Saving photos…' : 'Uploading photos…'}</span>
                  {Number.isFinite(photoProgress.percent) && <span aria-hidden="true">{photoProgress.percent}%</span>}
                </div>
                <progress
                  aria-label={photoProgress.phase === 'saving' ? 'Saving photos' : 'Photo upload progress'}
                  value={photoProgress.percent ?? undefined}
                  max={100}
                />
              </div>
            )}
            {photoProgress?.phase === 'done' && <p role="status">{photoProgress.message}</p>}
            {photoProgress?.phase === 'error' && <p className="auth-error" role="alert">{photoProgress.message}</p>}
            <div className="owner-turfs">
              {media.images.map((url) => <div key={url}><LoadingImage className="owner-turf-photo" src={url} alt="Turf photo" loading="lazy" /><button className="button button-plain" type="button" onClick={() => perform('/media', { method: 'DELETE', body: { url } }, 'Photo removed.')}>Remove photo</button></div>)}
            </div>
          </section>}
        </fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <div className="owner-actions">
          <button className="button button-primary" disabled={busy}>{showPricing ? 'Save configuration' : 'Save facilities'}</button>
          {showPricing && <span>{draft.isConfigured ? 'Setup complete' : 'Add at least one sport and one active slot to complete setup.'}</span>}
        </div>
      </form>
    </Wrapper>
  );
}
