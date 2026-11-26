import express from 'express';
import multer from 'multer';
import { isObjectIdOrHexString } from 'mongoose';
import { isDatabaseUnavailable } from '../config/db.js';
import { authUnavailable } from '../controllers/authController.js';
import { authorize, protect } from '../middleware/authMiddleware.js';
import { Turf } from '../models/Turf.js';
import { User } from '../models/User.js';
import { accountPhone } from '../services/phone.js';
import { removePhotos, storageError, turfStorage, uploadPhoto } from '../services/storageService.js';
import { configuration, registration, turfContact } from '../services/turfValidation.js';
import { scheduleTurfVerification, syncPendingVerifications } from '../services/turfVerificationService.js';
import { requireAuthService } from './authRoutes.js';

const router = express.Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024, files: 10, fields: 0 } });
const owned = (req) => ({ _id: req.params.id, owner: req.user.id, removedAt: null });
const missing = (res) => res.status(404).json({ message: 'Turf not found.' });

function handle(handler) {
  return async (req, res, next) => {
    try { return await handler(req, res); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (isDatabaseUnavailable(error)) return authUnavailable(res);
      return next(error);
    }
  };
}

router.use(requireAuthService, protect, authorize('owner'), (req, res, next) => {
  if (req.user.needsProfile) return res.status(403).json({ message: 'Complete your profile before managing turfs.' });
  return next();
});
router.param('id', (req, res, next, id) => isObjectIdOrHexString(id) ? next() : missing(res));

router.post('/', handle(async (req, res) => {
  const turf = await Turf.create({
    ...registration(req.body), owner: req.user.id, commissionAccepted: true,
    commissionAcceptedAt: new Date(),
  });
  scheduleTurfVerification(turf.id);
  return res.status(201).json({ turf });
}));

router.get('/', handle(async (req, res) => {
  const filter = { owner: req.user.id, removedAt: null };
  await syncPendingVerifications(filter);
  const turfs = await Turf.find(filter).sort({ createdAt: -1 }).lean();
  const analytics = {
    totalTurfs: turfs.length,
    verifiedTurfs: turfs.filter((turf) => turf.verificationStatus === 'verified').length,
    pendingTurfs: turfs.filter((turf) => turf.verificationStatus === 'pending').length,
    configuredTurfs: turfs.filter((turf) => turf.isConfigured).length,
    totalSports: turfs.reduce((count, turf) => count + turf.sports.length, 0),
    totalSlots: turfs.reduce((count, turf) => count + turf.timeSlots.filter((slot) => slot.isActive).length, 0),
    totalEquipmentUnits: turfs.reduce((count, turf) => count + turf.equipment.reduce((sum, item) => sum + (item.isAvailable ? item.maxCount : 0), 0), 0),
    totalBookings: 0, totalRevenue: 0,
  };
  return res.json({ turfs, analytics });
}));

router.get('/:id', handle(async (req, res) => {
  const filter = owned(req);
  await syncPendingVerifications(filter);
  const turf = await Turf.findOne(filter);
  return turf ? res.json({ turf }) : missing(res);
}));

router.get('/:id/sports', handle(async (req, res) => {
  if (!await Turf.exists(owned(req))) return missing(res);
  const catalog = await Turf.find({ _id: { $ne: req.params.id }, removedAt: null, verificationStatus: 'verified', isConfigured: true })
    .select('sports facilities.venueType').lean();
  const suggestions = { outdoor: [], indoor: [], hybrid: [] };
  for (const venue of catalog) {
    const type = venue.facilities?.venueType || 'outdoor';
    suggestions[type]?.push(...venue.sports);
  }
  for (const type of Object.keys(suggestions)) suggestions[type] = [...new Map(suggestions[type].map((name) => [name.toLowerCase(), name])).values()];
  return res.json({ suggestions });
}));

router.patch('/:id', handle(async (req, res) => {
  if (!await Turf.exists(owned(req))) return missing(res);
  const turf = await Turf.findOneAndUpdate(owned(req), { $set: turfContact(req.body ?? {}) }, { returnDocument: 'after', runValidators: true });
  return turf ? res.json({ turf }) : missing(res);
}));

router.delete('/:id', handle(async (req, res) => {
  const filter = owned(req);
  const turf = await Turf.findOne(filter, 'name');
  if (!turf) return missing(res);

  const { confirmationName, confirmationEmail } = req.body ?? {};
  if (typeof confirmationName !== 'string' || confirmationName.trim() !== turf.name) {
    return res.status(400).json({ message: 'Enter the exact turf name to confirm removal.' });
  }
  if (typeof confirmationEmail !== 'string' || confirmationEmail.trim().toLowerCase() !== req.user.email?.toLowerCase()) {
    return res.status(400).json({ message: 'Enter your PickTurf sign-in email to confirm removal.' });
  }
  const result = await Turf.updateOne({ ...filter, name: turf.name }, { $set: { removedAt: new Date() } });
  return result.matchedCount
    ? res.json({ removed: true })
    : res.status(409).json({ message: 'The turf changed. Refresh the page and try again.' });
}));

const staffFields = 'name email phone isActive';
const staffFilter = (req) => ({ createdBy: req.user.id, assignedTurf: req.params.id, role: 'staff' });

router.get('/:id/staff', handle(async (req, res) => {
  if (!await Turf.exists(owned(req))) return missing(res);
  return res.json({ staff: await User.find(staffFilter(req)).select(staffFields).sort({ name: 1 }).lean() });
}));

router.post('/:id/staff', handle(async (req, res) => {
  if (!await Turf.exists(owned(req))) return missing(res);
  const { name, email, phone } = req.body ?? {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedPhone = accountPhone(phone);
  if (!trimmedName || trimmedName.length > 100) {
    return res.status(400).json({ message: 'Enter a staff name between 1 and 100 characters.' });
  }
  if (normalizedEmail.length > 254 || !/^[^\s@]+@gmail\.com$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Enter a valid staff Gmail address ending in @gmail.com.' });
  }
  if (!normalizedPhone) {
    return res.status(400).json({ message: 'Enter a valid staff phone number. Use 10 digits for India or include the country code.' });
  }
  let member;
  try {
    member = await User.create({ ...staffFilter(req), name: trimmedName, email: normalizedEmail, phone: normalizedPhone });
  } catch (error) {
    if (error.code !== 11000) throw error;
    member = await User.findOneAndUpdate({
      ...staffFilter(req), assignedTurf: null, isActive: false, email: normalizedEmail, phone: normalizedPhone,
    }, { $set: { assignedTurf: req.params.id, isActive: true, name: trimmedName } }, { returnDocument: 'after' });
    if (!member) return res.status(409).json({ message: 'That email or phone number already belongs to a PickTurf account.' });
  }
  return res.status(201).json({ member: { _id: member.id, name: member.name, email: member.email, phone: member.phone, isActive: member.isActive } });
}));

router.patch('/:id/staff/:memberId', handle(async (req, res) => {
  if (!await Turf.exists(owned(req))) return missing(res);
  if (!isObjectIdOrHexString(req.params.memberId) || typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'Invalid staff update.' });
  const member = await User.findOneAndUpdate({ ...staffFilter(req), _id: req.params.memberId },
    { $set: { isActive: req.body.isActive } }, { returnDocument: 'after' }).select(staffFields);
  return member ? res.json({ member }) : res.status(404).json({ message: 'Staff member not found.' });
}));

router.delete('/:id/staff/:memberId', handle(async (req, res) => {
  if (!await Turf.exists(owned(req))) return missing(res);
  const { memberId } = req.params;
  if (!isObjectIdOrHexString(memberId)) return res.status(404).json({ message: 'Staff member not found.' });
  const member = await User.findOneAndUpdate({ ...staffFilter(req), _id: memberId },
    { $set: { assignedTurf: null, isActive: false } }, { returnDocument: 'after' });
  return member ? res.json({ memberId }) : res.status(404).json({ message: 'Staff member not found.' });
}));

router.put('/:id/feedback/:feedbackId/reply', handle(async (req, res) => {
  if (!isObjectIdOrHexString(req.params.feedbackId)) return res.status(404).json({ message: 'Feedback not found.' });
  const reply = typeof req.body?.reply === 'string' ? req.body.reply.trim() : '';
  if (!reply || reply.length > 2000) return res.status(400).json({ message: 'Enter a reply of up to 2,000 characters.' });
  const turf = await Turf.findOneAndUpdate({ ...owned(req), 'feedback._id': req.params.feedbackId },
    { $set: { 'feedback.$.reply': reply, 'feedback.$.repliedAt': new Date() } }, { returnDocument: 'after' });
  return turf ? res.json({ turf }) : res.status(404).json({ message: 'Feedback not found.' });
}));

router.put('/:id/configure', handle(async (req, res) => {
  if (!await Turf.exists(owned(req))) return missing(res);
  const { policies, ...fields } = configuration(req.body);
  const turf = await Turf.findOneAndUpdate(owned(req), { $set: {
    ...fields,
    'policies.cancellation': policies.cancellation,
    ...(policies.payAtVenue !== undefined && { 'policies.payAtVenue': policies.payAtVenue }),
  } }, { returnDocument: 'after', runValidators: true });
  return turf ? res.json({ turf }) : missing(res);
}));

router.post('/:id/media', async (req, res, next) => {
  try {
    req.turf = await Turf.findOne(owned(req));
    if (!req.turf) return missing(res);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return authUnavailable(res);
    return next(error);
  }
  upload.array('images', 10)(req, res, (error) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ message: 'Upload up to 10 images, each no larger than 5 MB.' });
    return next(error);
  });
}, handle(async (req, res) => {
  const filter = owned(req);
  const files = req.files ?? [];
  if (!files.length || req.turf.media.images.length + files.length > 10) {
    throw storageError('Choose images without exceeding 10 photos per turf.', 400);
  }

  const storage = turfStorage();
  const uploaded = [];
  try {
    for (const file of files) uploaded.push(await uploadPhoto(storage, req.params.id, file));
    const turf = await Turf.findOneAndUpdate({
      ...filter, $expr: { $lte: [{ $size: '$media.images' }, 10 - uploaded.length] },
    }, { $push: { 'media.images': { $each: uploaded.map(({ url }) => url) } } }, { returnDocument: 'after' });
    if (!turf) throw storageError('The photo limit was reached. Refresh and try again.', 409);
    return res.status(201).json({ turf });
  } catch (error) {
    await removePhotos(storage, uploaded.map(({ key }) => key)).catch((cleanup) => console.error('[Turf photo cleanup]', cleanup.message));
    throw error;
  }
}));

router.delete('/:id/media', handle(async (req, res) => {
  const filter = owned(req);
  const existing = await Turf.findOne(filter);
  if (!existing) return missing(res);
  const url = req.body?.url;
  if (!existing.media.images.includes(url)) return res.status(404).json({ message: 'Photo not found.' });
  const filename = new URL(url).pathname.split('/').at(-1);
  const key = `turfs/${req.params.id}/${filename}`;
  const storage = turfStorage();
  await removePhotos(storage, [key]);
  const turf = await Turf.findOneAndUpdate(filter, { $pull: { 'media.images': url } }, { returnDocument: 'after' });
  return turf ? res.json({ turf }) : missing(res);
}));

export default router;
