export default function ReviewStars({ rating }) {
  return <span className="review-stars" role="img" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= rating ? 'filled' : undefined}>
      {star <= rating ? '★' : '☆'}
    </span>)}
  </span>;
}
