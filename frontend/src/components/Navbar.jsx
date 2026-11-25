
export default function Navbar({ user, onOpenAuth, onLogout }) {
  return (
    <header className="navbar">
      {/* Tier 1: Utility and Auth Header */}
      <div className="nav-tier-top">
        <a href="/" className="brand">
          🏟️ Turf<span>Spot</span>
        </a>

        <div className="nav-actions">
          {/* If user is not an owner, show 'List Your Turf' CTA */}
          {(!user || user.role === 'customer') && (
            <button
              className="nav-link"
              onClick={() => onOpenAuth('signup', 'owner')}
            >
              List Your Turf (Business)
            </button>
          )}

          {user ? (
            <div className="user-menu-pill">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="user-avatar" />
              ) : (
                <div
                  className="user-avatar"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    color: '#fff',
                    backgroundColor: '#3b516b',
                  }}
                >
                  {user.name?.charAt(0) || 'U'}
                </div>
              )}
              <span className="user-name">{user.name}</span>
              <span className="user-role-badge">
                {user.role === 'owner' ? 'Owner' : user.role === 'staff' ? 'Staff' : 'Player'}
              </span>
              <button className="btn-logout" onClick={onLogout} title="Log Out">
                Logout
              </button>
            </div>
          ) : (
            <>
              <button
                className="btn-login"
                onClick={() => onOpenAuth('login')}
              >
                Log In
              </button>
              <button
                className="btn-signup"
                onClick={() => onOpenAuth('signup', 'customer')}
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tier 2: Category Filter Bar */}
      <div className="nav-tier-bottom">
        <a href="#all" className="active">All Courts</a>
        <a href="#football">⚽ 5v5 / 7v7 Football</a>
        <a href="#cricket">🏏 Box Cricket</a>
        <a href="#pickleball">🏓 Pickleball</a>
        <a href="#badminton">🏸 Badminton</a>
        <a href="#floodlit">💡 Floodlit Night Slots</a>
      </div>
    </header>
  );
}
