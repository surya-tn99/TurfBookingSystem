import { useEffect, useRef, useState } from 'react';
import { staffFeedbackPath, staffPath } from '../auth';
import { turfRequest } from '../turfApi';
import { useTurfRequest } from '../useTurfRequest';
import AppLink from './AppLink';
import Skeleton from './Skeleton';
import TurfSchedule from './TurfSchedule';

function FeedbackReply({ item, token }) {
  const [savedReply, setSavedReply] = useState(item.reply ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function reply(event) {
    event.preventDefault();
    if (request.current) return;
    const replyText = new FormData(event.currentTarget).get('reply');
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      const { feedback } = await turfRequest(`/staff/feedback/${item.id}/reply`, {
        token, method: 'PUT', body: { reply: replyText }, signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setSavedReply(feedback.find(({ id }) => id === item.id)?.reply ?? replyText);
        setSaved(true);
      }
    } catch (problem) {
      if (!controller.signal.aborted) setError(problem.message);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <article className="staff-booking">
    <strong>{item.name || 'Customer'} · {item.rating}/5</strong>
    {item.comment && <p>{item.comment}</p>}
    <form className="owner-form" onSubmit={reply}>
      <label>Your reply<textarea name="reply" defaultValue={item.reply ?? ''} maxLength={2000} required rows={3} /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {saved && <p role="status">Reply saved.</p>}
      <div className="owner-actions"><button className="button button-primary" disabled={busy}>
        {busy ? 'Saving…' : savedReply ? 'Update reply' : 'Send reply'}
      </button></div>
    </form>
  </article>;
}

function StaffFeedback({ token }) {
  const { data, error, reload } = useTurfRequest('/staff/feedback', token);
  return <section className="owner-panel booking-panel" aria-labelledby="staff-feedback-title">
    <div><h2 id="staff-feedback-title">Customer feedback</h2>{data && <p className="account-note">{data.turf.name}</p>}</div>
    {error && <div><p className="auth-error" role="alert">{error.message}</p><button type="button" className="button button-outline" onClick={reload}>Retry</button></div>}
    {!error && !data && <Skeleton label="Loading customer feedback…" />}
    {data?.feedback.length === 0 && <p className="account-note">No customer feedback yet.</p>}
    {data?.feedback.map((item) => <FeedbackReply key={item.id} item={item} token={token} />)}
  </section>;
}

export default function StaffDashboard({ feedback, token, navigate }) {
  return <main className="frame owner-page booking-page">
    <h1>Staff dashboard</h1>
    <nav className="owner-actions" aria-label="Staff sections">
      <AppLink className={`button ${feedback ? 'button-outline' : 'button-primary'}`} href={staffPath} navigate={navigate}
        aria-current={feedback ? undefined : 'page'}>Schedule</AppLink>
      <AppLink className={`button ${feedback ? 'button-primary' : 'button-outline'}`} href={staffFeedbackPath} navigate={navigate}
        aria-current={feedback ? 'page' : undefined}>Customer feedback</AppLink>
    </nav>
    {feedback ? <StaffFeedback token={token} /> : <TurfSchedule endpoint="/staff" token={token} allowWalkIns />}
  </main>;
}
