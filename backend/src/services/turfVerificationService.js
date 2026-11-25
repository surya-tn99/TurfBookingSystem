import { Turf } from '../models/Turf.js';

export const VERIFICATION_DELAY_MS = 15_000;

export function syncPendingVerifications(filter) {
  const now = new Date();
  return Turf.updateMany({
    ...filter,
    removedAt: null,
    verificationStatus: 'pending',
    submittedForVerificationAt: { $lte: new Date(now.getTime() - VERIFICATION_DELAY_MS) },
  }, { $set: { verificationStatus: 'verified', verifiedAt: now } });
}

export function scheduleTurfVerification(id) {
  setTimeout(() => {
    syncPendingVerifications({ _id: id }).catch((error) => {
      console.error('[Turf verification]', error.name);
    });
  }, VERIFICATION_DELAY_MS).unref();
}
