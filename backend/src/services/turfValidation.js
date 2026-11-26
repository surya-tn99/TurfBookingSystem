function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Invalid form data.');
  return value;
}

function string(value = '', max = 200) {
  if (typeof value !== 'string' || value.trim().length > max) invalid('A text field is invalid or too long.');
  return value.trim();
}

function number(value, min = 0, max = 1_000_000, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid('A number is outside its allowed range.');
  return value;
}

function list(value, max) {
  if (!Array.isArray(value) || value.length > max) invalid('A list is invalid or has too many entries.');
  return value;
}

function url(value, isAllowed) {
  const input = string(value, 2048);
  if (!input) return '';
  let parsed;
  try { parsed = new URL(input); } catch { invalid('Enter a valid URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !isAllowed(parsed)) invalid('Enter a supported HTTPS link.');
  return parsed.href;
}

const isMap = ({ hostname, pathname }) => hostname === 'maps.app.goo.gl'
  || hostname === 'maps.google.com' || (['google.com', 'www.google.com', 'google.co.in', 'www.google.co.in'].includes(hostname) && pathname.startsWith('/maps'))
  || (hostname === 'goo.gl' && pathname.startsWith('/maps/'));

export function turfContact(input) {
  const name = string(input.name, 100);
  const contactPhone = string(input.contactPhone, 32).replace(/[\s()-]/g, '');
  const contactEmail = string(input.contactEmail, 254).toLowerCase();
  if (!name) invalid('Enter the turf name.');
  if (!/^\+?\d{8,15}$/.test(contactPhone)) invalid('Enter a valid contact phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) invalid('Enter a valid contact email.');
  return { name, contactPhone, contactEmail };
}

export function registration(body) {
  const input = object(body);
  if (input.commissionAccepted !== true) invalid('You must accept the 3% platform commission to register a turf.');
  const addressInput = object(input.address);
  const address = Object.fromEntries(['street', 'area', 'city', 'state', 'pincode'].map((key) => [key, string(addressInput[key])]));
  if (!address.street || !address.city || !address.state || !/^\d{6}$/.test(address.pincode)) invalid('Enter a complete address with a six-digit pincode.');
  address.mapPinUrl = url(addressInput.mapPinUrl, isMap);
  if (!address.mapPinUrl) invalid('Enter the Google Maps location link.');
  const gstNumber = string(input.gstNumber, 15).toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstNumber)) invalid('Enter a valid 15-character GSTIN.');
  return { ...turfContact(input), address, gstNumber };
}

function labels(value, max) {
  const normalized = new Map();
  for (const entry of list(value, max)) {
    const label = string(entry);
    if (!label) invalid('List entries cannot be empty.');
    const key = label.toLowerCase();
    if (!normalized.has(key)) normalized.set(key, label);
  }
  return [...normalized.values()];
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function bookingPolicy(value, label) {
  const policy = object(value ?? { available: false });
  if (typeof policy.available !== 'boolean') invalid(`Choose whether ${label} is available.`);
  if (!policy.available) return { available: false, cutoffHours: null };
  if (!Number.isFinite(policy.cutoffHours) || policy.cutoffHours < 0) {
    invalid(`Enter how many hours before the slot ${label} is available.`);
  }
  return { available: true, cutoffHours: policy.cutoffHours };
}

export function configuration(body) {
  const input = object(body);
  const sports = labels(input.sports, 50);
  const timeSlots = list(input.timeSlots, 96).map((value) => {
    const { startTime, endTime, price, isActive } = object(value);
    if (typeof startTime !== 'string' || typeof endTime !== 'string' || !timePattern.test(startTime)
      || (!timePattern.test(endTime) && endTime !== '24:00') || startTime >= endTime) invalid('Enter valid same-day times for every slot.');
    return { startTime, endTime, price: number(price), isActive: isActive !== false };
  });
  const active = timeSlots.filter((slot) => slot.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (active.some((slot, index) => index > 0 && slot.startTime < active[index - 1].endTime)) invalid('Active time slots cannot overlap.');
  const equipment = list(input.equipment, 100).map((value) => {
    const item = object(value);
    const name = string(item.name, 100);
    if (!name) invalid('Enter a name for every equipment item.');
    return { name, price: number(item.price), maxCount: number(item.maxCount, 1, 100_000, true), isAvailable: item.isAvailable !== false };
  });
  const facilities = object(input.facilities ?? {});
  const parking = object(facilities.parking ?? {});
  const restrooms = object(facilities.restrooms ?? {});
  const floodlights = object(facilities.floodlights ?? {});
  const policies = object(input.policies ?? {});
  if (policies.payAtVenue !== undefined && typeof policies.payAtVenue !== 'boolean') invalid('Choose a valid payment option.');
  const venueType = facilities.venueType || 'outdoor';
  if (!['outdoor', 'indoor', 'hybrid'].includes(venueType)) invalid('Choose a valid venue type.');
  const slotDurationMinutes = input.slotDurationMinutes === undefined ? 60 : input.slotDurationMinutes;
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes < 1 || slotDurationMinutes > 24 * 60) {
    invalid('Enter a slot duration from 1 to 1,440 whole minutes.');
  }
  const count = (value) => number(value ?? 0, 0, 100_000, true);
  return {
    sports, timeSlots, equipment, slotDurationMinutes,
    facilities: {
      parking: {
        available: parking.available === true, twoWheelerCapacity: count(parking.twoWheelerCapacity),
        fourWheelerCapacity: count(parking.fourWheelerCapacity), notes: string(parking.notes),
      },
      restrooms: {
        available: restrooms.available === true, washroomCount: count(restrooms.washroomCount),
        changingRoomCount: count(restrooms.changingRoomCount), notes: string(restrooms.notes),
      },
      floodlights: { available: floodlights.available === true },
      drinkingWater: facilities.drinkingWater === true, seatingArea: facilities.seatingArea === true,
      cafeteria: facilities.cafeteria === true, coveredRoof: facilities.coveredRoof === true,
      venueType,
    },
    regulations: labels(input.regulations ?? [], 50),
    policies: {
      payAtVenue: policies.payAtVenue,
      cancellation: bookingPolicy(policies.cancellation, 'cancellation'),
    },
    isConfigured: sports.length > 0 && active.length > 0,
  };
}
