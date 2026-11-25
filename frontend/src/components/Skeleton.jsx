export default function Skeleton({ label, variant = 'panel' }) {
  return (
    <div>
      <p className="loading-status" role="status">{label}</p>
      {variant === 'cards' ? (
        <div className="owner-turf-grid" aria-hidden="true">
          {[0, 1, 2].map((index) => <div className="owner-panel owner-turf" key={index}>
            <div className="owner-turf-photo skeleton-block" />
            <div className="skeleton-title skeleton-block" />
            <div className="skeleton-short skeleton-block" />
          </div>)}
        </div>
      ) : variant === 'account' ? (
        <span className="skeleton-account skeleton-block" aria-hidden="true" />
      ) : (
        <div className="skeleton-layout" aria-hidden="true">
          {variant === 'turf' && <div className="turf-detail-photo skeleton-block" />}
          <div className="owner-panel skeleton-layout">
            <div className="skeleton-title skeleton-block" />
            <div className="skeleton-line skeleton-block" />
            <div className="skeleton-short skeleton-block" />
          </div>
          {variant === 'turf' && <div className="owner-panel skeleton-layout">
            <div className="skeleton-short skeleton-block" />
            <div className="skeleton-line skeleton-block" />
          </div>}
        </div>
      )}
    </div>
  );
}
