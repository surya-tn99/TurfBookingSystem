import { useEffect, useId, useRef, useState } from 'react';

function useOptions(items, onChoose) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [above, setAbove] = useState(false);
  const visible = open && items.length > 0;
  const activeIndex = active < items.length ? active : -1;

  function show(index = -1) {
    const bounds = document.getElementById(id).getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const height = viewport?.height ?? window.innerHeight;
    const below = top + height - bounds.bottom;
    setAbove(below < Math.min(items.length * 44 + 12, height * .42, 288) && bounds.top - top > below);
    setActive(index);
    setOpen(true);
  }

  function choose(index) {
    if (items[index]) onChoose(items[index].value);
    setOpen(false);
  }

  function navigate(event) {
    if (event.key === 'Escape' && visible) {
      event.preventDefault();
      setOpen(false);
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return false;
      event.preventDefault();
      const down = event.key === 'ArrowDown';
      if (!visible || activeIndex < 0) show(down ? 0 : items.length - 1);
      else setActive(Math.max(0, Math.min(items.length - 1, activeIndex + (down ? 1 : -1))));
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (!visible) return;
    function closeOutside(event) {
      if (!document.getElementById(id + '-field')?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [id, visible]);

  useEffect(() => {
    if (!visible || activeIndex < 0) return;
    const menu = document.getElementById(id + '-options');
    const item = menu?.children[activeIndex];
    if (!item) return;
    const menuBounds = menu.getBoundingClientRect();
    const itemBounds = item.getBoundingClientRect();
    if (itemBounds.top < menuBounds.top) menu.scrollTop -= menuBounds.top - itemBounds.top;
    else if (itemBounds.bottom > menuBounds.bottom) menu.scrollTop += itemBounds.bottom - menuBounds.bottom;
  }, [id, activeIndex, visible]);

  return {
    id, visible, activeIndex, above, choose, show, navigate,
    close: () => setOpen(false),
    attributes: {
      role: 'combobox',
      'aria-expanded': visible,
      'aria-controls': id + '-options',
      'aria-activedescendant': visible && activeIndex >= 0 ? id + '-' + activeIndex : undefined,
      onBlur: () => setOpen(false),
    },
  };
}

function OptionList({ menu, items, selected }) {
  return (
    <ul id={menu.id + '-options'} role="listbox" aria-labelledby={menu.id + '-label'}
      className={`dropdown-options${menu.above ? ' dropdown-options-above' : ''}`} hidden={!menu.visible}>
      {menu.visible && items.map(({ value, label }, index) => (
        <li key={value} id={menu.id + '-' + index} role="option" aria-selected={value === selected}
          className={menu.activeIndex === index ? 'dropdown-option-active' : undefined}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => menu.choose(index)}>
          <span>{label}</span>
          {value === selected && <span aria-hidden="true" className="dropdown-check">✓</span>}
        </li>
      ))}
    </ul>
  );
}

function toOption(item) {
  return typeof item === 'string' ? { value: item, label: item } : item;
}

export function Dropdown({ label, options, name, value, defaultValue = '', onChange, placeholder, required = false, className = '' }) {
  const [current, setCurrent] = useState(defaultValue);
  const [invalid, setInvalid] = useState(false);
  const typed = useRef({ text: '', time: 0 });
  const selected = value ?? current;
  const items = options.map(toOption);
  const selectedIndex = items.findIndex((item) => item.value === selected);
  const menu = useOptions(items, (next) => {
    if (value == null) setCurrent(next);
    setInvalid(false);
    onChange?.(next);
  });

  function handleKey(event) {
    if (menu.navigate(event)) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (menu.visible) menu.choose(menu.activeIndex);
      else menu.show(Math.max(0, selectedIndex));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      menu.show(event.key === 'Home' ? 0 : items.length - 1);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const now = Date.now();
      const text = (now - typed.current.time > 600 ? '' : typed.current.text) + event.key.toLowerCase();
      typed.current = { text, time: now };
      const match = items.findIndex((item) => item.label.toLowerCase().startsWith(text));
      if (match >= 0) {
        event.preventDefault();
        menu.show(match);
      }
    }
  }

  return (
    <div className={`dropdown-field ${className}`} id={menu.id + '-field'}>
      <label id={menu.id + '-label'} htmlFor={menu.id}>{label}</label>
      <button {...menu.attributes} id={menu.id} type="button" className="dropdown-trigger"
        aria-labelledby={menu.id + '-label ' + menu.id + '-value'} aria-required={required} aria-invalid={invalid || undefined}
        aria-describedby={invalid ? menu.id + '-error' : undefined}
        onClick={() => menu.visible ? menu.close() : menu.show(Math.max(0, selectedIndex))} onKeyDown={handleKey}>
        <span id={menu.id + '-value'}>{items[selectedIndex]?.label ?? placeholder}</span>
      </button>
      {name && <select className="dropdown-native" name={name} aria-hidden="true" tabIndex={-1} required={required} value={selected} onChange={() => {}}
        onInvalid={(event) => { event.preventDefault(); setInvalid(true); document.getElementById(menu.id)?.focus(); }}>
        {placeholder && !items.some((item) => item.value === '') && <option value="">{placeholder}</option>}
        {items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>}
      <OptionList menu={menu} items={items} selected={selected} />
      {invalid && <p className="dropdown-error" id={menu.id + '-error'} role="alert">Select a {label.toLowerCase()}.</p>}
    </div>
  );
}

export function SuggestionInput({ label, suggestions, value, onChange, onChoose, onSubmit, ...props }) {
  const [current, setCurrent] = useState('');
  const selected = value ?? current;
  const query = selected.trim().toLowerCase();
  const items = suggestions.filter((item) => item.toLowerCase().includes(query)).map(toOption);
  const prioritized = [...items.filter((item) => item.label.toLowerCase().startsWith(query)),
    ...items.filter((item) => !item.label.toLowerCase().startsWith(query))];
  function change(next) {
    if (value == null) setCurrent(next);
    onChange?.(next);
  }
  const menu = useOptions(prioritized, (next) => {
    if (onChoose) onChoose(next);
    else change(next);
  });

  return (
    <div className="dropdown-field" id={menu.id + '-field'}>
      <label id={menu.id + '-label'} htmlFor={menu.id}>{label}</label>
      <input {...props} {...menu.attributes} id={menu.id} type="text" value={selected} aria-autocomplete="list" autoComplete="off"
        onFocus={() => menu.show()} onClick={() => { if (!menu.visible) menu.show(); }}
        onChange={(event) => { change(event.target.value); menu.show(); }}
        onKeyDown={(event) => {
          if (menu.navigate(event)) return;
          if (event.key === 'Enter' && menu.visible && menu.activeIndex >= 0) {
            event.preventDefault();
            menu.choose(menu.activeIndex);
          } else if (event.key === 'Enter' && onSubmit) {
            event.preventDefault();
            onSubmit(selected);
            menu.close();
          }
        }}
      />
      <OptionList menu={menu} items={prioritized} selected={selected} />
    </div>
  );
}
