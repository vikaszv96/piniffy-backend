import mongoose from 'mongoose';

/**
 * Loads .env in development so MONGODB_URI is available before connect.
 */
export async function connectMongo() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const dotenv = await import('dotenv');
      dotenv.config();
    } catch {
      // ignore
    }
  }

  const uri =
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/piniffy';

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[mongo] connected:', uri.replace(/\/\/([^:]+):[^@]+@/, '//***:***@'));
    return true;
  } catch (err) {
    console.error('[mongo] connection failed (continuing without DB):', err?.message || err);
    return false;
  }
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}
