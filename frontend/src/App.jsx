import { useCallback, useEffect, useState } from 'react';
import AppLink from './components/AppLink';
import AuthPanel from './components/AuthModal';
import Home from './components/Home';
import ProfileSetup from './components/ProfileSetup';
import UserMenu from './components/UserMenu';
import pitch from './assets/pick-turf-pitch.webp';
import { apiBase, authPageHref, loginReturnPath, requestAuth, serviceUnavailableMessage } from './auth';
import { useNavigation } from './navigation';

const roleNames = { customer: 'Player', owner: 'Turf owner', staff: 'Turf staff' };

function landingPageFor(user) {
  return user.role === 'owner' ? '/owner' : '/';
}

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
  const { route: { pathname, search, hash }, navigate } = useNavigation();
  const path = pathname.replace(/\/$/, '') || '/';
  const mode = path === '/login' || path === '/signup' ? path.slice(1) : null;
  const isHome = path === '/' && !hash;
  const isProfile = path === '/complete-profile';
  const isOwner = path === '/owner';
  const isProtected = isProfile || isOwner;
  const returnPath = mode ? loginReturnPath(new URLSearchParams(search).get('returnTo'))
    : isHome ? '/' + search : '/';
  let redirectTo;
  if (user?.needsProfile && !isProfile) redirectTo = '/complete-profile';
  else if (isProfile && user && !user.needsProfile) redirectTo = landingPageFor(user);
  else if (isProtected && sessionStatus === 'guest') redirectTo = '/login';
  else if (isOwner && user && user.role !== 'owner') redirectTo = '/';

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
    const titles = { login: 'Log in', signup: 'Sign up', '/complete-profile': 'Complete your profile', '/owner': 'Turf owner' };
    const title = isHome ? 'Find your next game' : titles[mode || path] || 'Page not found';
    document.title = `${title} | PickTurf`;
  }, [isHome, mode, path]);

  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [navigate, redirectTo]);

  const handleAuthSuccess = useCallback(({ token, user: nextUser }) => {
    localStorage.removeItem('turf_user');
    localStorage.setItem('turf_token', token);
    setUser(nextUser);
    setSessionStatus('verified');
    if (nextUser.needsProfile) navigate('/complete-profile', { replace: true });
    else if (mode === 'login') navigate(returnPath, { replace: true });
  }, [mode, navigate, returnPath]);

  function finishProfile(nextUser) {
    setUser(nextUser);
    navigate(landingPageFor(nextUser), { replace: true });
  }

  function signOut() {
    clearSavedSession();
    setUser(null);
    setSessionStatus('guest');
    navigate('/login');
  }

  return (
    <>
      {!mode && !isProfile && !redirectTo && <header className="site-header">
        <div className="frame header-inner">
          <AppLink className="brand" href="/" navigate={navigate} aria-label="PickTurf home">
            Pick<span>Turf</span>
          </AppLink>
          <nav className="header-actions" aria-label="Account">
            {user ? (
              <UserMenu name={user.name} onLogout={signOut} />
            ) : sessionStatus === 'checking' ? (
              <span className="account-note" role="status">Checking session…</span>
            ) : (
              <>
                <AppLink className="button button-plain" href={authPageHref('login', returnPath)} navigate={navigate}>Log in</AppLink>
                <AppLink className="button button-primary" href={authPageHref('signup', returnPath)} navigate={navigate}>Sign up</AppLink>
              </>
            )}
          </nav>
        </div>
      </header>}

      {sessionStatus === 'unavailable' && (
        <div className="frame auth-error session-notice">
          <span role="alert">{serviceUnavailableMessage}</span>
          <button className="button button-outline" type="button" onClick={recheckSession}>Retry</button>
        </div>
      )}

      {redirectTo || (isProtected && !user) ? (
        <main className="frame profile-layout">
          {sessionStatus !== 'unavailable' && <p className="account-note" role="status">Checking your PickTurf session…</p>}
        </main>
      ) : isProfile ? (
        <ProfileSetup key={user.id} user={user} token={savedToken()} onComplete={finishProfile} onLogout={signOut} />
      ) : isOwner ? (
        <main className="frame profile-layout">
          <section className="account-card" aria-labelledby="owner-title">
            <h1 id="owner-title">Welcome, {user.name}.</h1>
            <p className="account-intro">Your turf owner profile is complete. Turf registration will be available in a future update.</p>
            <AppLink className="button button-outline auth-home-link" href="/" navigate={navigate}>Back to home</AppLink>
          </section>
        </main>
      ) : mode ? <main className="frame main-layout">
        <section className="pitch" aria-labelledby="pitch-title">
          <img src={pitch} alt="" fetchPriority="high" />
          <div className="pitch-copy">
            <h1 id="pitch-title">Make time<br />to <em>play.</em></h1>
            <p>A home for pickup games, regular teams, and the people who run your local turfs.</p>
          </div>
        </section>

        <section className="account-card" aria-label="Your PickTurf account">
          <AppLink className="brand account-brand" href="/" navigate={navigate} aria-label="PickTurf home">
            Pick<span>Turf</span>
          </AppLink>
          {user ? (
            <div className="account-summary">
              <span className="account-role">{roleNames[user.role] ?? 'Member'}</span>
              <h2>Welcome, {user.name}.</h2>
              <p>You're signed in as {user.email}.</p>
            </div>
          ) : sessionStatus === 'checking' ? (
            <p className="account-note">Checking your PickTurf session…</p>
          ) : (
            <AuthPanel key={mode + search} mode={mode} returnPath={returnPath} navigate={navigate} onAuthSuccess={handleAuthSuccess} />
          )}
          <AppLink className="button button-outline auth-home-link" href="/" navigate={navigate}>Back to home</AppLink>
        </section>
      </main> : isHome ? <Home search={search} navigate={navigate} /> : (
        <main className="frame not-found">
          <h1>Page not found</h1>
          <p>The page you’re looking for may have moved or the link may be incorrect.</p>
          <AppLink className="button button-primary" href="/" navigate={navigate}>Back to home</AppLink>
        </main>
      )}

      <footer className="frame site-footer">
        <span>© {new Date().getFullYear()} PickTurf</span>
        <span>Football · Box cricket · Pickleball · Badminton</span>
      </footer>
    </>
  );
}
