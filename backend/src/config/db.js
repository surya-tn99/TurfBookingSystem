import mongoose from 'mongoose';
import { User } from '../models/User.js';

let accountIndexReady = false;

export function databaseReady() {
  return accountIndexReady && mongoose.connection.readyState === 1;
}

export function isDatabaseUnavailable(error) {
  return !databaseReady()
    || error instanceof mongoose.mongo.MongoNetworkError
    || error instanceof mongoose.mongo.MongoServerSelectionError
    || error instanceof mongoose.mongo.MongoNotConnectedError
    || error instanceof mongoose.mongo.MongoOperationTimeoutError;
}

export async function connectDB() {
  if (!process.env.MONGODB_URI?.trim()) {
    console.error('[Database] MONGODB_URI is required for authentication.');
    return;
  }

  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await User.createIndexes();
    accountIndexReady = true;
    console.log(`[Database] MongoDB Connected: ${connection.connection.host}`);
  } catch (error) {
    console.error(`[Database] Connection or account index setup failed (${error.name}). Retrying in 10 seconds.`);
    setTimeout(connectDB, 10_000).unref();
  }
}
