import mongoose from 'mongoose';

const { Schema } = mongoose;
const turfSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  contactPhone: { type: String, required: true },
  contactEmail: { type: String, required: true, lowercase: true },
  address: {
    street: String, area: String, city: String, state: String, pincode: String,
    mapPinUrl: String, coordinates: { lat: Number, lng: Number },
  },
  gstNumber: String,
  commissionAccepted: { type: Boolean, required: true, validate: (value) => value === true },
  commissionRate: { type: Number, default: 3 },
  commissionAcceptedAt: { type: Date, required: true },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  submittedForVerificationAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date, default: null },
  removedAt: { type: Date, default: null },
  sports: [String],
  slotDurationMinutes: { type: Number, default: 60 },
  timeSlots: [new Schema({
    startTime: String, endTime: String, label: String, slotType: { type: String, enum: ['peak', 'non-peak'] },
    price: Number, isActive: Boolean,
  }, { _id: false })],
  equipment: [new Schema({ name: String, price: Number, maxCount: Number, isAvailable: Boolean }, { _id: false })],
  facilities: {
    parking: { available: Boolean, twoWheelerCapacity: Number, fourWheelerCapacity: Number, notes: String },
    restrooms: { available: Boolean, washroomCount: Number, changingRoomCount: Number, notes: String },
    drinkingWater: Boolean, seatingArea: Boolean, cafeteria: Boolean, coveredRoof: Boolean,
    floodlights: { available: Boolean, luxRating: String },
    surfaceType: String, venueType: { type: String, enum: ['outdoor', 'indoor', 'hybrid'] }, dimensions: String,
  },
  regulations: [String],
  policies: {
    cancellation: { available: Boolean, cutoffHours: Number },
    rescheduling: { available: Boolean, cutoffHours: Number, maxChanges: Number },
    freeRescheduleHours: Number,
    rainPolicy: String,
    cancellationNote: String,
  },
  media: { images: [String], youtubeUrl: String },
  isConfigured: { type: Boolean, default: false },
  feedback: [new Schema({
    customer: { type: Schema.Types.ObjectId, ref: 'User' },
    name: String, rating: { type: Number, min: 1, max: 5 }, comment: String,
    reply: String, repliedAt: Date,
  }, { timestamps: true })],
}, { timestamps: true });

export const Turf = mongoose.model('Turf', turfSchema);
