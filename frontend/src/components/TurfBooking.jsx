import { useEffect, useRef, useState } from 'react';
import { authPageHref } from '../auth';
import { bookingPrice as price, turfRequest } from '../turfApi';
import { useTurfRequest } from '../useTurfRequest';
import AppLink from './AppLink';
import ReviewStars from './ReviewStars';
import Skeleton from './Skeleton';
import TurfPhotoSlideshow from './TurfPhotoSlideshow';

const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const dateLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const dayMs = 86_400_000;
const datesInRow = 7;
const venueTypes = { outdoor: 'Outdoor', indoor: 'Indoor', hybrid: 'Indoor and outdoor' };
const facilityNames = {
  restrooms: 'Restrooms', changingRooms: 'Changing rooms', floodlights: 'Floodlights',
  drinkingWater: 'Drinking water', cafeteria: 'Cafeteria', seating: 'Seating', coveredRoof: 'Covered roof',
};

function dateKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return false;
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && dateKey(timestamp) === date;
}

function BookingDates({ date, today, chooseDate }) {
  const rail = useRef(null);
  const weekMs = datesInRow * dayMs;
  const todayMs = Date.parse(today);
  const start = todayMs + Math.floor((Date.parse(date) - todayMs) / weekMs) * weekMs;
  useEffect(() => {
    const row = rail.current;
    const active = row.querySelector('[aria-pressed="true"]');
    if (!active) return;
    const activeEnd = active.offsetLeft + active.offsetWidth;
    if (active.offsetLeft < row.scrollLeft) row.scrollLeft = active.offsetLeft;
    else if (activeEnd > row.scrollLeft + row.clientWidth) row.scrollLeft = activeEnd - row.clientWidth;
  }, [date]);

  return <section className="booking-dates" aria-labelledby="booking-date-title">
    <div className="booking-date-heading">
      <h2 id="booking-date-title">Booking date</h2>
      <div className="booking-date-controls">
        <button type="button" className="button button-outline" aria-label="Previous seven days" disabled={start === todayMs}
          onClick={() => chooseDate(dateKey(start - weekMs))}>‹</button>
        <button type="button" className="button button-outline" aria-label="Next seven days"
          onClick={() => chooseDate(dateKey(start + weekMs))}>›</button>
      </div>
    </div>
    <div className="booking-date-row" ref={rail}>
      {Array.from({ length: datesInRow }, (_, index) => {
        const timestamp = start + index * dayMs;
        const value = dateKey(timestamp);
        const { weekday, day, month } = Object.fromEntries(dateLabel.formatToParts(timestamp).map(({ type, value }) => [type, value]));
        return <button type="button" className="booking-date-button" key={value} aria-pressed={date === value}
          aria-label={dateLabel.format(timestamp)} onClick={() => chooseDate(value)}>
          <span>{weekday}</span><strong>{day}</strong><span>{month}</span>
        </button>;
      })}
    </div>
  </section>;
}

function VenueInformation({ turf }) {
  const { facilities = {}, venueType, sports = [] } = turf;
  const parking = facilities.parking;
  const capacities = [parking?.twoWheelerCapacity > 0 && `${parking.twoWheelerCapacity} two-wheelers`,
    parking?.fourWheelerCapacity > 0 && `${parking.fourWheelerCapacity} cars`].filter(Boolean);
  const amenities = Object.entries(facilityNames).filter(([key]) => facilities[key]).map(([, label]) => label);
  return <section className="owner-panel booking-panel" aria-labelledby="booking-venue">
    <h1 id="booking-venue">{turf.name}</h1>
    <p>{[turf.street, turf.city].filter(Boolean).join(', ')}</p>
    <dl className="venue-facilities">
      {venueTypes[venueType] && <div><dt>Venue type</dt><dd>{venueTypes[venueType]}</dd></div>}
      {sports.length > 0 && <div><dt>Sports</dt><dd>{sports.join(' · ')}</dd></div>}
      <div><dt>Parking</dt><dd>{parking ? (capacities.join(' · ') || 'Available') : 'Not listed'}</dd></div>
      {amenities.length > 0 && <div><dt>Facilities</dt><dd>{amenities.join(' · ')}</dd></div>}
    </dl>
  </section>;
}

function TurfFeedback({ feedback = [] }) {
  return <section className="owner-panel booking-panel" aria-labelledby="turf-feedback-title">
    <h2 id="turf-feedback-title">Customer feedback</h2>
    {feedback.length === 0 && <p className="account-note">No customer feedback yet.</p>}
    {feedback.map((review, index) => <article className="turf-review" key={review.id ?? index}>
      <div className="wallet-booking-heading"><strong>{review.author}</strong><ReviewStars rating={review.rating} /></div>
      {review.comment && <p>{review.comment}</p>}
      {review.reply && <div className="turf-review-reply"><strong>Turf reply</strong><p>{review.reply}</p></div>}
    </article>)}
  </section>;
}

function BookingStatus({ path, date, id, token, navigate }) {
  const { data, error, reload } = useTurfRequest(`${path}/bookings/${date}/${id}`, token);
  const booking = data?.booking;
  const confirmed = booking?.status === 'confirmed';
  const expired = booking?.status === 'expired';
  return <section className="owner-panel booking-panel" aria-labelledby="booking-title">
    <h1 id="booking-title">{confirmed ? 'Booking confirmed' : expired ? 'Booking hold expired' : 'Booking status'}</h1>
    {error && <p className="auth-error" role="alert">{error.message}</p>}
    {!data && !error && <Skeleton label="Checking your booking…" />}
    {booking && <>
      <h2>{booking.turfName}</h2>
      <p>{booking.date} · {booking.startTime}–{booking.endTime} IST</p>
      {booking.equipment?.length > 0 && <ul className="booking-rental-summary" aria-label="Booking charges">
        <li><span>Turf slot</span><span>{price(booking.slotAmount)}</span></li>
        {booking.equipment.map((item) => <li key={item.id}>
          <span>{item.name} × {item.quantity}</span><span>{price(item.unitAmount * item.quantity)}</span>
        </li>)}
      </ul>}
      <p>{booking.paymentMethod === 'venue' ? `Pay ${price(booking.amount)} at the venue`
        : `${price(booking.amount)}${confirmed && booking.amount > 0 ? ' paid' : ''}`}</p>
      {confirmed && <p>Booking reference <strong>{booking.id}</strong></p>}
      {expired && <p>Choose an available slot to start a new booking.</p>}
      {!confirmed && !expired && <p>{booking.checkoutUrl
        ? 'Your slot is held while you complete payment.' : 'Payment is pending. Check again in a moment.'}</p>}
    </>}
    <div className="owner-actions">
      {booking?.checkoutUrl && <a className="button button-primary" href={booking.checkoutUrl}>Open payment</a>}
      {(error || (booking && !confirmed && !expired)) && <button type="button" className="button button-outline" onClick={reload}>Check payment status</button>}
      <AppLink className="button button-outline" href={`${path}?${new URLSearchParams({ date })}`} navigate={navigate}>View slots</AppLink>
    </div>
  </section>;
}

function BookingFlow({ path, date, today, slotStart, checkout, initialRentals, user, token, sessionStatus, navigate }) {
  const { data, error, previousData, reload } = useTurfRequest(`${path}?${new URLSearchParams({ date })}`);
  const [quantities, setQuantities] = useState(() => new Map(initialRentals.map((choice) => choice.split(':'))));
  const [checkoutError, setCheckoutError] = useState('');
  const [busy, setBusy] = useState(false);
  const checkoutRequest = useRef(null);
  useEffect(() => () => checkoutRequest.current?.abort(), []);

  const selected = data?.slots.find((slot) => slot.startTime === slotStart && slot.available);
  const allowed = user?.role === 'customer' && !user.needsProfile;
  const canSelect = allowed || sessionStatus === 'guest';
  const payAtVenue = data?.turf.payAtVenue === true;
  const rentalOptions = data?.turf.equipment ?? [];
  const equipment = rentalOptions.flatMap((item) => {
    const quantity = Number(quantities.get(item.id));
    return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= item.maxCount ? [{ ...item, quantity }] : [];
  });
  const rentalAmount = equipment.reduce((total, item) => total + item.unitAmount * item.quantity, 0);
  const amount = (selected?.amount ?? 0) + rentalAmount;
  const slotQuery = new URLSearchParams({ date, ...(slotStart && { slot: slotStart }) });
  const slotHref = `${path}?${slotQuery}`;
  const returnQuery = new URLSearchParams(slotQuery);
  returnQuery.set('step', 'checkout');
  for (const item of equipment) returnQuery.append('rental', `${item.id}:${item.quantity}`);
  const returnTo = `${path}?${returnQuery}`;

  function chooseDate(value) {
    if (value === date) return;
    setCheckoutError('');
    navigate(`${path}?${new URLSearchParams({ date: value })}`, { replace: true });
  }

  function changeStep(href) {
    setCheckoutError('');
    navigate(href);
    window.scrollTo(0, 0);
  }

  async function proceed(event) {
    event.preventDefault();
    if (!canSelect || !selected || (amount > 0 && !payAtVenue) || checkoutRequest.current) return;
    if (!allowed) {
      navigate(authPageHref('login', returnTo));
      return;
    }
    const controller = new AbortController();
    checkoutRequest.current = controller;
    setBusy(true);
    setCheckoutError('');
    try {
      const { startTime, endTime } = selected;
      const { booking } = await turfRequest(`${path}/bookings`, { token, signal: controller.signal, body: {
        date, startTime, endTime, amount, equipment: equipment.map(({ id, quantity }) => ({ id, quantity })),
        paymentMethod: payAtVenue ? 'venue' : 'online',
      } });
      if (controller.signal.aborted) return;
      navigate(`${path}?${new URLSearchParams({ date, booking: booking.id })}`, { replace: true });
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.status === 409) reload();
      setCheckoutError(failure.message);
    } finally {
      checkoutRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const turf = data?.turf ?? previousData?.turf;
  const accessNote = user && !allowed && <p className="account-note">Only customer accounts can book slots.</p>;
  const availability = error ? <>
    <p className="auth-error" role="alert">{error.message}</p>
    <button type="button" className="button button-outline" onClick={reload}>Retry</button>
  </> : <Skeleton label="Loading available slots…" />;

  if (!checkout) return <>
    {turf && <><TurfPhotoSlideshow photos={turf.photos} /><VenueInformation turf={turf} /></>}
    <section className="owner-panel booking-panel">
      <BookingDates date={date} today={today} chooseDate={chooseDate} />
      {data ? <fieldset className="owner-form-fields" disabled={!canSelect || busy}>
        <legend>Time slots <span className="account-note">IST</span></legend>
        <div className="booking-slots">
          {data.slots.map((slot) => <label className="booking-slot" key={slot.startTime}>
            <input type="radio" name="slot" value={slot.startTime} disabled={!slot.available}
              checked={selected?.startTime === slot.startTime} onChange={() => navigate(`${path}?${new URLSearchParams({ date, slot: slot.startTime })}`, { replace: true })} />
            <span>{slot.startTime}–{slot.endTime}<small>{slot.available ? price(slot.amount) : 'Unavailable'}</small></span>
          </label>)}
        </div>
        {!data.slots.length && <p className="account-note">No upcoming slots for this date.</p>}
      </fieldset> : availability}
      {accessNote}
      {canSelect && selected && <div className="owner-actions">
        <AppLink className="button button-primary" href={returnTo} navigate={changeStep}>Continue to equipment</AppLink>
      </div>}
    </section>
    {turf && <TurfFeedback feedback={turf.feedback} />}
  </>;

  const changeSlot = <AppLink className="button button-outline" href={slotHref} navigate={changeStep}>Change date or slot</AppLink>;
  if (!data || !selected || !canSelect) return <section className="owner-panel booking-panel">
    <h1>Equipment and payment</h1>
    {!data ? availability : !canSelect ? accessNote || (sessionStatus === 'checking' && <Skeleton label="Checking session…" />)
      : <p className="auth-error" role="alert">{checkoutError || 'This slot is no longer available. Choose another slot.'}</p>}
    <div className="owner-actions">{changeSlot}</div>
  </section>;

  return (
    <form className="owner-panel booking-panel" onSubmit={proceed}>
      <h1>Equipment and payment</h1>
      <div className="booking-step-summary">
        <div><strong>{data.turf.name}</strong><p className="account-note">{dateLabel.format(Date.parse(date))} · {selected.startTime}–{selected.endTime} IST</p></div>
        {busy ? <button type="button" className="button button-outline" disabled>Change date or slot</button> : changeSlot}
      </div>
      {rentalOptions.length > 0 ? <fieldset className="owner-form-fields" disabled={busy}>
        <legend>Equipment rentals <span className="account-note">Optional</span></legend>
        {rentalOptions.map((item) => <label className="booking-rental" key={item.id}>
          <span><strong>{item.name}</strong><small>{item.unitAmount ? `${price(item.unitAmount)} each` : 'Free'} · Up to {item.maxCount}</small></span>
          <input type="number" inputMode="numeric" min="0" max={item.maxCount} step="1" aria-label={`${item.name} quantity`}
            value={quantities.get(item.id) ?? '0'} onChange={({ target }) => {
              const { value } = target;
              setQuantities((previous) => new Map(previous).set(item.id, value));
              setCheckoutError('');
            }} />
        </label>)}
      </fieldset> : <p className="account-note">This turf has no equipment rentals listed.</p>}
      <fieldset className="owner-form-fields" disabled={busy}>
        <legend>Payment</legend>
        <div className="booking-payment-options">
          <label className="booking-slot">
            <input type="radio" name="payment" checked={payAtVenue && amount > 0} disabled={!payAtVenue || amount === 0} readOnly />
            <span>On-the-spot payment<small>{amount === 0 ? 'No payment needed' : payAtVenue ? 'Pay when you arrive' : 'Unavailable at this turf'}</small></span>
          </label>
          <label className="booking-slot">
            <input type="radio" name="payment" disabled />
            <span>Online payment<small>Available soon</small></span>
          </label>
        </div>
      </fieldset>
      {checkoutError && <p className="auth-error" role="alert">{checkoutError}</p>}
      <div className="booking-checkout">
        <div>
          <strong>Total {price(amount)}</strong>
          <p className="account-note">{selected.startTime}–{selected.endTime} IST · Slot {price(selected.amount)}
            {equipment.length > 0 && ` · Equipment ${price(rentalAmount)}`}</p>
        </div>
        <button type="submit" className="button button-primary" disabled={busy || (amount > 0 && !payAtVenue)}>
          {busy ? 'Preparing booking…' : !allowed ? 'Log in to book' : 'Confirm booking'}
        </button>
      </div>
    </form>
  );
}

export default function TurfBooking({ id, params, navigate, user, token, sessionStatus }) {
  const today = indiaDate.format(new Date());
  const dateParam = params.get('date');
  const booking = params.get('booking');
  const date = validDate(dateParam) && (booking || dateParam >= today) ? dateParam : today;
  const slot = params.get('slot');
  const path = `/turfs/${id}`;
  const returnTo = `${path}?${new URLSearchParams({ date, booking: booking ?? '' })}`;
  return <main className="frame owner-page booking-page">
    <AppLink className="button button-outline owner-back" href="/" navigate={navigate}>Back to turfs</AppLink>
    {booking ? (
      user?.role === 'customer' ? <BookingStatus key={`${date}:${booking}`} path={path} date={date} id={encodeURIComponent(booking)} token={token} navigate={navigate} />
        : sessionStatus === 'checking' ? <Skeleton label="Checking session…" />
          : sessionStatus === 'guest' ? <div><AppLink className="button button-primary" href={authPageHref('login', returnTo)} navigate={navigate}>Log in to see your booking</AppLink></div>
            : user && <p className="account-note">Only customer accounts can book slots.</p>
    ) : <BookingFlow path={path} date={date} today={today} slotStart={slot} checkout={Boolean(slot && params.get('step') === 'checkout')}
      initialRentals={params.getAll('rental')} user={user}
      token={token} sessionStatus={sessionStatus} navigate={navigate} />}
  </main>;
}
