import { useEffect, useState } from 'react';
import LoadingImage from './LoadingImage';

const slideDurationMs = 5_000;

export default function TurfPhotoSlideshow({ photos }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = photos.length;
  const activeIndex = count ? index % count : 0;

  useEffect(() => {
    if (count < 2 || hovered || focused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timeout = window.setTimeout(() => setIndex((activeIndex + 1) % count), slideDurationMs);
    return () => window.clearTimeout(timeout);
  }, [activeIndex, count, focused, hovered]);

  if (!count) return <div className="turf-detail-photo turf-image-empty" aria-hidden="true" />;
  if (count === 1) return <LoadingImage className="turf-detail-photo" src={photos[0]} alt="Turf photo" />;

  return (
    <section
      aria-label="Turf photos"
      aria-roledescription="carousel"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false); }}
    >
      <button
        type="button"
        className="turf-slideshow-image"
        aria-label={`Turf photo ${activeIndex + 1} of ${count}. Show next photo`}
        onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        onClick={() => setIndex((current) => (current + 1) % count)}
      >
        <LoadingImage className="turf-detail-photo" src={photos[activeIndex]} />
      </button>
    </section>
  );
}
