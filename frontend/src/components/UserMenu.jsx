import { useId, useRef, useState } from 'react';

export default function UserMenu({ name, onLogout }) {
  const [open, setOpen] = useState(false);
  const controls = useId();
  const trigger = useRef(null);
  const logoutButton = useRef(null);

  return (
    <div
      className="user-menu"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && document.activeElement !== logoutButton.current) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          trigger.current.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="user-menu-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={controls}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (!event.repeat) setOpen((expanded) => !expanded);
        }}
        onClick={(event) => {
          if (event.nativeEvent.pointerType === 'mouse') setOpen(true);
          else setOpen((expanded) => !expanded);
        }}
      >
        {name}
      </button>
      <div className="user-menu-popover" id={controls} hidden={!open}>
        <button ref={logoutButton} className="button button-outline" type="button" onClick={onLogout}>Log out</button>
      </div>
    </div>
  );
}
