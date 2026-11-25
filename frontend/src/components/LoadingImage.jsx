import { useState } from 'react';

export default function LoadingImage({ className = '', src, alt = '', ...imageProps }) {
  const [result, setResult] = useState(null);
  const pending = result?.src !== src;
  const unavailable = !pending && result.failed;
  return (
    <span className={`image-shell ${className}${pending ? ' image-shell-pending' : ''}${unavailable ? ' image-shell-unavailable' : ''}`}>
      <img
        {...imageProps}
        key={src}
        src={src}
        alt={alt}
        onLoad={() => setResult({ src, failed: false })}
        onError={() => setResult({ src, failed: true })}
      />
    </span>
  );
}
