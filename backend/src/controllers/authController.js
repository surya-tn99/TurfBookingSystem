import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || 'dev_jwt_secret_fallback',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

// In-memory store fallback when MongoDB is not connected in early local dev
const devMockUsers = new Map();

/**
 * @route   POST /api/auth/google
 * @desc    Google OAuth Sign-up / Login
 * @access  Public
 */
export const googleAuth = async (req, res) => {
  try {
    const { credential, role, isSignUp } = req.body;

    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google credential token is required' });
    }

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      // If token decoding as JWT payload for dev fallback
      const base64Url = credential.split('.')[1];
      if (base64Url) {
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          Buffer.from(base64, 'base64')
            .toString('utf-8')
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        payload = JSON.parse(jsonPayload);
      } else {
        return res.status(401).json({ success: false, message: 'Invalid Google credential token' });
      }
    }

    const { sub: googleId, email, name, picture } = payload;
    const normalizedEmail = email.toLowerCase();

    // Check database if connected
    let user = null;
    const isDbConnected = User.db?.readyState === 1;

    if (isDbConnected) {
      user = await User.findOne({ email: normalizedEmail });
    } else {
      user = devMockUsers.get(normalizedEmail) || null;
    }

    // SCENARIO 1: Existing User
    if (user) {
      // If trying to register with a conflicting role
      if (isSignUp && role && user.role !== role) {
        const roleLabel = user.role === 'owner' ? 'Turf Owner (Business Account)' : 'Customer (User Account)';
        return res.status(400).json({
          success: false,
          message: `This Google account is already registered as a ${roleLabel}. One Gmail account can hold only one role. Please log in instead.`,
        });
      }

      // Successful login
      const token = generateToken(user._id || user.id, user.role);
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user._id || user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          walletBalance: user.walletBalance || 0,
        },
      });
    }

    // SCENARIO 2: New User
    if (!isSignUp) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email. Please sign up to choose your account type.',
      });
    }

    // Validate permitted sign-up roles (Staff cannot publicly register)
    if (!role || !['customer', 'owner'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid account type: Customer (User) or Turf Owner (Business).',
      });
    }

    let newUser;
    if (isDbConnected) {
      newUser = await User.create({
        name,
        email: normalizedEmail,
        googleId,
        avatar: picture || '',
        role,
        walletBalance: 0,
      });
    } else {
      newUser = {
        id: 'mock_' + Date.now(),
        name,
        email: normalizedEmail,
        googleId,
        avatar: picture || '',
        role,
        walletBalance: 0,
      };
      devMockUsers.set(normalizedEmail, newUser);
    }

    const token = generateToken(newUser._id || newUser.id, newUser.role);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: newUser._id || newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        avatar: newUser.avatar,
        walletBalance: newUser.walletBalance,
      },
    });
  } catch (error) {
    console.error('[Google Auth Error]:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server authentication error' });
  }
};

/**
 * @route   POST /api/auth/dev-login
 * @desc    Quick Developer Login for local testing without Google Client ID
 * @access  Public (Dev mode only)
 */
export const devLogin = async (req, res) => {
  try {
    const { name, email, role, isSignUp } = req.body;
    if (!email || !role) {
      return res.status(400).json({ success: false, message: 'Email and role are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const isDbConnected = User.db?.readyState === 1;

    let user = isDbConnected
      ? await User.findOne({ email: normalizedEmail })
      : devMockUsers.get(normalizedEmail);

    if (user) {
      if (isSignUp && user.role !== role) {
        return res.status(400).json({
          success: false,
          message: `This email is already registered as '${user.role}'. One email holds only one role.`,
        });
      }
      const token = generateToken(user._id || user.id, user.role);
      return res.json({
        success: true,
        token,
        user: {
          id: user._id || user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          walletBalance: user.walletBalance || 0,
        },
      });
    }

    // New user
    if (!isSignUp) {
      return res.status(404).json({ success: false, message: 'Account not found. Please sign up first.' });
    }

    const userData = {
      name: name || email.split('@')[0],
      email: normalizedEmail,
      role,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
      walletBalance: 0,
    };

    let createdUser;
    if (isDbConnected) {
      createdUser = await User.create(userData);
    } else {
      createdUser = { id: 'dev_' + Date.now(), ...userData };
      devMockUsers.set(normalizedEmail, createdUser);
    }

    const token = generateToken(createdUser._id || createdUser.id, createdUser.role);
    return res.status(201).json({
      success: true,
      token,
      user: createdUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get logged in user profile
 * @access  Private
 */
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};
