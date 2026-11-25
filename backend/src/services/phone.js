export function accountPhone(value) {
  if (typeof value !== 'string' || value.length > 32) return '';
  const digits = value.trim().replace(/[\s()-]/g, '');
  const normalized = /^\d{10}$/.test(digits) ? '+91' + digits : digits;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : '';
}
