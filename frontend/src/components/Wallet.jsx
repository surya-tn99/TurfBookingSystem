import { useEffect, useRef, useState } from 'react';
import { profileSettingsPath, publicTurfPath } from '../auth';
import { bookingPrice, turfRequest } from '../turfApi';
import { useTurfRequest } from '../useTurfRequest';
import AppLink from './AppLink';
import { BookingFeedbackForm } from './BookingFeedback';
import ReviewStars from './ReviewStars';
import Skeleton from './Skeleton';

const bookingDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });

function paymentLabel(booking) {
  if (booking.status === 'cancelled') return 'Canceled';
  if (booking.status === 'expired') return 'Hold expired';
  if (booking.status === 'pending') return 'Payment pending';
  if (booking.paymentMethod === 'venue') return booking.completed ? 'Payment at venue' : 'Pay at venue';
  return booking.paymentMethod === 'online' ? 'Paid online' : 'No payment needed';
}

function CancelBooking({ booking, path, token, onCancelled }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function cancel() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setBusy(true);
    try {
      await turfRequest(`${path}/bookings/${booking.date}/${booking.id}/cancel`, { token, method: 'PATCH', signal: controller.signal });
      if (!controller.signal.aborted) onCancelled();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return confirming ? <>
    <p>Cancel this slot and its equipment rentals?</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="owner-actions">
      <button className="button button-outline button-danger" type="button" disabled={busy} onClick={cancel}>
        {busy ? 'Canceling…' : 'Confirm cancellation'}
      </button>
      <button className="button button-outline" type="button" disabled={busy} onClick={() => { setConfirming(false); setError(''); }}>
        Keep booking
      </button>
    </div>
  </> : <div className="owner-actions">
    <button className="button button-outline button-danger" type="button" onClick={() => setConfirming(true)}>Cancel booking</button>
  </div>;
}

function WalletBooking({ booking, token, navigate, showBookingLink, reviewing, onReview, onSaved, onCancelled }) {
  const path = publicTurfPath(booking.turfId);
  const bookingHref = showBookingLink && path && `${path}?${new URLSearchParams({ date: booking.date, booking: booking.id })}`;
  const showReviewButton = booking.canReview && !reviewing;
  return <article className="owner-panel wallet-booking">
    <div className="wallet-booking-heading">
      <h3>{booking.turfName}</h3>
      <strong>{bookingPrice(booking.amount)}</strong>
    </div>
    <p>{bookingDate.format(Date.parse(booking.date))} · {booking.startTime}–{booking.endTime} IST</p>
    <p className="account-note">{paymentLabel(booking)}</p>
    {booking.equipment.length > 0 && <p>Equipment · {booking.equipment.map(({ name, quantity }) => `${name} × ${quantity}`).join(', ')}</p>}
    {booking.review && <dl className="wallet-booking-review">
      <div className="wallet-review-rating"><dt>Your rating</dt><dd><ReviewStars rating={booking.review.rating} /></dd></div>
      {booking.review.comment && <div><dt>Your feedback</dt><dd>{booking.review.comment}</dd></div>}
      {booking.review.reply && <div><dt>Turf reply</dt><dd>{booking.review.reply}</dd></div>}
    </dl>}
    {(bookingHref || showReviewButton) && <div className="owner-actions">
      {bookingHref && <AppLink className="button button-outline" href={bookingHref} navigate={navigate}>View booking</AppLink>}
      {showReviewButton && <button type="button" className="button button-primary" onClick={() => onReview(booking.id)}>Rate and review</button>}
    </div>}
    {path && booking.canCancel && <CancelBooking booking={booking} path={path} token={token} onCancelled={onCancelled} />}
    {booking.cancellationNote && <p className="account-note">{booking.cancellationNote}</p>}
    {booking.canReview && reviewing && <BookingFeedbackForm booking={booking} token={token} dismiss={() => onReview(null)} onSaved={onSaved} />}
  </article>;
}

export default function Wallet({ token, navigate }) {
  const { data, error, reload } = useTurfRequest('/turfs/bookings', token);
  const [reviewing, setReviewing] = useState(null);
  const [notice, setNotice] = useState('');

  function reviewSaved() {
    setReviewing(null);
    setNotice('Thanks for rating your visit.');
    reload();
  }

  return <main className="frame owner-page booking-page">
    <AppLink className="button button-outline owner-back" href={profileSettingsPath} navigate={navigate}>Back to Profile</AppLink>
    <h1>Wallet</h1>
    {notice && <p role="status">{notice}</p>}
    {error && <div>
      <p className="auth-error" role="alert">{error.message}</p>
      <button type="button" className="button button-outline" onClick={reload}>Retry</button>
    </div>}
    {!data && !error && <Skeleton label="Loading your bookings…" />}
    {data && [['current', 'Current bookings', 'You have no current bookings.'], ['previous', 'Previous bookings', 'You have no previous bookings.']]
      .map(([key, title, empty]) => <section className="wallet-bookings" key={key} aria-labelledby={`wallet-${key}`}>
        <h2 id={`wallet-${key}`}>{title}</h2>
        {data[key].length ? data[key].map((booking) => <WalletBooking key={booking.id} booking={booking} token={token} navigate={navigate}
          showBookingLink={key === 'current'} reviewing={reviewing === booking.id} onReview={setReviewing} onSaved={reviewSaved}
          onCancelled={() => { setNotice('Booking canceled.'); reload(); }} />) : <p className="account-note">{empty}</p>}
      </section>)}
  </main>;
}
