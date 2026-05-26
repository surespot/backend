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

// Demo rider credentials
const DEMO_RIDER_PHONE = '+2348000000002';
const DEMO_RIDER_EMAIL = 'demo-rider@surespot.app';
const DEMO_RIDER_PASSWORD = 'DemoRiderPass123!';
const DEMO_RIDER_FIRST_NAME = 'Demo';
const DEMO_RIDER_LAST_NAME = 'Rider';

// Demo customer (anchors demo orders — never logs in)
const DEMO_CUSTOMER_PHONE = '+2348000000003';
const DEMO_CUSTOMER_EMAIL = 'demo-customer@surespot.app';

async function seedDemoRider() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  const usersCol = db.collection('users');
  const riderProfilesCol = db.collection('riderprofiles');
  const regionsCol = db.collection('regions');
  const pickupLocationsCol = db.collection('pickuplocations');

  // Clear isDemo from all existing rider profiles (one demo rider at a time)
  const clearedProfiles = await riderProfilesCol.updateMany(
    { isDemo: true },
    { $set: { isDemo: false } },
  );
  if (clearedProfiles.modifiedCount > 0) {
    console.log(`Cleared isDemo from ${clearedProfiles.modifiedCount} existing rider profile(s)`);
  }

  // Clear isDemo from any existing users that don't match our canonical demo phones.
  // This catches anonymized leftovers from previous seed runs whose phone/email
  // were nulled by the deletion-anonymize cron — without them, findDemoCustomerUser()
  // could return the wrong (anonymized) record.
  const clearedUsers = await usersCol.updateMany(
    {
      isDemo: true,
      phone: { $nin: [DEMO_RIDER_PHONE, DEMO_CUSTOMER_PHONE] },
    },
    { $set: { isDemo: false } },
  );
  if (clearedUsers.modifiedCount > 0) {
    console.log(`Cleared isDemo from ${clearedUsers.modifiedCount} stale user record(s)`);
  }

  // Find the first active region
  const region = await regionsCol.findOne({ isActive: true });
  if (!region) {
    throw new Error('No active region found. Create a region first.');
  }
  console.log(`Using region: ${region.name ?? region._id}`);

  // Find the first active pickup location (for scheduler coordinate reference)
  const pickupLocation = await pickupLocationsCol.findOne({ isActive: true });

  // ── Demo rider user ──────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_RIDER_PASSWORD, 10);
  const existingRiderUser = await usersCol.findOne({ phone: DEMO_RIDER_PHONE });

  let riderUserId: mongoose.Types.ObjectId;
  if (existingRiderUser) {
    riderUserId = existingRiderUser._id as mongoose.Types.ObjectId;
    await usersCol.updateOne(
      { _id: riderUserId },
      {
        $set: {
          firstName: DEMO_RIDER_FIRST_NAME,
          lastName: DEMO_RIDER_LAST_NAME,
          email: DEMO_RIDER_EMAIL,
          password: passwordHash,
          isPhoneVerified: true,
          isEmailVerified: true,
          isActive: true,
          isOnboarded: true,
          role: 'rider',
          isRider: true,
          isDemo: true,
          deletedAt: null,
          anonymizedAt: null,
          updatedAt: new Date(),
        },
      },
    );
    console.log(`Updated existing demo rider user (${riderUserId})`);
  } else {
    const result = await usersCol.insertOne({
      firstName: DEMO_RIDER_FIRST_NAME,
      lastName: DEMO_RIDER_LAST_NAME,
      phone: DEMO_RIDER_PHONE,
      email: DEMO_RIDER_EMAIL,
      password: passwordHash,
      isPhoneVerified: true,
      isEmailVerified: true,
      isActive: true,
      isOnboarded: true,
      role: 'rider',
      isRider: true,
      isDemo: true,
      expoPushTokens: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    riderUserId = result.insertedId;
    console.log(`Created demo rider user (${riderUserId})`);
  }

  // ── Demo rider profile ───────────────────────────────────────────────────
  const existingProfile = await riderProfilesCol.findOne({ userId: riderUserId });
  if (existingProfile) {
    await riderProfilesCol.updateOne(
      { _id: existingProfile._id },
      {
        $set: {
          firstName: DEMO_RIDER_FIRST_NAME,
          lastName: DEMO_RIDER_LAST_NAME,
          phone: DEMO_RIDER_PHONE,
          email: DEMO_RIDER_EMAIL,
          status: 'active',
          isDemo: true,
          rating: 4.8,
          schedule: [1, 2, 3, 4, 5, 6],
          regionId: region._id,
          updatedAt: new Date(),
        },
      },
    );
    console.log(`Updated existing demo rider profile (${existingProfile._id})`);
  } else {
    const profileResult = await riderProfilesCol.insertOne({
      userId: riderUserId,
      firstName: DEMO_RIDER_FIRST_NAME,
      lastName: DEMO_RIDER_LAST_NAME,
      phone: DEMO_RIDER_PHONE,
      email: DEMO_RIDER_EMAIL,
      registrationCode: '0000000000000000',
      status: 'active',
      isDemo: true,
      rating: 4.8,
      schedule: [1, 2, 3, 4, 5, 6],
      regionId: region._id,
      totalDistanceToday: 0,
      totalOnlineTimeToday: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created demo rider profile (${profileResult.insertedId})`);
  }

  // ── Demo customer user (anchors demo orders) ─────────────────────────────
  const existingCustomer = await usersCol.findOne({ phone: DEMO_CUSTOMER_PHONE });
  let customerUserId: mongoose.Types.ObjectId;
  if (existingCustomer) {
    customerUserId = existingCustomer._id as mongoose.Types.ObjectId;
    await usersCol.updateOne(
      { _id: customerUserId },
      {
        $set: {
          firstName: 'Demo',
          lastName: 'Customer',
          email: DEMO_CUSTOMER_EMAIL,
          isPhoneVerified: true,
          isEmailVerified: true,
          isActive: true,
          isOnboarded: true,
          role: 'user',
          isRider: false,
          isDemo: true,
          deletedAt: null,
          anonymizedAt: null,
          updatedAt: new Date(),
        },
      },
    );
    console.log(`Updated existing demo customer user (${customerUserId})`);
  } else {
    const result = await usersCol.insertOne({
      firstName: 'Demo',
      lastName: 'Customer',
      phone: DEMO_CUSTOMER_PHONE,
      email: DEMO_CUSTOMER_EMAIL,
      isPhoneVerified: true,
      isEmailVerified: true,
      isActive: true,
      isOnboarded: true,
      role: 'user',
      isRider: false,
      isDemo: true,
      expoPushTokens: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    customerUserId = result.insertedId;
    console.log(`Created demo customer user (${customerUserId})`);
  }

  // ── Seed initial demo orders ─────────────────────────────────────────────
  const ordersCol = db.collection('orders');
  const existingDemoOrders = await ordersCol.countDocuments({
    userId: customerUserId,
    status: 'ready',
    paymentStatus: 'paid',
  });

  const DEMO_ORDER_TARGET = 3;
  const needed = DEMO_ORDER_TARGET - existingDemoOrders;

  if (needed > 0 && pickupLocation) {
    const pickupLng = (pickupLocation.location as any).coordinates[0];
    const pickupLat = (pickupLocation.location as any).coordinates[1];

    for (let i = 0; i < needed; i++) {
      const orderNumber = `SS-DEMO-${Date.now()}-${i}`;
      const distanceKm = 1.5 + Math.random() * 3.5;
      const angle = Math.random() * 2 * Math.PI;
      const latOffset = (Math.sin(angle) * distanceKm) / 111;
      const lngOffset = (Math.cos(angle) * distanceKm) / (111 * Math.cos((pickupLat * Math.PI) / 180));
      const deliveryCoords = { latitude: pickupLat + latOffset, longitude: pickupLng + lngOffset };

      const deliveryFeeKobo = Math.round((300000 + Math.random() * 170000) / 1000) * 1000;
      const subtotalKobo = deliveryFeeKobo * 3;
      const totalKobo = subtotalKobo + deliveryFeeKobo;

      const streets = [
        '14 Admiralty Way, Lekki Phase 1',
        '7 Ozumba Mbadiwe Ave, Victoria Island',
        '22 Bode Thomas Street, Surulere',
        '5 Allen Avenue, Ikeja',
        '31 Akin Adesola Street, Victoria Island',
      ];
      const address = streets[Math.floor(Math.random() * streets.length)];

      await ordersCol.insertOne({
        orderNumber,
        userId: customerUserId,
        deliveryType: 'door_delivery',
        status: 'ready',
        paymentStatus: 'paid',
        paymentMethod: 'demo',
        subtotal: subtotalKobo,
        extrasTotal: 0,
        deliveryFee: deliveryFeeKobo,
        discountAmount: 0,
        total: totalKobo,
        itemCount: 1,
        extrasCount: 0,
        pickupLocationId: pickupLocation._id,
        deliveryAddress: {
          address,
          coordinates: deliveryCoords,
          contactPhone: DEMO_CUSTOMER_PHONE,
        },
        deliveryConfirmationCode: '1234',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Created demo order ${orderNumber}`);
    }
  } else if (needed <= 0) {
    console.log(`Demo orders already at target (${existingDemoOrders} existing)`);
  } else {
    console.log('No active pickup location — skipping demo order creation');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n========================================');
  if (pickupLocation) {
    console.log('Optional: pin a specific pickup location for demo orders:');
    console.log(`  DEMO_PICKUP_LOCATION_ID=${pickupLocation._id}`);
    console.log('  (omit to use first active pickup location automatically)');
  }
  console.log('\nDemo rider credentials (for surespot-delivery app):');
  console.log(`  Email:    ${DEMO_RIDER_EMAIL}`);
  console.log(`  Password: ${DEMO_RIDER_PASSWORD}`);
  console.log('========================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

seedDemoRider().catch((err) => {
  console.error('Demo rider seed failed:', err);
  process.exit(1);
});
