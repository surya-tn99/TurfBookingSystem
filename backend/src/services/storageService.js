import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const signatures = {
  'image/jpeg': { extension: 'jpg', matches: (b) => b.subarray(0, 3).equals(Buffer.from([255, 216, 255])) },
  'image/png': { extension: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: 'webp', matches: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
};

export function storageError(message, status = 503) {
  return Object.assign(new Error(message), { status });
}

function storageConnection(options = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET_NAME = 'turf-media' } = process.env;
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!SUPABASE_URL?.trim() || !key) {
    throw storageError('Set SUPABASE_URL and a Supabase server key on the backend to enable uploads.');
  }
  const url = SUPABASE_URL.trim();
  const { storage } = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...options,
  });
  return { storage, bucket: SUPABASE_BUCKET_NAME, host: new URL(url).hostname };
}

export function turfStorage() {
  const { storage, bucket } = storageConnection();
  return storage.from(bucket);
}

export async function checkSupabaseConnection() {
  try {
    const { storage, bucket, host } = storageConnection({
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }),
      },
    });
    const { data, error } = await storage.getBucket(bucket);
    const status = Number(error?.statusCode);
    if (error || !data) {
      console.warn(`[Storage] Supabase bucket check failed${status ? ` (HTTP ${status})` : ''}.`);
      return;
    }
    console.log(`[Storage] Supabase Connected: ${host} (bucket: ${bucket})`);
  } catch {
    console.warn('[Storage] Supabase bucket check could not run. Check the backend storage configuration.');
  }
}

export async function uploadPhoto(storage, turfId, file) {
  const format = Object.hasOwn(signatures, file.mimetype) ? signatures[file.mimetype] : null;
  if (!format?.matches(file.buffer)) throw storageError('Choose a JPEG, PNG or WebP image.', 400);
  const key = `turfs/${turfId}/${randomUUID()}.${format.extension}`;
  const { error } = await storage.upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) {
    const status = Number(error.statusCode);
    if (status === 404) throw storageError('The configured Supabase photo bucket was not found.');
    if (status === 401 || status === 403) throw storageError('Supabase rejected the upload. Check the backend storage key and bucket permissions.');
    if (status === 413) throw storageError('The photo exceeds the Supabase bucket size limit.', 400);
    throw storageError('Could not upload turf photos. Please try again.');
  }
  return { key, url: storage.getPublicUrl(key).data.publicUrl };
}

export async function removePhotos(storage, keys) {
  if (!keys.length) return;
  const { error } = await storage.remove(keys);
  if (error) throw storageError('Could not remove turf photos. Please try again.');
}
