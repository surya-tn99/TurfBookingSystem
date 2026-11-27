import { apiBase, serviceUnavailableMessage } from './auth';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 });
export const formatBookingAmount = (amount) => currency.format(amount / 100);
export const bookingPrice = (amount) => amount === 0 ? 'Free' : formatBookingAmount(amount);

export async function turfRequest(path, { token, body, signal, method = body ? 'POST' : 'GET' } = {}) {
  const timeout = AbortSignal.timeout(25_000);
  let response;
  try {
    if (!apiBase) throw new Error();
    response = await fetch(`${apiBase}${path}`, {
      method, cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error(serviceUnavailableMessage);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Object.assign(new Error(data?.message || serviceUnavailableMessage), { status: response.status });
  return data;
}
