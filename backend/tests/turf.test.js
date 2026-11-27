import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { BookingDay } from '../src/models/BookingDay.js';
import { Turf } from '../src/models/Turf.js';
import { User } from '../src/models/User.js';
import authRoutes from '../src/routes/authRoutes.js';
import turfRoutes from '../src/routes/turfRoutes.js';
import publicTurfRoutes from '../src/routes/publicTurfRoutes.js';
import { razorpayWebhook } from '../src/routes/razorpayWebhook.js';
import staffRoutes from '../src/routes/staffRoutes.js';
import { accountPhone } from '../src/services/phone.js';

test('owner registration, setup, isolation, and backend verification', async (t) => {
  const makeId = () => new mongoose.Types.ObjectId().toString();
  const owner = { id: makeId(), email: 'owner-login@example.test', role: 'owner', isActive: true };
  const otherOwner = { id: makeId(), role: 'owner', isActive: true };
  const customer = { id: makeId(), name: 'Player One', phone: '+919123456789', role: 'customer', isActive: true };
  const otherCustomer = { id: makeId(), name: 'Player Two', phone: '+919234567891', role: 'customer', isActive: true };
  const staff = { id: makeId(), role: 'staff', isActive: true };
  const closingCustomer = { id: makeId(), name: 'Closing Player', role: 'customer', isActive: true };
  const users = [owner, otherOwner, customer, otherCustomer, staff, closingCustomer];
  const turfs = [];
  process.env.JWT_SECRET = 'turf-auth-test-secret';
  process.env.MONGODB_URI = 'mongodb://fixture.invalid/pickturf';
  t.mock.method(mongoose, 'connect', async () => {
    mongoose.connection.readyState = 1;
    return { connection: { host: 'test fixture' } };
  });
  t.mock.method(User, 'createIndexes', async () => []);
  const transactionSession = {};
  t.mock.method(User.db, 'transaction', (operation) => operation(transactionSession));
  t.mock.method(User, 'findById', async (id) => users.find((user) => user.id === id));
  t.mock.method(User, 'find', ({ _id }) => ({ select: () => ({ lean: async () => users.filter((user) => _id.$in.includes(user.id))
    .map((user) => ({ ...user, _id: user.id })) }) }));
  t.mock.method(User, 'findOne', (query) => ({ select: () => ({ lean: async () => {
    const user = users.find((candidate) => Object.entries(query).every(([key, value]) => candidate[key] === value));
    return user && { _id: user.id };
  } }) }));
  t.mock.method(User, 'create', async (fields) => {
    if (users.some((user) => user.phone === fields.phone || user.email === fields.email)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const user = { ...fields, id: makeId(), isActive: true };
    users.push(user);
    return user;
  });
  t.mock.method(User, 'findOneAndUpdate', async (query, { $set, $inc }, options) => {
    const user = users.find((candidate) => Object.entries(query)
      .every(([key, value]) => (key === '_id' ? candidate.id : candidate[key]) === value));
    if (!user) return null;
    if ($inc) {
      assert.equal(options.session, transactionSession);
      user.accountActivityVersion = (user.accountActivityVersion ?? 0) + $inc.accountActivityVersion;
    }
    if ($set?.phone && users.some((candidate) => candidate !== user && candidate.phone === $set.phone)) {
      throw Object.assign(new Error('duplicate'), { code: 11000, keyPattern: { phone: 1 } });
    }
    return Object.assign(user, $set);
  });
  t.mock.method(User, 'deleteOne', async ({ _id }, { session }) => {
    assert.equal(session, transactionSession);
    const index = users.findIndex(({ id }) => id === _id);
    if (index < 0) return { deletedCount: 0 };
    users.splice(index, 1);
    return { deletedCount: 1 };
  });
  const matches = (turf, query) => (!query.owner || turf.owner === query.owner)
    && (!query._id || query._id === turf._id || query._id.$in?.includes(turf._id))
    && (query.removedAt !== null || !turf.removedAt) && (!query.name || turf.name === query.name)
    && (query.isConfigured === undefined || turf.isConfigured === query.isConfigured)
    && (!query.verificationStatus || turf.verificationStatus === query.verificationStatus)
    && (!query['feedback._id'] || (query['feedback._id'].$ne
      ? !turf.feedback?.some(({ _id }) => _id === query['feedback._id'].$ne)
      : turf.feedback?.some(({ _id }) => _id === query['feedback._id'])));
  const find = (query) => turfs.find((turf) => matches(turf, query));
  t.mock.method(Turf, 'create', async ([data], { session }) => {
    assert.equal(session, transactionSession);
    const id = makeId();
    const turf = {
      _id: id, id, ...data, commissionRate: 3, verificationStatus: 'pending',
      submittedForVerificationAt: new Date(), sports: [], timeSlots: [], equipment: [], media: { images: [] },
    };
    turfs.push(turf);
    return [turf];
  });
  t.mock.method(Turf, 'updateMany', async (query, { $set }) => {
    turfs.filter((turf) => matches(turf, query) && turf.verificationStatus === query.verificationStatus
      && turf.submittedForVerificationAt <= query.submittedForVerificationAt.$lte).forEach((turf) => Object.assign(turf, $set));
  });
  t.mock.method(Turf, 'find', (query) => {
    const result = { select: () => result, sort: () => result, lean: async () => turfs.filter((turf) => matches(turf, query)) };
    return result;
  });
  t.mock.method(Turf, 'findOne', (query) => {
    const result = Promise.resolve(find(query));
    return Object.assign(result, { select: () => ({ lean: () => result }) });
  });
  t.mock.method(Turf, 'exists', async (query) => find(query));
  t.mock.method(Turf, 'updateOne', async (query, { $set, $push }) => {
    const turf = find(query);
    if (turf) Object.assign(turf, $set);
    if (turf && $push?.feedback) (turf.feedback ??= []).push($push.feedback);
    return { matchedCount: turf ? 1 : 0, modifiedCount: turf ? 1 : 0 };
  });
  t.mock.method(Turf, 'findOneAndUpdate', async (query, { $set }) => {
    const turf = find(query);
    if (turf && $set) {
      if ($set['feedback.$.reply']) {
        const entry = turf.feedback.find(({ _id }) => _id === query['feedback._id']);
        Object.assign(entry, { reply: $set['feedback.$.reply'], repliedAt: $set['feedback.$.repliedAt'] });
        return turf;
      }
      const { 'policies.cancellation': cancellation, 'policies.payAtVenue': payAtVenue, ...fields } = $set;
      Object.assign(turf, fields);
      if (cancellation || payAtVenue !== undefined) turf.policies = {
        ...turf.policies, ...(cancellation && { cancellation }), ...(payAtVenue !== undefined && { payAtVenue }),
      };
    }
    return turf;
  });
  await connectDB();

  const app = express();
  app.post('/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);
  app.use(express.json());
  app.use('/owner/turfs', turfRoutes);
  app.use('/turfs', publicTurfRoutes);
  app.use('/staff', staffRoutes);
  app.use('/auth', authRoutes);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const request = (user, path = '', method = 'GET', body) => fetch(
    'http://127.0.0.1:' + server.address().port + '/owner/turfs' + path,
    { method, headers: {
      Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET),
      'Content-Type': 'application/json',
    }, body: body && JSON.stringify(body) },
  );
  const authRequest = (user, path = '/me', method = 'GET', body) => fetch(
    `http://127.0.0.1:${server.address().port}/auth${path}`, {
      method, headers: { 'Content-Type': 'application/json',
        ...(user && { Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET) }) },
      body: body && JSON.stringify(body),
    },
  );
  assert.equal((await authRequest(null, '/me/profile', 'PATCH', { name: 'New name' })).status, 401);
  assert.equal((await authRequest(staff, '/me/profile', 'PATCH', { name: 'New name' })).status, 403);
  assert.equal((await authRequest(staff, '/me', 'DELETE', { confirm: true })).status, 403);
  assert.equal((await authRequest(customer, '/me/profile', 'PATCH', { name: '  ' })).status, 400);
  assert.equal((await authRequest(customer, '/me/profile', 'PATCH', { phone: '123' })).status, 400);
  assert.equal((await authRequest(customer, '/me/profile', 'PATCH', { phone: otherCustomer.phone })).status, 409);
  const profile = await (await authRequest(customer, '/me/profile', 'PATCH', { name: ' Updated Player ', phone: '91234 56780', role: 'owner' })).json();
  assert.equal(profile.user.name, 'Updated Player');
  assert.equal(profile.user.phone, '+919123456780');
  assert.equal(profile.user.role, 'customer');
  assert.equal((await (await authRequest(customer)).json()).user.name, 'Updated Player');
  const managerProfile = await authRequest(owner, '/me/profile', 'PATCH', { name: 'Venue Manager' });
  assert.equal((await managerProfile.json()).user.name, 'Venue Manager');
  const registration = {
    name: 'The Five Yard', contactPhone: '9876543210', contactEmail: 'owner@example.test',
    address: { street: '1 Main Road', area: 'Velachery', city: 'Chennai', state: 'Tamil Nadu', pincode: '600042', mapPinUrl: 'https://maps.app.goo.gl/example' },
    gstNumber: '33ABCDE1234F1Z5',
    verificationStatus: 'verified', commissionRate: 9,
  };
  assert.equal((await request(customer)).status, 403);
  assert.equal((await request(owner, '', 'POST', registration)).status, 400);
  assert.equal((await request(owner, '', 'POST', { ...registration, commissionAccepted: false })).status, 400);
  assert.equal((await request(owner, '', 'POST', { ...registration, gstNumber: '', commissionAccepted: true })).status, 400);
  assert.equal((await request(owner, '', 'POST', { ...registration, address: { ...registration.address, mapPinUrl: '' }, commissionAccepted: true })).status, 400);
  const created = await request(owner, '', 'POST', { ...registration, commissionAccepted: true });
  assert.equal(created.status, 201);
  const { turf } = await created.json();
  assert.equal(turf.verificationStatus, 'pending');
  assert.equal(turf.commissionRate, 3);
  const path = '/' + turf._id;
  const publicListings = async () => {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/turfs');
    assert.equal(response.status, 200);
    return (await response.json()).turfs;
  };
  assert.equal(accountPhone('98765 43210'), accountPhone('+91 (98765) 43210'));
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.phone === 1 && options.unique));
  assert.equal((await request(otherOwner, path)).status, 404);
  assert.equal((await request(otherOwner, path + '/configure', 'PUT', {})).status, 404);
  assert.equal((await request(otherOwner, path + '/media', 'POST', {})).status, 404);
  assert.equal((await request(otherOwner, path + '/media', 'DELETE', { url: 'https://example.test/photo' })).status, 404);
  assert.equal((await request(otherOwner, path + '/staff', 'POST', {})).status, 404);
  const member = { name: 'Turf staff', email: 'PickTurf-Staff+Schedule@Example.test', phone: '9876543210' };
  for (const [field, value, expected] of [
    ['name', ' ', /staff name/],
    ['email', 'staff.example.test', /staff email address/],
    ['phone', '123', /staff phone number/],
  ]) {
    const invalidMember = await request(owner, path + '/staff', 'POST', { ...member, [field]: value });
    assert.equal(invalidMember.status, 400);
    assert.match((await invalidMember.json()).message, expected);
  }
  const added = await request(owner, path + '/staff', 'POST', member);
  assert.equal(added.status, 201);
  const { member: addedMember } = await added.json();
  assert.equal(addedMember.email, member.email.toLowerCase());
  const memberId = addedMember._id;
  assert.equal((await request(owner, path + '/staff', 'POST', { ...member, email: 'another-fixture@gmail.com', phone: '+919876543210' })).status, 409);
  assert.equal((await request(otherOwner, path + '/staff/' + memberId, 'DELETE')).status, 404);
  assert.equal((await request(owner, path + '/staff/' + memberId, 'DELETE')).status, 200);
  assert.equal(users.find((user) => user.id === memberId).assignedTurf, null);
  assert.equal(users.find((user) => user.id === memberId).isActive, false);
  const reassigned = await request(owner, path + '/staff', 'POST', member);
  assert.equal(reassigned.status, 201);
  assert.equal((await reassigned.json()).member._id, memberId);
  const updated = await request(owner, path, 'PATCH', { name: 'Updated Turf', contactPhone: '9876543210', contactEmail: 'new@example.test', address: {} });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).turf.address.city, 'Chennai');

  const slot = { startTime: '06:00', endTime: '07:00', price: 150, slotType: 'peak', isActive: true };
  const setup = {
    sports: ['Football', 'football'], slotDurationMinutes: 45, timeSlots: [slot],
    equipment: [{ name: 'Ball', price: 20, maxCount: 3 }, { name: 'Bibs', price: 15, maxCount: 10, isAvailable: false }],
    facilities: { venueType: 'indoor', drinkingWater: true, parking: { available: true, fourWheelerCapacity: 2, notes: 'Manager note' },
      restrooms: { available: true, washroomCount: 1, changingRoomCount: 1 } },
    regulations: ['No metal spikes'],
    policies: {
      cancellation: { available: false, cutoffHours: 24 },
      rescheduling: { available: true, cutoffHours: 12, maxChanges: 3 },
    },
  };
  assert.equal((await request(owner, path + '/configure', 'PUT', { ...setup, timeSlots: [slot, { ...slot, startTime: '06:30' }] })).status, 400);
  for (const slotDurationMinutes of [0, 12.5, 1441, null]) {
    assert.equal((await request(owner, path + '/configure', 'PUT', { ...setup, slotDurationMinutes })).status, 400);
  }
  assert.equal((await request(owner, path + '/configure', 'PUT', {
    ...setup,
    policies: { ...setup.policies, cancellation: { available: true } },
  })).status, 400);
  assert.equal((await request(owner, path + '/configure', 'PUT', {
    ...setup,
    policies: { ...setup.policies, payAtVenue: 'true' },
  })).status, 400);
  turfs[0].policies = { freeRescheduleHours: 6, rainPolicy: 'Legacy text' };
  const saved = await request(owner, path + '/configure', 'PUT', setup);
  assert.equal(saved.status, 200);
  const configured = (await saved.json()).turf;
  assert.equal(configured.verificationStatus, 'pending');
  assert.equal(configured.isConfigured, true);
  assert.equal(configured.slotDurationMinutes, 45);
  assert.deepEqual(configured.sports, ['Football']);
  assert.equal(configured.timeSlots[0].price, 150);
  assert.equal(configured.equipment[0].maxCount, 3);
  assert.equal(configured.facilities.parking.fourWheelerCapacity, 2);
  assert.equal(configured.facilities.restrooms.washroomCount, 1);
  assert.deepEqual(configured.regulations, ['No metal spikes']);
  assert.deepEqual(configured.policies.cancellation, { available: false, cutoffHours: null });
  assert.equal(configured.policies.rescheduling, undefined);
  assert.equal(configured.policies.rainPolicy, 'Legacy text');
  const before = await (await request(owner, path)).json();
  assert.equal(before.turf.verificationStatus, 'pending');
  assert.deepEqual(await publicListings(), []);
  turfs[0].submittedForVerificationAt = new Date(Date.now() - 16_000);
  turfs[0].media.images = ['https://example.test/cover.jpg'];
  turfs[0].timeSlots.push({ ...slot, isActive: false, price: 25 });
  const listed = await publicListings();
  assert.deepEqual(listed, [{
    id: turf._id, name: 'Updated Turf', street: '1 Main Road', area: 'Velachery', city: 'Chennai', state: 'Tamil Nadu',
    sports: ['Football'], image: 'https://example.test/cover.jpg', rating: null, slotCount: 1, startingPrice: 150,
  }]);
  turfs[0].feedback = [{ rating: 5, name: 'Customer', comment: 'My review' }, { rating: 4 }, { comment: 'Unrated' }];
  assert.deepEqual(await publicListings(), [{ ...listed[0], rating: 4.5 }]);
  const otherListings = [
    { ...turfs[0], _id: makeId(), name: 'Unrated Turf', feedback: [] },
    { ...turfs[0], _id: makeId(), name: 'Five Star Turf', feedback: [{ rating: 5 }] },
    { ...turfs[0], _id: makeId(), name: 'Three Star Turf', feedback: [{ rating: 3 }] },
  ];
  turfs.push(...otherListings);
  assert.deepEqual((await publicListings()).map(({ name }) => name), ['Five Star Turf', 'Updated Turf', 'Three Star Turf', 'Unrated Turf']);
  turfs.splice(1, otherListings.length);

  await t.test('booking access, payment verification and overlapping slot holds', async (bookingTest) => {
    const days = new Map();
    bookingTest.mock.method(BookingDay, 'findById', (key) => ({ lean: async () => days.get(key) }));
    bookingTest.mock.method(BookingDay, 'find', ({ reservations }) => ({ lean: async () =>
      [...days].filter(([, day]) => day.reservations.some((entry) =>
        entry.customer === reservations.$elemMatch.customer
        && (!reservations.$elemMatch.status || entry.status === reservations.$elemMatch.status)))
        .map(([_id, day]) => ({ _id, ...day })),
    }));
    bookingTest.mock.method(BookingDay, 'updateOne', async ({ _id, reservations }, update) => {
      if (!days.has(_id)) days.set(_id, { reservations: [] });
      if (!update.$push) return { modifiedCount: 0 };
      const overlap = reservations.$not.$elemMatch;
      const day = days.get(_id);
      if (day.reservations.some((entry) => overlap.status.$in.includes(entry.status)
        && entry.startTime < overlap.startTime.$lt && entry.endTime > overlap.endTime.$gt)) return { modifiedCount: 0 };
      day.reservations.push({ ...update.$push.reservations });
      return { modifiedCount: 1 };
    });
    bookingTest.mock.method(BookingDay, 'findOneAndUpdate', ({ _id, reservations }, { $set }) => ({ lean: async () => {
      const day = days.get(_id);
      const match = reservations.$elemMatch;
      const entry = day?.reservations.find((item) => String(item._id) === String(match._id) && item.status === match.status
        && (!match.customer || item.customer === match.customer));
      if (!entry) return null;
      for (const [key, value] of Object.entries($set)) entry[key.split('.').at(-1)] = value;
      return day;
    } }));

    process.env.RAZORPAY_KEY_ID = 'test_key';
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook';
    process.env.CLIENT_URL = 'https://pickturf.example.test';
    const originalFetch = globalThis.fetch;
    const links = new Map();
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    bookingTest.mock.method(globalThis, 'fetch', async (url, options) => {
      const target = new URL(url);
      if (target.hostname !== 'api.razorpay.com') return originalFetch(url, options);
      if (options.method === 'POST') {
        const link = JSON.parse(options.body);
        assert.equal(link.amount, link.notes.pickturf_day.endsWith(`:${date}`) ? 19000 : 15000);
        assert.equal(link.currency, 'INR');
        assert.equal(link.accept_partial, false);
        assert.equal(new URL(link.callback_url).hostname, 'pickturf.example.test');
        const id = `plink_${links.size + 1}`;
        const created = { ...link, id, short_url: `https://rzp.io/i/${id}`, status: 'created', amount_paid: 0 };
        links.set(id, created);
        return Response.json(created);
      }
      return Response.json(links.get(target.pathname.split('/').at(-1)));
    });

    const origin = 'http://127.0.0.1:' + server.address().port;
    const create = (user, selection = {}) => fetch(`${origin}/turfs${path}/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(user && { Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET) }) },
      body: JSON.stringify({ date, startTime: slot.startTime, endTime: slot.endTime, amount: 15000, ...selection }),
    });
    const details = async () => (await fetch(`${origin}/turfs${path}?date=${date}`)).json();
    assert.equal((await create()).status, 401);
    assert.equal((await create(owner)).status, 403);
    assert.equal((await create(staff)).status, 403);
    assert.equal((await create(customer, { amount: 1 })).status, 409);
    assert.equal((await create(customer, { date: '2020-01-01' })).status, 409);
    const publicVenue = await details();
    assert.equal(publicVenue.slots[0].available, true);
    assert.equal(publicVenue.turf.payAtVenue, false);
    assert.equal(publicVenue.turf.venueType, 'indoor');
    assert.deepEqual(publicVenue.turf.facilities.parking, { twoWheelerCapacity: 0, fourWheelerCapacity: 2 });
    assert.equal(publicVenue.turf.facilities.changingRooms, true);
    assert.equal(publicVenue.turf.facilities.drinkingWater, true);
    assert.equal(publicVenue.turf.contactEmail, undefined);
    assert.equal(publicVenue.turf.equipment.length, 1);
    const { id: equipmentId } = publicVenue.turf.equipment[0];
    assert.deepEqual(publicVenue.turf.equipment[0], { id: equipmentId, name: 'Ball', unitAmount: 2000, maxCount: 3 });
    const selection = { amount: 19000, equipment: [{ id: equipmentId, quantity: 2 }] };
    assert.equal((await create(customer, { ...selection, paymentMethod: 'venue' })).status, 409);
    assert.equal((await create(customer, { ...selection, amount: 15000 })).status, 409);
    assert.equal((await create(customer, { equipment: [{ id: equipmentId, quantity: 4 }] })).status, 409);
    assert.equal((await create(customer, { equipment: [...selection.equipment, ...selection.equipment] })).status, 400);
    delete process.env.RAZORPAY_KEY_SECRET;
    assert.equal((await create(customer, selection)).status, 503);
    assert.equal(days.size, 0);
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';

    const attempts = await Promise.all([create(customer, selection), create(otherCustomer, selection)]);
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [200, 409]);
    const winner = attempts[0].ok ? customer : otherCustomer;
    const loser = winner === customer ? otherCustomer : customer;
    const { booking: pending } = await attempts.find(({ ok }) => ok).json();
    assert.equal(pending.status, 'pending');
    assert.equal((await authRequest(winner, '/me', 'DELETE', { confirm: true })).status, 409);
    assert.equal(pending.paymentMethod, 'online');
    assert.equal(pending.amount, 19000);
    assert.equal(pending.slotAmount, 15000);
    assert.deepEqual(pending.equipment, [{ id: equipmentId, name: 'Ball', unitAmount: 2000, quantity: 2 }]);
    assert.match(pending.checkoutUrl, /^https:\/\/rzp\.io\//);
    assert.equal((await details()).slots[0].available, false);
    assert.equal((await (await create(winner, selection)).json()).booking.id, pending.id);
    assert.equal(links.size, 1);

    const lookup = (user) => fetch(`${origin}/turfs${path}/bookings/${date}/${pending.id}`, {
      headers: { Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET) },
    });
    assert.equal((await lookup(loser)).status, 404);
    assert.equal((await (await lookup(winner)).json()).booking.status, 'pending');
    const link = links.values().next().value;
    const event = JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: {
      entity: { ...link, status: 'paid', amount_paid: link.amount },
    } } });
    const sendEvent = (signature) => fetch(`${origin}/webhook`, { method: 'POST', body: event,
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
    });
    assert.equal((await sendEvent('fake')).status, 401);
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(event).digest('hex');
    assert.equal((await sendEvent(signature)).status, 204);
    assert.equal((await sendEvent(signature)).status, 204);
    const { booking: paid } = await (await lookup(winner)).json();
    assert.equal(paid.status, 'confirmed');
    assert.deepEqual(paid.equipment, pending.equipment);

    const feedback = (user, ...params) => {
      const headers = { Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET) };
      if (!params.length) return fetch(`${origin}/turfs/feedback/pending`, { headers });
      const [when, bookingId, body] = params;
      return fetch(`${origin}/turfs${path}/bookings/${when}/${bookingId}/feedback`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    };
    assert.deepEqual(await (await feedback(winner)).json(), { booking: null });
    assert.equal((await feedback(winner, date, pending.id, { rating: 4 })).status, 409);
    assert.equal((await feedback(owner)).status, 403);
    const earlier = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    const completedId = makeId();
    const otherExpiredId = makeId();
    days.set(`${turf._id}:${earlier}`, { reservations: [
      { _id: completedId, customer: customer.id, status: 'confirmed', turfName: 'Updated Turf', startTime: '23:00', endTime: '24:00', amount: 15000 },
      { _id: otherExpiredId, customer: otherCustomer.id, status: 'expired', startTime: '19:00', endTime: '20:00', amount: 15000 },
    ] });
    const wallet = (user) => fetch(`${origin}/turfs/bookings`, {
      headers: user ? { Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET) } : {},
    });
    assert.equal((await wallet()).status, 401);
    assert.equal((await wallet(owner)).status, 403);
    const customerHistory = await (await wallet(customer)).json();
    assert.deepEqual(customerHistory.previous.map(({ id }) => id), [completedId]);
    assert.equal(customerHistory.previous[0].canReview, true);
    assert.equal(customerHistory.previous[0].review, null);
    assert.deepEqual((await (await wallet(otherCustomer)).json()).previous.map(({ id }) => id), [otherExpiredId]);
    const [active] = (await (await wallet(winner)).json()).current;
    assert.equal(active.id, pending.id);
    assert.equal(active.canReview, false);
    assert.deepEqual(active.equipment, pending.equipment);
    assert.equal(active.checkoutUrl, undefined);
    assert.deepEqual(await (await feedback(otherCustomer)).json(), { booking: null });
    assert.equal((await (await feedback(customer)).json()).booking.id, completedId);
    assert.equal((await feedback(otherCustomer, earlier, completedId, { rating: 5 })).status, 404);
    assert.equal((await feedback(customer, earlier, completedId, { rating: 6 })).status, 400);
    const reviews = await Promise.all([1, 2].map(() => feedback(customer, earlier, completedId, { rating: 3, comment: '  Good game  ' })));
    assert.deepEqual(reviews.map(({ status }) => status).sort(), [200, 201]);
    assert.deepEqual(turfs[0].feedback.filter(({ _id }) => _id === completedId), [{
      _id: completedId, customer: customer.id, name: customer.name, rating: 3, comment: 'Good game',
    }]);
    assert.deepEqual(await (await feedback(customer)).json(), { booking: null });
    const [reviewed] = (await (await wallet(customer)).json()).previous;
    assert.equal(reviewed.canReview, false);
    assert.deepEqual(reviewed.review, { rating: 3, comment: 'Good game' });

    turfs[0].timeSlots.push({ ...slot, startTime: '06:30', endTime: '07:30' });
    assert.equal((await create(loser, { startTime: '06:30', endTime: '07:30' })).status, 409);
    assert.equal((await details()).slots.at(-1).available, false);
    turfs[0].timeSlots.pop();

    const later = new Date(Date.now() + 172_800_000).toISOString().slice(0, 10);
    assert.equal((await create(customer, { date: later })).status, 200);
    const lastLink = [...links.values()].at(-1);
    days.get(lastLink.notes.pickturf_day).reservations[0].expiresAt = new Date(Date.now() - 1);
    lastLink.status = 'expired';
    assert.equal((await create(otherCustomer, { date: later })).status, 200);

    const enableVenuePay = (payAtVenue) => request(owner, path + '/configure', 'PUT', {
      ...setup, policies: { ...setup.policies, payAtVenue },
    });
    const enabled = await enableVenuePay(true);
    assert.equal(enabled.status, 200);
    assert.equal((await enabled.json()).turf.policies.payAtVenue, true);
    assert.equal((await request(owner, path + '/configure', 'PUT', setup)).status, 200);
    assert.equal((await details()).turf.payAtVenue, true);
    const venueDate = new Date(Date.now() + 259_200_000).toISOString().slice(0, 10);
    const venueSelection = { ...selection, date: venueDate, paymentMethod: 'venue' };
    const onlineLinks = links.size;
    delete process.env.RAZORPAY_KEY_SECRET;
    assert.equal((await create(customer, { ...venueSelection, paymentMethod: 'online' })).status, 409);
    const direct = await create(customer, venueSelection);
    assert.equal(direct.status, 200);
    const { booking: atVenue } = await direct.json();
    assert.equal(atVenue.status, 'confirmed');
    assert.equal(atVenue.paymentMethod, 'venue');
    assert.equal(atVenue.checkoutUrl, null);
    assert.equal(atVenue.expiresAt, undefined);
    assert.equal(atVenue.amount, 19000);
    assert.deepEqual(atVenue.equipment, pending.equipment);
    assert.equal(links.size, onlineLinks);
    assert.equal((await (await create(customer, venueSelection)).json()).booking.id, atVenue.id);
    assert.equal((await create(otherCustomer, venueSelection)).status, 409);
    const venueAvailability = await fetch(`${origin}/turfs${path}?date=${venueDate}`);
    assert.equal((await venueAvailability.json()).slots[0].available, false);

    assert.equal((await enableVenuePay(false)).status, 200);
    const receipt = await fetch(`${origin}/turfs${path}/bookings/${venueDate}/${atVenue.id}`, {
      headers: { Authorization: 'Bearer ' + jwt.sign({ id: customer.id }, process.env.JWT_SECRET) },
    });
    assert.deepEqual((await receipt.json()).booking, atVenue);
    const currentVenue = (await (await wallet(customer)).json()).current.find(({ id }) => id === atVenue.id);
    assert.equal(currentVenue.paymentMethod, 'venue');

    const activeStaff = users.find(({ id }) => id === memberId);
    const staffRequest = (user, route, method = 'GET', body) => fetch(`${origin}/staff${route}`, {
      method, headers: { 'Content-Type': 'application/json',
        ...(user && { Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET) }) },
      body: body && JSON.stringify(body),
    });
    const schedulePath = `/schedule?date=${date}`;
    assert.equal((await staffRequest(null, schedulePath)).status, 401);
    assert.equal((await staffRequest(customer, schedulePath)).status, 403);
    assert.equal((await staffRequest(staff, schedulePath)).status, 403);
    assert.equal((await staffRequest(activeStaff, '/schedule?date=yesterday')).status, 400);
    const daily = await (await staffRequest(activeStaff, schedulePath)).json();
    assert.equal(daily.slots[0].status, 'booked');
    assert.equal(daily.bookings[0].customerPhone, winner.phone);
    assert.equal(daily.bookings[0].paymentLinkId, undefined);

    const walkInDate = new Date(Date.now() + 345_600_000).toISOString().slice(0, 10);
    const walkInDetails = { date: walkInDate, startTime: slot.startTime, endTime: slot.endTime,
      customerName: 'Walk-in Player', customerPhone: customer.phone };
    assert.equal((await staffRequest(activeStaff, '/bookings', 'POST', { ...walkInDetails, customerPhone: 'invalid' })).status, 400);
    const recorded = await staffRequest(activeStaff, '/bookings', 'POST', walkInDetails);
    assert.equal(recorded.status, 200);
    const { id: walkInId } = await recorded.json();
    assert.equal((await (await staffRequest(activeStaff, '/bookings', 'POST', walkInDetails)).json()).id, walkInId);
    assert.equal((await staffRequest(activeStaff, '/bookings', 'POST', { ...walkInDetails, customerPhone: '+919234567890' })).status, 409);
    assert.equal((await create(customer, { date: walkInDate })).status, 409);
    const linkedWalkIn = (await (await wallet(customer)).json()).current.find(({ id }) => id === walkInId);
    assert.equal(linkedWalkIn.paymentMethod, 'venue');
    const guestDate = new Date(Date.now() + 432_000_000).toISOString().slice(0, 10);
    const guestBooking = await staffRequest(activeStaff, '/bookings', 'POST', { ...walkInDetails, date: guestDate, customerPhone: '9234567890' });
    assert.equal(guestBooking.status, 200);
    const guestReservation = days.get(`${turf._id}:${guestDate}`).reservations[0];
    assert.equal(guestReservation.customer, undefined);
    assert.equal(guestReservation.walkIn.phone, '+919234567890');
    const managerSchedule = await request(owner, `${path}/schedule?date=${walkInDate}`);
    assert.equal((await managerSchedule.json()).bookings[0].recordedBy, activeStaff.name);
    assert.equal((await request(otherOwner, `${path}/schedule?date=${walkInDate}`)).status, 404);

    const feedbackList = await (await staffRequest(activeStaff, '/feedback')).json();
    assert.ok(feedbackList.feedback.some(({ id }) => id === completedId));
    const foreignFeedback = makeId();
    turfs.push({ _id: makeId(), owner: otherOwner.id, feedback: [{ _id: foreignFeedback }] });
    assert.equal((await staffRequest(activeStaff, `/feedback/${foreignFeedback}/reply`, 'PUT', { reply: 'Wrong turf' })).status, 404);
    turfs.pop();
    const sent = await staffRequest(activeStaff, `/feedback/${completedId}/reply`, 'PUT', { reply: 'Thanks for playing!' });
    assert.equal(sent.status, 200);
    const reviewedByStaff = (await (await wallet(customer)).json()).previous.find(({ id }) => id === completedId);
    assert.equal(reviewedByStaff.review.reply, 'Thanks for playing!');
    const publicReviews = (await details()).turf.feedback;
    assert.deepEqual(publicReviews[0], { id: completedId, author: 'Updated', rating: 3, comment: 'Good game', reply: 'Thanks for playing!' });
    assert.equal(publicReviews.every((review) => review.rating > 0), true);
    activeStaff.isActive = false;
    assert.equal((await staffRequest(activeStaff, schedulePath)).status, 401);
    activeStaff.isActive = true;

    const closingDate = new Date(Date.now() + 518_400_000).toISOString().slice(0, 10);
    assert.equal((await enableVenuePay(true)).status, 200);
    const closingChoice = { date: closingDate, amount: 15000, paymentMethod: 'venue' };
    const closing = await create(closingCustomer, closingChoice);
    assert.equal(closing.status, 200);
    const { booking: closingBooking } = await closing.json();
    const cancel = (user, id = closingBooking.id, targetDate = closingDate) => fetch(`${origin}/turfs${path}/bookings/${targetDate}/${id}/cancel`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET) },
    });
    assert.equal((await authRequest(closingCustomer, '/me', 'DELETE', {})).status, 400);
    assert.equal((await authRequest(closingCustomer, '/me', 'DELETE', { confirm: true })).status, 409);
    assert.equal((await cancel(customer)).status, 404);
    assert.match((await (await cancel(closingCustomer)).json()).message, /does not allow cancellations/);
    const setCancellation = (cutoffHours) => request(owner, path + '/configure', 'PUT', {
      ...setup, policies: { payAtVenue: true, cancellation: { available: true, cutoffHours } },
    });
    assert.equal((await setCancellation(300)).status, 200);
    assert.match((await (await cancel(closingCustomer)).json()).message, /cutoff/);
    assert.equal((await setCancellation(0)).status, 200);
    assert.equal((await cancel(winner, pending.id, date)).status, 409);
    const closingWallet = await (await wallet(closingCustomer)).json();
    assert.equal(closingWallet.current[0].canCancel, true);
    const cancelled = await cancel(closingCustomer);
    assert.equal((await cancelled.json()).booking.status, 'cancelled');
    assert.equal((await cancel(closingCustomer)).status, 200);
    assert.equal((await create(customer, closingChoice)).status, 200);
    assert.equal((await authRequest(closingCustomer, '/me', 'DELETE', { confirm: true })).status, 204);
    assert.equal((await authRequest(closingCustomer)).status, 401);
    assert.equal(days.get(`${turf._id}:${closingDate}`).reservations[0].status, 'cancelled');
  });
  const dashboard = await (await request(owner)).json();
  assert.equal(dashboard.turfs[0].verificationStatus, 'verified');
  assert.equal(dashboard.analytics.totalSlots, 1);
  assert.equal(dashboard.analytics.totalEquipmentUnits, 3);
  assert.equal((await (await request(otherOwner)).json()).turfs.length, 0);
  assert.equal((await request(owner, '', 'POST', { ...registration, name: 'Second Turf', commissionAccepted: true })).status, 201);
  assert.equal(turfs[0].contactPhone, turfs[1].contactPhone);
  const confirmation = { confirmationName: 'Updated Turf', confirmationEmail: 'OWNER-LOGIN@example.test' };
  assert.equal((await request(otherOwner, path, 'DELETE', confirmation)).status, 404);
  assert.equal((await request(owner, path, 'DELETE')).status, 400);
  assert.equal((await request(owner, path, 'DELETE', { ...confirmation, confirmationName: 'updated turf' })).status, 400);
  assert.equal((await request(owner, path, 'DELETE', { ...confirmation, confirmationEmail: 'new@example.test' })).status, 400);
  assert.equal((await request(owner, path)).status, 200);
  assert.equal((await request(owner, path, 'DELETE', confirmation)).status, 200);
  assert.ok(turfs[0].removedAt instanceof Date);
  assert.equal((await request(owner, path)).status, 404);
  assert.equal((await request(owner, path + '/configure', 'PUT', setup)).status, 404);
  const afterRemoval = await (await request(owner)).json();
  assert.deepEqual(afterRemoval.turfs.map(({ name }) => name), ['Second Turf']);
  const addedAgain = await request(owner, '', 'POST', { ...registration, name: 'Updated Turf', commissionAccepted: true });
  assert.equal(addedAgain.status, 201);
  assert.equal((await addedAgain.json()).turf.verificationStatus, 'pending');
  turfs[1].verificationStatus = 'verified';
  assert.deepEqual(await publicListings(), []);
  turfs[1].isConfigured = true;
  turfs[1].timeSlots = [{ ...slot, price: undefined }, { ...slot, isActive: false }];
  assert.deepEqual(await publicListings(), []);
  assert.equal((await authRequest(owner, '/me', 'DELETE', { confirm: true })).status, 409);
  for (const entry of turfs.filter((item) => !item.removedAt)) {
    assert.equal((await request(owner, '/' + entry._id, 'DELETE', { confirmationName: entry.name, confirmationEmail: owner.email })).status, 200);
  }
  assert.equal((await authRequest(owner, '/me', 'DELETE', { confirm: true })).status, 204);
  assert.equal((await authRequest(owner)).status, 401);
});
