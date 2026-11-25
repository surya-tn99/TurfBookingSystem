import { useEffect, useRef, useState } from 'react';
import { useTextOverflow } from '../useTextOverflow';

export default function NameTooltip({ text, fullName = text, insideLink = false }) {
  const [textRef, overflowing] = useTextOverflow(text);
  const root = useRef(null);
  const pointer = useRef(null);
  const [open, setOpen] = useState(false);
  const visible = overflowing && open;

  useEffect(() => {
    if (!visible) return;
    function dismissOutside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function dismissOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [visible]);

  function handleClick(event) {
    if (!overflowing) return;
    const input = event.nativeEvent.pointerType || pointer.current;
    if (input !== 'touch' && input !== 'pen') return;
    if (insideLink) event.preventDefault();
    setOpen((previous) => !previous);
  }

  return (
    <span
      className="name-tooltip"
      ref={root}
      tabIndex={overflowing && !insideLink ? 0 : undefined}
      onPointerDown={(event) => { pointer.current = event.pointerType; }}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse' && overflowing) setOpen(true); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setOpen(false); }}
      onFocus={(event) => { if (overflowing && event.currentTarget.matches(':focus-visible')) setOpen(true); }}
      onBlur={() => setOpen(false)}
      onClick={handleClick}
    >
      <span ref={textRef} className="name-ellipsis">{text}</span>
      {visible && <span className="name-tooltip-bubble" aria-hidden="true">{fullName}</span>}
    </span>
  );
}
