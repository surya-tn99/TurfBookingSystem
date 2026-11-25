import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { Turf } from '../src/models/Turf.js';
import { User } from '../src/models/User.js';
import turfRoutes from '../src/routes/turfRoutes.js';
import { accountPhone } from '../src/services/phone.js';

test('owner registration, setup, isolation, and backend verification', async (t) => {
  const makeId = () => new mongoose.Types.ObjectId().toString();
  const owner = { id: makeId(), email: 'owner-login@example.test', role: 'owner', isActive: true };
  const otherOwner = { id: makeId(), role: 'owner', isActive: true };
  const customer = { id: makeId(), role: 'customer', isActive: true };
  const users = [owner, otherOwner, customer];
  const turfs = [];
  process.env.JWT_SECRET = 'turf-auth-test-secret';
  process.env.MONGODB_URI = 'mongodb://fixture.invalid/pickturf';
  t.mock.method(mongoose, 'connect', async () => {
    mongoose.connection.readyState = 1;
    return { connection: { host: 'test fixture' } };
  });
  t.mock.method(User, 'createIndexes', async () => []);
  t.mock.method(User, 'findById', async (id) => users.find((user) => user.id === id));
  t.mock.method(User, 'create', async (fields) => {
    if (users.some((user) => user.phone === fields.phone || user.email === fields.email)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const user = { ...fields, id: makeId(), isActive: true };
    users.push(user);
    return user;
  });
  t.mock.method(User, 'findOneAndUpdate', async (query, { $set }) => {
    const user = users.find((candidate) => Object.entries(query)
      .every(([key, value]) => (key === '_id' ? candidate.id : candidate[key]) === value));
    return user ? Object.assign(user, $set) : null;
  });
  const matches = (turf, query) => turf.owner === query.owner && (!query._id || query._id === turf._id)
    && (query.removedAt !== null || !turf.removedAt) && (!query.name || turf.name === query.name);
  const find = (query) => turfs.find((turf) => matches(turf, query));
  t.mock.method(Turf, 'create', async (data) => {
    const id = makeId();
    const turf = {
      _id: id, id, ...data, commissionRate: 3, verificationStatus: 'pending',
      submittedForVerificationAt: new Date(), sports: [], timeSlots: [], equipment: [], media: { images: [] },
    };
    turfs.push(turf);
    return turf;
  });
  t.mock.method(Turf, 'updateMany', async (query, { $set }) => {
    turfs.filter((turf) => matches(turf, query) && turf.verificationStatus === query.verificationStatus
      && turf.submittedForVerificationAt <= query.submittedForVerificationAt.$lte).forEach((turf) => Object.assign(turf, $set));
  });
  t.mock.method(Turf, 'find', (query) => ({ sort: () => ({ lean: async () => turfs.filter((turf) => matches(turf, query)) }) }));
  t.mock.method(Turf, 'findOne', async (query) => find(query));
  t.mock.method(Turf, 'exists', async (query) => find(query));
  t.mock.method(Turf, 'updateOne', async (query, { $set }) => {
    const turf = find(query);
    if (turf) Object.assign(turf, $set);
    return { matchedCount: turf ? 1 : 0 };
  });
  t.mock.method(Turf, 'findOneAndUpdate', async (query, { $set }) => {
    const turf = find(query);
    if (turf && $set) {
      const { 'policies.cancellation': cancellation, 'policies.rescheduling': rescheduling, ...fields } = $set;
      Object.assign(turf, fields);
      if (cancellation && rescheduling) turf.policies = { ...turf.policies, cancellation, rescheduling };
    }
    return turf;
  });
  await connectDB();

  const app = express();
  app.use(express.json());
  app.use('/owner/turfs', turfRoutes);
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
  assert.equal(accountPhone('98765 43210'), accountPhone('+91 (98765) 43210'));
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.phone === 1 && options.unique));
  assert.equal((await request(otherOwner, path)).status, 404);
  assert.equal((await request(otherOwner, path + '/configure', 'PUT', {})).status, 404);
  assert.equal((await request(otherOwner, path + '/media', 'POST', {})).status, 404);
  assert.equal((await request(otherOwner, path + '/media', 'DELETE', { url: 'https://example.test/photo' })).status, 404);
  assert.equal((await request(otherOwner, path + '/staff', 'POST', {})).status, 404);
  const member = { name: 'Turf staff', email: 'pickturf-fixture@gmail.com', phone: '9876543210' };
  for (const [field, value, expected] of [
    ['name', ' ', /staff name/],
    ['email', 'staff@example.test', /staff Gmail address/],
    ['phone', '123', /staff phone number/],
  ]) {
    const invalidMember = await request(owner, path + '/staff', 'POST', { ...member, [field]: value });
    assert.equal(invalidMember.status, 400);
    assert.match((await invalidMember.json()).message, expected);
  }
  const added = await request(owner, path + '/staff', 'POST', member);
  assert.equal(added.status, 201);
  const memberId = (await added.json()).member._id;
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
    sports: ['Football', 'football'], timeSlots: [slot], equipment: [{ name: 'Ball', price: 20, maxCount: 3 }],
    facilities: { parking: { available: true, fourWheelerCapacity: 2 }, restrooms: { available: true, washroomCount: 1 } },
    regulations: ['No metal spikes'],
    policies: {
      cancellation: { available: false, cutoffHours: 24 },
      rescheduling: { available: true, cutoffHours: 12, maxChanges: 3 },
    },
  };
  assert.equal((await request(owner, path + '/configure', 'PUT', { ...setup, timeSlots: [slot, { ...slot, startTime: '06:30' }] })).status, 400);
  assert.equal((await request(owner, path + '/configure', 'PUT', {
    ...setup,
    policies: { ...setup.policies, cancellation: { available: true } },
  })).status, 400);
  turfs[0].policies = { freeRescheduleHours: 6, rainPolicy: 'Legacy text' };
  const saved = await request(owner, path + '/configure', 'PUT', setup);
  assert.equal(saved.status, 200);
  const configured = (await saved.json()).turf;
  assert.equal(configured.verificationStatus, 'pending');
  assert.equal(configured.isConfigured, true);
  assert.deepEqual(configured.sports, ['Football']);
  assert.equal(configured.timeSlots[0].price, 150);
  assert.equal(configured.equipment[0].maxCount, 3);
  assert.equal(configured.facilities.parking.fourWheelerCapacity, 2);
  assert.equal(configured.facilities.restrooms.washroomCount, 1);
  assert.deepEqual(configured.regulations, ['No metal spikes']);
  assert.deepEqual(configured.policies.cancellation, { available: false, cutoffHours: null });
  assert.deepEqual(configured.policies.rescheduling, { available: true, cutoffHours: 12, maxChanges: 1 });
  assert.equal(configured.policies.rainPolicy, 'Legacy text');
  const before = await (await request(owner, path)).json();
  assert.equal(before.turf.verificationStatus, 'pending');
  turfs[0].submittedForVerificationAt = new Date(Date.now() - 16_000);
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
});
