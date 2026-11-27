import { useEffect, useRef, useState } from 'react';
import { bookingPrice, turfRequest } from '../turfApi';
import { useTurfRequest } from '../useTurfRequest';
import ScheduleDatePicker from './ScheduleDatePicker';
import Skeleton from './Skeleton';

const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const slotLabels = { booked: 'Booked', held: 'Payment pending', ended: 'Ended', available: 'Available' };

export default function TurfSchedule({ endpoint, token, allowWalkIns = false }) {
  const today = localDate.format(new Date());
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const { data, error, previousData, reload } = useTurfRequest(`${endpoint}/schedule?${new URLSearchParams({ date })}`, token);
  const turfName = data?.turf.name ?? previousData?.turf.name;
  useEffect(() => () => request.current?.abort(), []);

  async function record(event) {
    event.preventDefault();
    if (!selected || request.current) return;
    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setFailure('');
    setMessage('');
    try {
      await turfRequest(`${endpoint}/bookings`, { token, signal: controller.signal, body: {
        date, startTime: selected.startTime, endTime: selected.endTime, customerName: fields.get('customerName'),
        customerPhone: fields.get('customerPhone'),
      } });
      if (controller.signal.aborted) return;
      setMessage('Walk-in booking recorded.');
      setSelected(null);
      reload();
    } catch (problem) {
      if (controller.signal.aborted) return;
      setFailure(problem.message);
      if (problem.status === 409) { setSelected(null); reload(); }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section className="owner-panel booking-panel staff-schedule" aria-labelledby="staff-schedule-title">
    <div className="owner-heading">
      <div><h2 id="staff-schedule-title">Daily schedule</h2>{turfName && <p className="account-note">{turfName}</p>}</div>
      <ScheduleDatePicker value={date} today={today} disabled={busy} onChange={(value) => {
        if (value === date) return;
        setDate(value);
        setSelected(null);
        setMessage('');
        setFailure('');
      }} />
    </div>
    {message && <p role="status">{message}</p>}
    {failure && <p className="auth-error" role="alert">{failure}</p>}
    {error && <div><p className="auth-error" role="alert">{error.message}</p><button className="button button-outline" type="button" onClick={reload}>Retry</button></div>}
    {!error && !data && <Skeleton label="Loading the turf schedule…" />}
    {data && <>
      <h3>Time slots <span className="account-note">IST</span></h3>
      {!data.slots.length && <p className="account-note">No time slots are configured for this turf.</p>}
      <div className="booking-slots">
        {data.slots.map((slot) => <article className={`staff-time-slot ${slot.status === 'available' ? '' : 'staff-time-slot-unavailable'}`} key={slot.startTime}>
          <strong>{slot.startTime}–{slot.endTime}</strong>
          <p className="account-note">{slotLabels[slot.status]} · {bookingPrice(slot.amount)}</p>
          {allowWalkIns && slot.status === 'available' && <button className="button button-outline" type="button" disabled={busy}
            onClick={() => { setSelected(slot); setFailure(''); setMessage(''); }}>Record walk-in</button>}
        </article>)}
      </div>
      {selected && <form className="owner-form staff-entry" onSubmit={record}>
        <h3>Walk-in · {selected.startTime}–{selected.endTime} IST</h3>
        <div className="owner-fields">
          <label>Customer name<input name="customerName" maxLength={100} required autoFocus /></label>
          <label>Customer phone<input name="customerPhone" type="tel" maxLength={32} required /></label>
        </div>
        <div className="owner-actions">
          <button className="button button-primary" disabled={busy}>{busy ? 'Recording…' : 'Confirm walk-in'}</button>
          <button className="button button-outline" type="button" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
        </div>
      </form>}
      <h3>Bookings</h3>
      {!data.bookings.length && <p className="account-note">No bookings for this date.</p>}
      {data.bookings.map((booking) => <article className="staff-booking" key={booking.id}>
        <div className="wallet-booking-heading"><strong>{booking.startTime}–{booking.endTime} IST</strong><strong>{bookingPrice(booking.amount)}</strong></div>
        <p className="account-note">{booking.walkIn ? 'Walk-in' : 'PickTurf booking'} · {booking.status === 'pending' ? 'Payment pending' : 'Confirmed'}</p>
        {booking.customerName && <p>{booking.customerName}</p>}
        {booking.customerPhone && <a href={`tel:${booking.customerPhone}`}>{booking.customerPhone}</a>}
        {booking.equipment.length > 0 && <p>Equipment · {booking.equipment.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</p>}
        {booking.recordedBy && <p className="account-note">Recorded by {booking.recordedBy}</p>}
      </article>)}
    </>}
  </section>;
}
