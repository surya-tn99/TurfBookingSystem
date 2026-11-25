import { useEffect, useRef, useState } from 'react';

export function useTextOverflow(text) {
  const ref = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (active) setOverflowing(element.scrollWidth > element.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [text]);

  return [ref, overflowing];
}
