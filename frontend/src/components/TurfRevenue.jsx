import { useState } from 'react';
import { formatBookingAmount } from '../turfApi';
import { useTurfRequest } from '../useTurfRequest';
import { Dropdown } from './Dropdown';
import ScheduleDatePicker from './ScheduleDatePicker';
import Skeleton from './Skeleton';

const periods = [
  { value: 'all', label: 'All booking dates' },
  { value: 'month', label: 'This month' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom date range' },
];
const displayDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', dateStyle: 'short' });

export default function TurfRevenue({ id, token, openBookings }) {
  const [period, setPeriod] = useState('all');
  const today = localDate.format(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [appliedRange, setAppliedRange] = useState(null);
  const custom = period === 'custom';
  const rangeApplied = appliedRange?.from === from && appliedRange?.to === to;
  const invalidRange = from > to;
  const query = new URLSearchParams(custom ? { period, from, to } : { period });
  const path = !custom || rangeApplied ? `/owner/turfs/${id}/revenue?${query}` : null;
  const { data, error, reload } = useTurfRequest(path, token);
  const totals = data?.totals;

  return <section className="owner-panel booking-panel" aria-labelledby="revenue-title">
    <div className="owner-heading revenue-heading">
      <h2 id="revenue-title">Revenue</h2>
      <Dropdown label="Booking dates" options={periods} value={period} onChange={setPeriod} />
    </div>
    {custom && <form className="revenue-range" aria-label="Custom booking dates" onSubmit={(event) => {
      event.preventDefault();
      if (!invalidRange) setAppliedRange({ from, to });
    }}>
      <ScheduleDatePicker label="Start date" value={from} today={today} onChange={setFrom} />
      <ScheduleDatePicker label="End date" value={to} today={today} onChange={setTo} />
      <button type="submit" className="button button-primary" disabled={invalidRange || rangeApplied}>Apply dates</button>
    </form>}
    {custom && invalidRange && <p className="auth-error" role="alert">Choose an end date on or after the start date.</p>}
    {error && <div><p className="auth-error" role="alert">{error.message}</p><button type="button" className="button button-outline" onClick={reload}>Retry</button></div>}
    {path && !data && !error && <Skeleton label="Loading revenue…" />}
    {totals && <>
      <dl className="revenue-totals">
        <div><dt>Collected</dt><dd>{formatBookingAmount(totals.received)}</dd></div>
        <div><dt>Due at venue</dt><dd>{formatBookingAmount(totals.dueAtVenue)}</dd></div>
        <div><dt>Confirmed bookings</dt><dd>{totals.bookings}</dd></div>
      </dl>
      {totals.dueAtVenue > 0 && <div className="owner-actions">
        <button type="button" className="button button-outline" onClick={openBookings}>Record payments in Bookings</button>
      </div>}
      {totals.received > 0 && <dl className="venue-facilities revenue-breakdown">
        <div><dt>Paid online</dt><dd>{formatBookingAmount(totals.receivedOnline)}</dd></div>
        <div><dt>Paid at venue</dt><dd>{formatBookingAmount(totals.receivedAtVenue)}</dd></div>
        <div><dt>Slot charges collected</dt><dd>{formatBookingAmount(totals.slots)}</dd></div>
        <div><dt>Equipment charges collected</dt><dd>{formatBookingAmount(totals.rentals)}</dd></div>
      </dl>}
      <h3>Daily breakdown</h3>
      {data.daily.length === 0 ? <p className="account-note">No confirmed bookings for these dates.</p> : (
        <div className="revenue-table-wrap">
          <table className="revenue-table" aria-label="Revenue by booking date">
            <thead><tr><th scope="col">Date</th><th scope="col">Bookings</th><th scope="col">Collected</th><th scope="col">Due at venue</th></tr></thead>
            <tbody>{data.daily.map((day) => <tr key={day.date}>
              <th scope="row">{displayDate.format(Date.parse(day.date))}</th>
              <td>{day.bookings}</td><td>{formatBookingAmount(day.received)}</td><td>{formatBookingAmount(day.dueAtVenue)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </>}
  </section>;
}
