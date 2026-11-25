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

export default function Home({ search, navigate }) {
  const params = new URLSearchParams(search);
  const searched = params.has('location') || params.has('sport');
  const location = params.get('location')?.trim() || '';
  const sport = params.get('sport') || '';
  const selectedSport = sports.includes(sport) ? sport : '';
  const locationQuery = location.toLowerCase();
  const results = searched ? venues.filter((venue) => {
    const venueLocation = (venue.area + ' ' + venue.city).toLowerCase();
    const matchesLocation = locationQuery === 'bangalore'
      ? venue.city === 'Bengaluru'
      : venueLocation.includes(locationQuery);
    return matchesLocation
      && (!selectedSport || venue.sports.includes(selectedSport));
  }) : venues;

  function searchTurfs(event) {
    event.preventDefault();
    const filters = new URLSearchParams(new FormData(event.currentTarget));
    navigate(`/?${filters}`);
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

      <form key={search} className="turf-search" aria-label="Find a turf" action="/" method="get" onSubmit={searchTurfs}>
        <label>Location <input name="location" placeholder="City or neighborhood" defaultValue={location} /></label>
        <label>Sport
          <select name="sport" defaultValue={selectedSport}>
            <option value="">All sports</option>
            {sports.map((sport) => <option key={sport}>{sport}</option>)}
          </select>
        </label>
        <button className="button button-primary" type="submit">Find turfs</button>
      </form>

      <section className="home-section" aria-labelledby="results-title">
        <h2 id="results-title">{searched ? 'Search results' : 'Explore sample turfs'}</h2>
        <p className="home-note" role="status">
          {searched && (results.length ? results.length + (results.length === 1 ? ' match. ' : ' matches. ') : 'No matches. Try another location or sport. ')}
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
