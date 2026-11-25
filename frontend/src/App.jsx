import { useCallback, useEffect, useState } from 'react';
import AuthPanel from './components/AuthModal';
import Home from './components/Home';
import pitch from './assets/pick-turf-pitch.webp';

const roleNames = { customer: 'Player', owner: 'Turf owner', staff: 'Turf staff' };

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('turf_user'));
    } catch {
      return null;
    }
  });
  const [hash, setHash] = useState(() => window.location.hash);
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const mode = path === '/login' || path === '/signup' ? path.slice(1) : null;
  const isHome = path === '/' && !hash;

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
    localStorage.setItem('turf_token', token);
    localStorage.setItem('turf_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  function signOut() {
    localStorage.removeItem('turf_token');
    localStorage.removeItem('turf_user');
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
            ) : (
              <>
                <a className="button button-plain" href="/login">Log in</a>
                <a className="button button-primary" href="/signup">Sign up</a>
              </>
            )}
          </nav>
        </div>
      </header>

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
          ) : (
            <AuthPanel mode={mode} onAuthSuccess={handleAuthSuccess} />
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
