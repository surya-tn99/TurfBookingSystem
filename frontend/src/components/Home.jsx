import { useEffect, useState } from 'react';
import topView from '../assets/turf topview.jpg';
import { apiBase, publicTurfPath } from '../auth';
import AppLink from './AppLink';
import LoadingImage from './LoadingImage';
import { Dropdown } from './Dropdown';
import NameTooltip from './NameTooltip';
import Skeleton from './Skeleton';

const normalizeLocation = (value) => value.toLowerCase().replace(/\bbangalore\b/g, 'bengaluru');

export default function Home({ search, navigate }) {
  const [venues, setVenues] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const params = new URLSearchParams(search);
  const searched = params.has('location') || params.has('sport');
  const location = params.get('location')?.trim() || '';
  const sport = params.get('sport')?.trim() || '';
  const sportQuery = sport.toLowerCase();
  const locationQuery = normalizeLocation(location);
  const sports = new Map((venues ?? []).flatMap((venue) =>
    venue.sports.map((name) => [name.toLowerCase(), name])));
  const exactSport = sports.has(sportQuery);
  if (sportQuery && !exactSport) sports.set(sportQuery, sport);
  const sportOptions = [...sports.values()].sort((a, b) => a.localeCompare(b));
  const results = (venues ?? []).filter((venue) => {
    const venueLocation = normalizeLocation([venue.area, venue.city, venue.state].filter(Boolean).join(' '));
    return venueLocation.includes(locationQuery) && (!sportQuery || venue.sports.some((name) => (
      exactSport ? name.toLowerCase() === sportQuery : name.toLowerCase().includes(sportQuery)
    )));
  });

  useEffect(() => {
    const controller = new AbortController();
    async function loadTurfs() {
      try {
        if (!apiBase) throw new Error();
        const response = await fetch(`${apiBase}/turfs`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.turfs)) throw new Error();
        if (!controller.signal.aborted) setVenues(data.turfs.flatMap((venue) => {
          const href = publicTurfPath(venue.id) || publicTurfPath(venue._id);
          return href ? [{ ...venue, href }] : [];
        }));
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      }
    }
    loadTurfs();
    return () => controller.abort();
  }, [attempt]);

  function searchTurfs(event) {
    event.preventDefault();
    const filters = new URLSearchParams(new FormData(event.currentTarget));
    navigate(`/?${filters}`);
  }

  return (
    <main className="frame home">
      <section className="pitch home-pitch" aria-labelledby="home-title">
        <LoadingImage src={topView} fetchPriority="high" />
        <div className="pitch-copy">
          <h1 id="home-title">Find your next <em>game.</em></h1>
          <p>Find a place to play with your team, close to home.</p>
        </div>
      </section>

      <form key={search} className="turf-search" aria-label="Find a turf" action="/" method="get" onSubmit={searchTurfs}>
        <label>Location <input name="location" placeholder="City or neighborhood" defaultValue={location} /></label>
        <Dropdown label="Sport" name="sport" defaultValue={sportQuery} options={[
          { value: '', label: 'All sports' }, ...sportOptions.map((label) => ({ value: label.toLowerCase(), label })),
        ]} />
        <button className="button button-primary" type="submit">Find turfs</button>
      </form>

      <section className="home-section" aria-labelledby="results-title">
        <h2 id="results-title">{searched ? 'Search results' : 'Explore turfs'}</h2>
        {!venues && !unavailable && <Skeleton label="Loading turf listings…" variant="venues" />}
        {unavailable && <div className="auth-error session-notice">
          <span role="alert">Turf listings are temporarily unavailable.</span>
          <button className="button button-outline" type="button" onClick={() => { setUnavailable(false); setAttempt(attempt + 1); }}>Retry</button>
        </div>}
        {venues && (!results.length || searched) && <p className="home-note" role="status">
          {results.length ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}.`
            : searched ? 'No matches. Try another location or sport.' : 'No turfs are ready to list yet.'}
        </p>}
        {results.length > 0 && (
          <div className="venue-grid">
            {results.map((venue) => (
              <article className="venue" key={venue.href}>
                <AppLink className="venue-link" href={venue.href} navigate={navigate}>
                  {venue.image ? <LoadingImage className="venue-image" src={venue.image} loading="lazy" />
                    : <div className="venue-image turf-image-empty" aria-hidden="true" />}
                  <div className="venue-details">
                    <h3><NameTooltip text={venue.name} insideLink /></h3>
                    {venue.street && <p>{venue.street}</p>}
                    {venue.city && <p>{venue.city}</p>}
                    {Number.isFinite(venue.rating) ? (
                      <p className="venue-rating"><span aria-hidden="true">★</span> {venue.rating.toFixed(1)} / 5</p>
                    ) : <p className="venue-rating">No ratings yet</p>}
                  </div>
                </AppLink>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
