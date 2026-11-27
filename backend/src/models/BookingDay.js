import mongoose from 'mongoose';

const { Schema } = mongoose;
const reservation = new Schema({
  customer: { type: Schema.Types.ObjectId, required() { return !this.walkIn?.phone; } },
  walkIn: { name: String, phone: String },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  turfName: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['online', 'venue', 'free'] },
  venuePaidAt: Date,
  slotAmount: Number,
  equipment: [new Schema({ id: String, name: String, unitAmount: Number, quantity: Number }, { _id: false, id: false })],
  status: { type: String, enum: ['pending', 'confirmed', 'expired', 'cancelled'], required: true },
  cancelledAt: Date,
  expiresAt: Date,
  paymentLinkId: String,
  checkoutUrl: String,
});

// One document per turf and local date lets MongoDB check overlapping slots and reserve one atomically.
const bookingDaySchema = new Schema({
  _id: String,
  reservations: [reservation],
});

bookingDaySchema.index({ 'reservations.customer': 1, 'reservations.status': 1 });

export const BookingDay = mongoose.model('BookingDay', bookingDaySchema);
