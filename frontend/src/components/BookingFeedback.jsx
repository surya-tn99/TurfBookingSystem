import { useEffect, useRef, useState } from 'react';
import { turfRequest } from '../turfApi';

function FeedbackForm({ booking, token, dismiss, onSaved }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (request.current) return;
    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await turfRequest(`/turfs/${booking.turfId}/bookings/${booking.date}/${booking.id}/feedback`, {
        token, signal: controller.signal, body: { rating: Number(fields.get('rating')), comment: fields.get('comment') },
      });
      if (!controller.signal.aborted) onSaved();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section className="frame owner-panel feedback-prompt" aria-labelledby="booking-feedback-title">
    <h2 id="booking-feedback-title">How was your game?</h2>
    <p><strong>{booking.turfName}</strong> · {booking.date} · {booking.startTime}–{booking.endTime} IST</p>
    <form className="owner-form" onSubmit={submit}>
      <fieldset className="owner-form-fields" disabled={busy}>
        <legend>Rate your visit</legend>
        <div className="feedback-ratings">
          {[1, 2, 3, 4, 5].map((rating) => <label key={rating}>
            <input type="radio" name="rating" value={rating} required aria-label={`${rating} out of 5 stars`} />
            <span aria-hidden="true">{rating} ★</span>
          </label>)}
        </div>
        <label>Comment (optional)<textarea name="comment" rows="3" maxLength="1000" /></label>
      </fieldset>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="owner-actions">
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
        <button type="button" className="button button-outline" disabled={busy} onClick={dismiss}>Not now</button>
      </div>
    </form>
  </section>;
}

export default function BookingFeedback({ token, visible }) {
  const [booking, setBooking] = useState(null);
  const [handled, setHandled] = useState(() => new Set());
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let loading = false;
    async function check() {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const data = await turfRequest('/turfs/feedback/pending', { token, signal: controller.signal });
        if (!controller.signal.aborted) setBooking(data.booking);
      } catch {
        // Feedback can wait until the next successful check.
      } finally { loading = false; }
    }
    check();
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [token, visible]);

  if (!visible) return null;
  if (!booking || handled.has(booking.id)) {
    return saved ? <p className="frame feedback-prompt" role="status">Thanks for rating your visit.</p> : null;
  }
  function finish(wasSaved) {
    setHandled((previous) => new Set([...previous, booking.id]));
    setSaved(wasSaved);
  }
  return <FeedbackForm key={booking.id} booking={booking} token={token} dismiss={() => finish(false)} onSaved={() => finish(true)} />;
}
