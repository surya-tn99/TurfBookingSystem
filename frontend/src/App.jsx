import { useCallback, useEffect, useState } from 'react';
import AuthPanel from './components/AuthModal';
import Home from './components/Home';
import pitch from './assets/pick-turf-pitch.webp';
import { apiBase, authPageHref, loginReturnPath, requestAuth, serviceUnavailableMessage } from './auth';

const roleNames = { customer: 'Player', owner: 'Turf owner', staff: 'Turf staff' };

function savedToken() {
  try {
    return localStorage.getItem('turf_token');
  } catch {
    return null;
  }
}

function clearSavedSession() {
  localStorage.removeItem('turf_token');
  localStorage.removeItem('turf_user');
}

export default function App() {
  const [user, setUser] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(() => savedToken() ? 'checking' : 'guest');
  const [sessionCheck, setSessionCheck] = useState(0);
  const [hash, setHash] = useState(() => window.location.hash);
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const mode = path === '/login' || path === '/signup' ? path.slice(1) : null;
  const isHome = path === '/' && !hash;
  const search = window.location.search;
  const returnPath = mode ? loginReturnPath(new URLSearchParams(search).get('returnTo'))
    : isHome ? '/' + search : '/';

  const recheckSession = useCallback(() => {
    setUser(null);
    setSessionStatus(savedToken() ? 'checking' : 'guest');
    setSessionCheck((count) => count + 1);
  }, []);

  useEffect(() => {
    function handleStorage(event) {
      if (event.key === 'turf_token' || event.key === null) recheckSession();
    }
    function handlePageShow(event) {
      if (event.persisted) recheckSession();
    }
    window.addEventListener('storage', handleStorage);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [recheckSession]);

  useEffect(() => {
    const token = savedToken();
    if (!token) return;

    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && savedToken() === token;

    async function verifySession() {
      try {
        if (!apiBase) throw new Error(serviceUnavailableMessage);
        const response = await requestAuth('me', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (response.status === 401 || response.status === 403) {
          clearSavedSession();
          setSessionStatus('guest');
          return;
        }

        const data = await response.json();
        if (!response.ok || !data.user?.id) throw new Error(serviceUnavailableMessage);
        if (isCurrent()) {
          setUser(data.user);
          setSessionStatus('verified');
        }
      } catch {
        if (isCurrent()) setSessionStatus('unavailable');
      }
    }

    verifySession();
    return () => controller.abort();
  }, [sessionCheck]);

  useEffect(() => {
    function updateHash() {
      setHash(window.location.hash);
    }
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);

  useEffect(() => {
    const title = isHome ? 'Find your next game' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Page not found';
    document.title = `${title} | PickTurf`;
  }, [isHome, mode]);
  const handleAuthSuccess = useCallback(({ token, user: nextUser }) => {
    localStorage.removeItem('turf_user');
    localStorage.setItem('turf_token', token);
    setUser(nextUser);
    setSessionStatus('verified');
    if (mode === 'login') window.location.replace(returnPath);
  }, [mode, returnPath]);

  function signOut() {
    clearSavedSession();
    setUser(null);
    window.location.assign('/login');
  }

  return (
    <>
      <header className="site-header">
        <div className="frame header-inner">
          <a className="brand" href="/" aria-label="PickTurf home">
            Pick<span>Turf</span>
          </a>
          <nav className="header-actions" aria-label="Account">
            {user ? (
              <details className="user-menu">
                <summary>{user.name}</summary>
                <button className="button button-outline" type="button" onClick={signOut}>Log out</button>
              </details>
            ) : sessionStatus === 'checking' ? (
              <span className="account-note" role="status">Checking session…</span>
            ) : (
              <>
                <a className="button button-plain" href={authPageHref('login', returnPath)}>Log in</a>
                <a className="button button-primary" href={authPageHref('signup', returnPath)}>Sign up</a>
              </>
            )}
          </nav>
        </div>
      </header>

      {sessionStatus === 'unavailable' && (
        <div className="frame auth-error session-notice">
          <span role="alert">{serviceUnavailableMessage}</span>
          <button className="button button-outline" type="button" onClick={recheckSession}>Retry</button>
        </div>
      )}

      {mode ? <main className="frame main-layout">
        <section className="pitch" aria-labelledby="pitch-title">
          <img src={pitch} alt="" fetchPriority="high" />
          <div className="pitch-copy">
            <h1 id="pitch-title">Make time<br />to <em>play.</em></h1>
            <p>A home for pickup games, regular teams, and the people who run your local turfs.</p>
          </div>
        </section>

        <section className="account-card" aria-label="Your PickTurf account">
          {user ? (
            <div className="account-summary">
              <span className="account-role">{roleNames[user.role] ?? 'Member'}</span>
              <h2>Welcome, {user.name}.</h2>
              <p>You're signed in as {user.email}.</p>
            </div>
          ) : sessionStatus === 'checking' ? (
            <p className="account-note">Checking your PickTurf session…</p>
          ) : (
            <AuthPanel mode={mode} returnPath={returnPath} onAuthSuccess={handleAuthSuccess} />
          )}
        </section>
      </main> : isHome ? <Home /> : (
        <main className="frame not-found">
          <h1>Page not found</h1>
          <p>The page you’re looking for may have moved or the link may be incorrect.</p>
          <a className="button button-primary" href="/">Back to home</a>
        </main>
      )}

      <footer className="frame site-footer">
        <span>© {new Date().getFullYear()} PickTurf</span>
        <span>Football · Box cricket · Pickleball · Badminton</span>
      </footer>
    </>
  );
}
