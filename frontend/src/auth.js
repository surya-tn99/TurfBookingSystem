export const apiBase = import.meta.env.API_BASE_URL.trim().replace(/\/+$/, '');
export const serviceUnavailableMessage = 'PickTurf is temporarily unavailable. Please try again in a moment.';
export const publicTurfRoute = /^\/turfs\/([a-f0-9]{24})$/i;
export const profileSettingsPath = '/profile';
export const staffPath = '/staff';
export const staffFeedbackPath = '/staff/feedback';
export const isStaffPath = (path) => path === staffPath || path === staffFeedbackPath;

export function publicTurfPath(id) {
  if (typeof id !== 'string') return null;
  const path = `/turfs/${id.toLowerCase()}`;
  return publicTurfRoute.test(path) ? path : null;
}

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
  if (!value || /[\\#]/.test(value)) return '/';
  return value === '/wallet' || value === profileSettingsPath || isStaffPath(value)
    || value.startsWith('/?') || publicTurfRoute.test(value.split('?')[0]) ? value : '/';
}

export function authPageHref(mode, returnPath) {
  if (returnPath === '/') return `/${mode}`;
  return `/${mode}?${new URLSearchParams({ returnTo: returnPath })}`;
}
