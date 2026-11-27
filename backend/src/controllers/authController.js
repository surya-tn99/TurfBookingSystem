import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { isDatabaseUnavailable } from '../config/db.js';
import { Turf } from '../models/Turf.js';
import { User } from '../models/User.js';
import { withActiveAccount } from '../services/accountActivity.js';
import { accountPhone } from '../services/phone.js';
import { customerReservations, isCurrentBooking } from '../services/turfBookings.js';

const googleClient = new OAuth2Client();
const signupRoles = ['customer', 'owner'];

function accountName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length <= 100 ? name : '';
}

function accountProfile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    avatar: user.avatar,
    walletBalance: user.walletBalance || 0,
    needsProfile: user.needsProfile === true,
  };
}

function sendSession(res, user, status) {
  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
  return res.status(status).json({
    success: true,
    message: status === 201 ? 'Account created successfully' : 'Login successful',
    token,
    user: accountProfile(user),
  });
}

export function authUnavailable(res) {
  return res.status(503).json({
    success: false,
    message: 'PickTurf is temporarily unavailable. Please try again in a moment.',
  });
}

export async function googleAuth(req, res, next) {
  const { credential, role, isSignUp } = req.body ?? {};
  if (typeof credential !== 'string' || !credential.trim()) {
    return res.status(400).json({ success: false, message: 'Google credential token is required' });
  }
  if (typeof isSignUp !== 'boolean' || (isSignUp && !signupRoles.includes(role))) {
    return res.status(400).json({ success: false, message: 'Please select a valid account type when signing up.' });
  }

  const audience = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!audience) return authUnavailable(res);

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid Google credential. Please try signing in with Google again.' });
  }

  const { sub: googleId, email, email_verified: verified, name, picture } = payload ?? {};
  if (typeof googleId !== 'string' || !googleId.trim()
    || typeof email !== 'string' || !email.trim() || verified !== true) {
    return res.status(401).json({ success: false, message: 'A verified Google email and account are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      if (!isSignUp) {
        return res.status(404).json({ success: false, message: 'No account found with this email. Please sign up first.' });
      }

      try {
        user = await User.create({
          name: name?.trim() || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          googleId,
          avatar: picture || '',
          role,
          needsProfile: true,
        });
        return sendSession(res, user, 201);
      } catch (error) {
        if (error.code !== 11000) throw error;
        user = await User.findOne({ email: normalizedEmail });
        if (!user) throw error;
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This PickTurf account is inactive.' });
    }
    if (user.googleId && user.googleId !== googleId) {
      return res.status(401).json({ success: false, message: 'This Google account does not match the PickTurf account.' });
    }
    if (isSignUp && user.role !== role) {
      return res.status(400).json({
        success: false,
        message: 'This email already has a different PickTurf role. Please log in instead.',
      });
    }
    return sendSession(res, user, 200);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return authUnavailable(res);
    return next(error);
  }
}

export function getMe(req, res) {
  return res.json({ success: true, user: accountProfile(req.user) });
}

export async function completeProfile(req, res, next) {
  const { name, phone } = req.body ?? {};
  const fullName = accountName(name);
  const normalizedPhone = accountPhone(phone);
  if (!fullName) {
    return res.status(400).json({ success: false, message: 'Enter a name between 1 and 100 characters.' });
  }
  if (!normalizedPhone) {
    return res.status(400).json({ success: false, message: 'Enter a 10-digit Indian phone number or include your country code.' });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.user.id, isActive: true, needsProfile: true },
      { $set: { name: fullName, phone: normalizedPhone, needsProfile: false } },
      { returnDocument: 'after', runValidators: true },
    );
    const user = updatedUser ?? await User.findById(req.user.id);
    if (!user?.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    return res.json({ success: true, user: accountProfile(user) });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.phone) {
      return res.status(409).json({ message: 'This phone number is already used by a PickTurf account.' });
    }
    if (isDatabaseUnavailable(error)) return authUnavailable(res);
    return next(error);
  }
}

export async function updateProfile(req, res, next) {
  if (req.user.needsProfile) return res.status(403).json({ message: 'Complete your profile first.' });
  const { name, phone } = req.body ?? {};
  const changes = {};
  if (name !== undefined) {
    changes.name = accountName(name);
    if (!changes.name) return res.status(400).json({ message: 'Enter a name between 1 and 100 characters.' });
  }
  if (phone !== undefined) {
    changes.phone = accountPhone(phone);
    if (!changes.phone) return res.status(400).json({ message: 'Enter a 10-digit Indian phone number or include the country code.' });
  }
  if (!Object.keys(changes).length) return res.status(400).json({ message: 'Enter a name or phone number to update.' });

  try {
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, role: req.user.role, isActive: true },
      { $set: changes },
      { returnDocument: 'after', runValidators: true },
    );
    if (!user) return res.status(401).json({ message: 'User not found or inactive.' });
    return res.json({ success: true, user: accountProfile(user) });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.phone) {
      return res.status(409).json({ message: 'This phone number is already used by a PickTurf account.' });
    }
    if (isDatabaseUnavailable(error)) return authUnavailable(res);
    return next(error);
  }
}

export async function deleteAccount(req, res, next) {
  if (req.body?.confirm !== true) return res.status(400).json({ message: 'Confirm that you want to delete your account.' });
  const { id, role } = req.user;
  const blocked = (message) => Object.assign(new Error(message), { status: 409 });
  try {
    await withActiveAccount(id, role, async (session) => {
      if (role === 'owner') {
        if (await Turf.exists({ owner: id, removedAt: null }, { session })) {
          throw blocked('Remove all your registered turfs from Dashboard before deleting your account.');
        }
      } else {
        const bookings = await customerReservations(id, null, session);
        const now = Date.now();
        if (bookings.some((booking) => isCurrentBooking(booking, now))) {
          throw blocked('Cancel your active bookings or resolve any pending payments in Wallet before deleting your account.');
        }
      }
      await User.deleteOne({ _id: id, role, isActive: true }, { session });
    });
    return res.status(204).end();
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (isDatabaseUnavailable(error)) return authUnavailable(res);
    return next(error);
  }
}
