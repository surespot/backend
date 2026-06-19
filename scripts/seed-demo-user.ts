import { config } from 'dotenv';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const envFile =
  process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
config({ path: envFile });
config({ path: '.env' });

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/surespot';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'surespot';

// Demo account credentials — update these before running
const DEMO_PHONE = '+2348000000001';
const DEMO_EMAIL = 'demo@surespot.app';
const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_FIRST_NAME = 'Demo';
const DEMO_LAST_NAME = 'User';
const DEMO_BIRTHDAY = '1995-06-15T00:00:00.000Z';

async function seedDemoUser() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  const usersCol = db.collection('users');
  const pickupLocationsCol = db.collection('pickuplocations');

  // Hash password
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Upsert demo user by phone
  const existing = await usersCol.findOne({ phone: DEMO_PHONE });

  let userId: mongoose.Types.ObjectId;

  if (existing) {
    userId = existing._id as mongoose.Types.ObjectId;
    await usersCol.updateOne(
      { _id: userId },
      {
        $set: {
          firstName: DEMO_FIRST_NAME,
          lastName: DEMO_LAST_NAME,
          email: DEMO_EMAIL,
          password: passwordHash,
          birthday: new Date(DEMO_BIRTHDAY),
          isPhoneVerified: true,
          isEmailVerified: true,
          isActive: true,
          role: 'user',
          updatedAt: new Date(),
        },
      },
    );
    console.log(`Updated existing demo user (${userId})`);
  } else {
    const result = await usersCol.insertOne({
      firstName: DEMO_FIRST_NAME,
      lastName: DEMO_LAST_NAME,
      phone: DEMO_PHONE,
      email: DEMO_EMAIL,
      password: passwordHash,
      birthday: new Date(DEMO_BIRTHDAY),
      isPhoneVerified: true,
      isEmailVerified: true,
      isActive: true,
      role: 'user',
      isRider: false,
      expoPushTokens: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    userId = result.insertedId;
    console.log(`Created demo user (${userId})`);
  }

  // Find the first active pickup location
  const pickupLocation = await pickupLocationsCol.findOne({ isActive: true });
  if (!pickupLocation) {
    console.warn('WARNING: No active pickup location found. Run seed.ts first.');
  }

  console.log('\n========================================');
  console.log('Add these to surespot-backend/.env.development:');
  console.log(`DEMO_USER_ID=${userId}`);
  if (pickupLocation) {
    console.log(`DEMO_PICKUP_LOCATION_ID=${pickupLocation._id}`);
  }
  console.log('\nAdd these to surespot-app/.env:');
  console.log(`EXPO_PUBLIC_DEMO_USER_ID=${userId}`);
  if (pickupLocation) {
    console.log(`EXPO_PUBLIC_DEMO_PICKUP_LOCATION_ID=${pickupLocation._id}`);
  }
  console.log('\nDemo credentials:');
  console.log(`  Phone: ${DEMO_PHONE}`);
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log('========================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

seedDemoUser().catch((err) => {
  console.error('Demo user seed failed:', err);
  process.exit(1);
});
