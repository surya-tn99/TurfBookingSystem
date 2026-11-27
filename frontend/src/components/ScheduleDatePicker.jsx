import { useEffect, useId, useRef, useState } from 'react';

const dayMs = 86_400_000;
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const displayDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
const spokenDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'UTC' });
const dayArrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const dateKey = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);

function firstOfMonth(timestamp, offset = 0) {
  const date = new Date(timestamp);
  return date.setUTCMonth(date.getUTCMonth() + offset, 1);
}

export default function ScheduleDatePicker({ value, today, onChange, disabled }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const dayButton = useRef(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [activeDay, setActiveDay] = useState(() => Date.parse(value));
  const month = firstOfMonth(activeDay);
  const offset = (new Date(month).getUTCDay() + 6) % 7;
  const daysInMonth = (firstOfMonth(month, 1) - month) / dayMs;

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  useEffect(() => {
    if (open && focusDay.current) {
      dayButton.current?.focus();
      focusDay.current = false;
    }
  }, [open, activeDay]);

  function closeCalendar() {
    setOpen(false);
    trigger.current?.focus();
  }

  function moveFocus(event) {
    const shift = dayArrows[event.key];
    if (!shift) return;
    event.preventDefault();
    focusDay.current = true;
    setActiveDay((day) => day + shift * dayMs);
  }

  return <div className="staff-date" ref={root} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (open && event.key === 'Escape') { event.preventDefault(); closeCalendar(); }
  }}>
    <span id={`${id}-label`}>Booking date</span>
    <button ref={trigger} type="button" className="staff-date-trigger" disabled={disabled} aria-expanded={open}
      aria-haspopup="dialog" aria-controls={open ? id : undefined} aria-labelledby={`${id}-label ${id}-value`} onClick={() => {
        if (open) { closeCalendar(); return; }
        focusDay.current = true;
        setActiveDay(Date.parse(value));
        setOpen(true);
      }}>
      <span id={`${id}-value`}>{displayDate.format(Date.parse(value))}</span>
      <span className="staff-date-icon" aria-hidden="true" />
    </button>
    {open && <div className="staff-date-calendar" role="dialog" id={id} aria-label="Choose booking date">
      <div className="staff-calendar-heading">
        <button type="button" className="button button-outline" aria-label="Previous month" onClick={() => setActiveDay(firstOfMonth(month, -1))}>‹</button>
        <strong aria-live="polite">{monthFormat.format(month)}</strong>
        <button type="button" className="button button-outline" aria-label="Next month" onClick={() => setActiveDay(firstOfMonth(month, 1))}>›</button>
      </div>
      <div className="staff-calendar-days" onKeyDown={moveFocus}>
        {weekdays.map((day) => <span key={day} className="staff-calendar-weekday">{day}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={index} aria-hidden="true" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = month + index * dayMs;
          const key = dateKey(day);
          const active = day === activeDay;
          return <button type="button" key={key} ref={active ? dayButton : undefined} tabIndex={active ? 0 : -1}
            aria-label={spokenDate.format(day)} aria-pressed={key === value} aria-current={key === today ? 'date' : undefined}
            onClick={() => { onChange(key); closeCalendar(); }}>{index + 1}</button>;
        })}
      </div>
    </div>}
  </div>;
}
