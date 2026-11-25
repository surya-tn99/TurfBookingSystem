import jwt from 'jsonwebtoken';
import { isObjectIdOrHexString } from 'mongoose';
import { isDatabaseUnavailable } from '../config/db.js';
import { authUnavailable } from '../controllers/authController.js';
import { User } from '../models/User.js';

export const protect = async (req, res, next) => {
  const token = req.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!isObjectIdOrHexString(decoded?.id)) throw new Error('Invalid account ID');
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }

  try {
    req.user = await User.findById(decoded.id);
    if (!req.user?.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    return next();
  } catch (error) {
    if (isDatabaseUnavailable(error)) return authUnavailable(res);
    return next(error);
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user?.role}' is not authorized to access this resource`,
      });
    }
    return next();
  };
};
