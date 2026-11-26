import { createHash } from 'node:crypto';

export function rentalOptions(turf) {
  return (turf.equipment ?? []).flatMap(({ name, price, maxCount, isAvailable }, index) => {
    const unitAmount = Math.round(price * 100);
    if (isAvailable !== true || typeof name !== 'string' || !name.trim() || !Number.isFinite(price) || price < 0
      || !Number.isSafeInteger(unitAmount)
      || !Number.isSafeInteger(maxCount) || maxCount < 1) return [];
    const id = createHash('sha256').update(JSON.stringify([index, name, unitAmount])).digest('base64url').slice(0, 16);
    return [{ id, name, unitAmount, maxCount }];
  });
}

const rentalError = (message, status) => Object.assign(new Error(message), { status });

export function selectedRentals(turf, selection = []) {
  const invalid = 'Choose a valid quantity for each equipment item.';
  const changed = 'Equipment availability or pricing changed. Review your selection and try again.';
  if (!Array.isArray(selection) || selection.length > 100) throw rentalError(invalid, 400);
  if (!selection.length) return [];
  const options = new Map(rentalOptions(turf).map((item) => [item.id, item]));
  const seen = new Set();
  return selection.map((item) => {
    const { id, quantity } = item ?? {};
    if (typeof id !== 'string' || seen.has(id) || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw rentalError(invalid, 400);
    }
    seen.add(id);
    const option = options.get(id);
    if (!option || quantity > option.maxCount) throw rentalError(changed, 409);
    return { id, name: option.name, unitAmount: option.unitAmount, quantity };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
