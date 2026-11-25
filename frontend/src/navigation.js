import { useCallback, useEffect, useState } from 'react';

const legacyPaths = new Map([
  ['#home', '/'],
  ['#login', '/login'],
  ['#signup', '/signup'],
]);

export function normalizeLegacyRoute() {
  const { pathname, search, hash } = window.location;
  const legacyPath = pathname === '/' ? legacyPaths.get(hash) : undefined;
  if (legacyPath) window.history.replaceState(null, '', legacyPath + search);
}

function currentRoute() {
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash };
}

export function useNavigation() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    function updateRoute() {
      normalizeLegacyRoute();
      setRoute(currentRoute());
    }

    window.addEventListener('popstate', updateRoute);
    window.addEventListener('hashchange', updateRoute);
    return () => {
      window.removeEventListener('popstate', updateRoute);
      window.removeEventListener('hashchange', updateRoute);
    };
  }, []);

  const navigate = useCallback((href, { replace = false } = {}) => {
    const from = window.location.pathname;
    const target = new URL(href, window.location.href);
    if (target.href === window.location.href) return;

    if (replace) window.history.replaceState(null, '', target.href);
    else window.history.pushState(null, '', target.href);

    setRoute(currentRoute());
    if (target.pathname !== from) window.scrollTo(0, 0);
  }, []);

  return { route, navigate };
}
