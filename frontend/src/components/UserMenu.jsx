import { useId, useRef, useState } from 'react';
import AppLink from './AppLink';
import { managerPath } from '../ownerApi';
import { useTextOverflow } from '../useTextOverflow';

export default function UserMenu({ name, onLogout, isOwner, navigate }) {
  const [open, setOpen] = useState(false);
  const controls = useId();
  const trigger = useRef(null);
  const popover = useRef(null);
  const [nameRef, overflowing] = useTextOverflow(name);

  return (
    <div
      className="user-menu"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && !popover.current?.contains(document.activeElement)) setOpen(false);
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
        <span className="name-ellipsis" ref={nameRef}>{name}</span>
      </button>
      <div ref={popover} className="user-menu-popover" id={controls} hidden={!open}>
        {overflowing && <span className="user-menu-full-name" aria-hidden="true">{name}</span>}
        {isOwner && <AppLink className="button button-outline" href={managerPath} navigate={(href) => { setOpen(false); navigate(href); }}>Dashboard</AppLink>}
        <button className="button button-outline" type="button" onClick={onLogout}>Log out</button>
      </div>
    </div>
  );
}
