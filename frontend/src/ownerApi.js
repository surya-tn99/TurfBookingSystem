import { apiBase, serviceUnavailableMessage } from './auth';

export const managerPath = '/turfManeger';
export const turfPath = (id) => managerPath + '/turfs/' + id;

export function turfRating(turf) {
  const ratings = (turf.feedback ?? []).map(({ rating }) => rating).filter(Number.isFinite);
  return ratings.length ? '★ ' + (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : 'No ratings yet';
}

function ownerUpload(url, token, body, signal, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const unavailable = () => reject(new Error(serviceUnavailableMessage));

    if (signal?.aborted) {
      unavailable();
      return;
    }

    request.upload.addEventListener('progress', (event) => {
      const percent = event.lengthComputable && event.total > 0
        ? Math.min(99, Math.floor((event.loaded / event.total) * 100))
        : null;
      onUploadProgress({ phase: 'uploading', percent });
    });
    request.upload.addEventListener('load', () => onUploadProgress({ phase: 'saving' }));
    request.addEventListener('load', () => {
      const data = request.response;
      if (request.status < 200 || request.status >= 300 || !data) {
        reject(new Error(data?.message || serviceUnavailableMessage));
      } else {
        resolve(data);
      }
    });
    for (const event of ['error', 'timeout', 'abort']) request.addEventListener(event, unavailable);
    request.addEventListener('loadend', () => signal?.removeEventListener('abort', abort));

    request.open('POST', url);
    request.responseType = 'json';
    request.timeout = 30_000;
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    signal?.addEventListener('abort', abort, { once: true });
    request.send(body);
  });
}

export async function ownerRequest(path = '', { method = 'GET', body, signal, onUploadProgress } = {}) {
  const token = localStorage.getItem('turf_token');
  const multipart = body instanceof FormData;
  if (!apiBase) throw new Error(serviceUnavailableMessage);
  const url = `${apiBase}/owner/turfs${path}`;
  if (method === 'POST' && multipart && onUploadProgress) return ownerUpload(url, token, body, signal, onUploadProgress);

  const timeout = AbortSignal.timeout(30_000);
  let response;
  try {
    response = await fetch(url, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
      body: body && (multipart ? body : JSON.stringify(body)),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new Error(serviceUnavailableMessage);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.message || serviceUnavailableMessage);
  return data;
}
