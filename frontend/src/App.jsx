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
  const [page, setPage] = useState(() => window.location.hash.slice(1));
  const mode = page === 'login' || page === 'signup' ? page : null;

  useEffect(() => {
    function updatePage() {
      setPage(window.location.hash.slice(1));
      window.scrollTo(0, 0);
    }

    window.addEventListener('hashchange', updatePage);
    return () => window.removeEventListener('hashchange', updatePage);
  }, []);

  function showAccount(nextMode) {
    window.location.hash = nextMode;
  }
  const handleAuthSuccess = useCallback(({ token, user: nextUser }) => {
    localStorage.setItem('turf_token', token);
    localStorage.setItem('turf_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  function signOut() {
    localStorage.removeItem('turf_token');
    localStorage.removeItem('turf_user');
    showAccount('login');
    setUser(null);
  }

  return (
    <>
      <header className="site-header">
        <div className="frame header-inner">
          <a className="brand" href="#home" aria-label="PickTurf home">
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
                <button className="button button-plain" onClick={() => showAccount('login')}>Log in</button>
                <button className="button button-primary" onClick={() => showAccount('signup')}>Sign up</button>
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
            <AuthPanel mode={mode} onModeChange={showAccount} onAuthSuccess={handleAuthSuccess} />
          )}
        </section>
      </main> : <Home />}

      <footer className="frame site-footer">
        <span>© {new Date().getFullYear()} PickTurf</span>
        <span>Football · Box cricket · Pickleball · Badminton</span>
      </footer>
    </>
  );
}
