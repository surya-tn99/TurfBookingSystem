export const apiBase = import.meta.env.API_BASE_URL.trim().replace(/\/+$/, '');
export const serviceUnavailableMessage = 'PickTurf is temporarily unavailable. Please try again in a moment.';

export async function requestAuth(path, { signal, ...options } = {}) {
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`${apiBase}/auth/${path}`, {
    ...options,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (response.status >= 500) throw new Error(serviceUnavailableMessage);
  return response;
}

export function loginReturnPath(value) {
  // The homepage is the only public destination outside the auth flow today.
  return value?.startsWith('/?') && !value.includes('#') ? value : '/';
}

export function authPageHref(mode, returnPath) {
  if (returnPath === '/') return `/${mode}`;
  return `/${mode}?${new URLSearchParams({ returnTo: returnPath })}`;
}
