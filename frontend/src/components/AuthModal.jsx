import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase, authPageHref, requestAuth, serviceUnavailableMessage } from '../auth';
import RoleSelector from './RoleSelector';

const clientId = import.meta.env.GOOGLE_CLIENT_ID.trim();
const googleConfigured = Boolean(apiBase && clientId);
let initializedIdentity;
let activeCredentialHandler;

export default function AuthPanel({ mode, returnPath, onAuthSuccess }) {
  const [role, setRole] = useState('customer');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const googleTarget = useRef(null);
  const submitting = useRef(false);
  const isSignUp = mode === 'signup';

  const authenticate = useCallback(async (fields) => {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    setPending(true);

    try {
      const response = await requestAuth('google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, isSignUp }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.token || !data.user) {
        setError({ mode, message: data?.message || 'Something went wrong. Please try again.' });
        return;
      }
      onAuthSuccess(data);
    } catch {
      setError({ mode, message: serviceUnavailableMessage });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }, [isSignUp, mode, onAuthSuccess]);

  useEffect(() => {
    function handleCredential({ credential }) {
      if (credential) authenticate({ credential, role: isSignUp ? role : undefined });
    }

    activeCredentialHandler = handleCredential;
    return () => {
      if (activeCredentialHandler === handleCredential) activeCredentialHandler = undefined;
    };
  }, [authenticate, isSignUp, role]);

  useEffect(() => {
    if (!googleConfigured) return;
    const target = googleTarget.current;
    const script = document.getElementById('google-identity');
    const showUnavailable = () => setGoogleUnavailable(true);

    function renderGoogleButton() {
      const identity = window.google?.accounts?.id;
      if (!identity) {
        showUnavailable();
        return;
      }

      try {
        if (initializedIdentity !== identity) {
          identity.initialize({
            client_id: clientId,
            callback: (response) => activeCredentialHandler?.(response),
          });
          initializedIdentity = identity;
        }
        target.replaceChildren();
        identity.renderButton(target, {
          theme: 'outline',
          size: 'large',
          width: 240,
          text: isSignUp ? 'signup_with' : 'signin_with',
          shape: 'pill',
        });
        setGoogleUnavailable(false);
      } catch {
        showUnavailable();
      }
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
    } else {
      script?.addEventListener('load', renderGoogleButton);
      script?.addEventListener('error', showUnavailable);
    }

    const timeout = window.setTimeout(() => {
      if (!target.firstChild) showUnavailable();
    }, 8000);

    return () => {
      script?.removeEventListener('load', renderGoogleButton);
      script?.removeEventListener('error', showUnavailable);
      window.clearTimeout(timeout);
      target.replaceChildren();
    };
  }, [isSignUp]);

  return (
    <>
      <nav className="mode-picker" aria-label="Account action">
        <a href={authPageHref('signup', returnPath)} aria-current={isSignUp ? 'page' : undefined}>Sign up</a>
        <a href={authPageHref('login', returnPath)} aria-current={!isSignUp ? 'page' : undefined}>Log in</a>
      </nav>
      <h2>{isSignUp ? 'Get in the game.' : 'Welcome back.'}</h2>
      <p className="account-intro">
        {isSignUp ? 'Create your PickTurf account to get started.' : 'Log in with the Google account you used to join.'}
      </p>
      {error?.mode === mode && <p className="auth-error" role="alert">{error.message}</p>}
      {isSignUp && <RoleSelector selectedRole={role} onSelectRole={(nextRole) => { if (!pending) setRole(nextRole); }} />}
      <div className="google-action" aria-busy={pending} inert={pending}>
        {googleConfigured && <div ref={googleTarget} />}
        {(!googleConfigured || googleUnavailable) && (
          <p className="account-note">
            {googleConfigured ? 'Google sign-in could not load. Refresh the page to try again.' : 'Google sign-in is currently unavailable.'}
          </p>
        )}
      </div>
      {pending && <p className="account-note" role="status">Connecting to PickTurf…</p>}
      {!isSignUp && <p className="account-note">Turf staff can log in with the email their manager registered.</p>}
    </>
  );
}
