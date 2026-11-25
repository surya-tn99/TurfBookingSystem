import { useState } from 'react';
import pitch from '../assets/pick-turf-pitch.webp';
import outdoorPitch from '../assets/turf-outdoor.jpg';
import topView from '../assets/turf topview.jpg';

const sports = ['Football', 'Box cricket', 'Pickleball', 'Badminton'];
const venues = [
  { name: 'The Five Yard', area: 'Velachery', city: 'Chennai', sports: [sports[0], sports[1]], image: outdoorPitch },
  { name: 'Baseline Club', area: 'Anna Nagar', city: 'Chennai', sports: [sports[2], sports[3]], image: pitch },
  { name: 'After Hours Arena', area: 'Whitefield', city: 'Bengaluru', sports: [sports[0], sports[1]], image: outdoorPitch },
  { name: 'Court Social', area: 'Indiranagar', city: 'Bengaluru', sports: [sports[2], sports[3]], image: pitch },
];

export default function Home() {
  const [search, setSearch] = useState(null);
  const results = search ? venues.filter((venue) => {
    const location = (venue.area + ' ' + venue.city).toLowerCase();
    const matchesLocation = search.location === 'bangalore'
      ? venue.city === 'Bengaluru'
      : location.includes(search.location);
    return matchesLocation
      && (!search.sport || venue.sports.includes(search.sport));
  }) : venues;

  function findTurfs(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSearch({
      location: fields.get('location').trim().toLowerCase(),
      sport: fields.get('sport'),
    });
  }

  return (
    <main className="frame home">
      <section className="pitch home-pitch" aria-labelledby="home-title">
        <img src={topView} alt="" fetchPriority="high" />
        <div className="pitch-copy">
          <h1 id="home-title">Find your next <em>game.</em></h1>
          <p>Find a place to play with your team, close to home.</p>
        </div>
      </section>

      <form className="turf-search" aria-label="Find a turf" onSubmit={findTurfs}>
        <label>Location <input name="location" placeholder="City or neighborhood" /></label>
        <label>Sport
          <select name="sport" defaultValue="">
            <option value="">All sports</option>
            {sports.map((sport) => <option key={sport}>{sport}</option>)}
          </select>
        </label>
        <button className="button button-primary" type="submit">Find turfs</button>
      </form>

      <section className="home-section" aria-labelledby="results-title">
        <h2 id="results-title">{search ? 'Search results' : 'Explore sample turfs'}</h2>
        <p className="home-note" role="status">
          {search && (results.length ? results.length + (results.length === 1 ? ' match. ' : ' matches. ') : 'No matches. Try another location or sport. ')}
          Listings and photos are illustrative.
        </p>
        <div className="venue-grid">
          {results.map((venue) => (
            <article className="venue" key={venue.name}>
              <div className="venue-image"><img src={venue.image} alt="" loading="lazy" /></div>
              <div className="venue-details">
                <h3>{venue.name}</h3>
                <p>{venue.area}, {venue.city}</p>
                <ul aria-label="Sports">{venue.sports.map((sport) => <li key={sport}>{sport}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
