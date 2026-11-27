import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your full name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['customer', 'owner', 'staff'],
      required: [true, 'Please specify a user role'],
    },
    googleId: {
      type: String,
      sparse: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    needsProfile: {
      type: Boolean,
      default: false,
    },
    // Wallet balance specifically for customer users
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // For staff members: assigned turf
    assignedTurf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Turf',
      default: null,
    },
    // If created by owner (for staff accounts)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    accountActivityVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' } } });

export const User = mongoose.model('User', userSchema);
