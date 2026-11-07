/**
 * Seeds LOCAL DEV data for testing post-delivery reviews and special rewards:
 *  - a test admin and a test customer (log in with the credentials below)
 *  - three delivered orders for the customer (1h, 20h and 5 days ago), so the
 *    app shows a review prompt for the two recent ones, and the 5-day-old one
 *    can still be reviewed from order history
 *  - a "REVIEW5" special reward campaign (5% off, accumulating, admin approval)
 *
 * Needs food items to exist first (run `npm run seed` if the menu is empty).
 * Safe to re-run: it resets the customer's reviews/rewards and recreates the
 * seed orders, so the whole flow can be tested again from the start.
 *
 *   npm run seed:review-rewards
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const envFile =
  process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
config({ path: envFile });
config({ path: '.env' });

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed test data with NODE_ENV=production');
}

const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/surespot';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'surespot';

// Test accounts for local development only: change them if you like.
const ADMIN = {
  firstName: 'Review',
  lastName: 'Admin',
  phone: '+2348000000101',
  email: 'review-admin@surespot.test',
  password: 'TestPass123!',
};
const CUSTOMER = {
  firstName: 'Review',
  lastName: 'Customer',
  phone: '+2348000000102',
  email: 'review-customer@surespot.test',
  password: 'TestPass123!',
};
const CAMPAIGN_CODE = 'REVIEW5';
const ORDER_PREFIX = 'SEED-RV-';
const HOUR = 3600_000;

type Id = mongoose.Types.ObjectId;

async function upsertUser(
  usersCol: mongoose.mongo.Collection,
  u: typeof ADMIN,
  role: 'admin' | 'user',
): Promise<Id> {
  const password = await bcrypt.hash(u.password, 10);
  const now = new Date();
  const fields = {
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    password,
    isPhoneVerified: true,
    isEmailVerified: true,
    isActive: true,
    isOnboarded: true,
    isDemo: false, // demo accounts never see review prompts
    role,
    updatedAt: now,
  };
  const existing = await usersCol.findOne({ phone: u.phone });
  if (existing) {
    await usersCol.updateOne({ _id: existing._id }, { $set: fields });
    return existing._id as Id;
  }
  const res = await usersCol.insertOne({
    ...fields,
    phone: u.phone,
    isRider: false,
    pushTokens: [],
    createdAt: now,
  });
  return res.insertedId as Id;
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database connection failed');

  const users = db.collection('users');
  const foodItems = db.collection('fooditems');
  const orders = db.collection('orders');
  const orderItems = db.collection('orderitems');
  const reviews = db.collection('reviews');
  const orderReviews = db.collection('orderreviews');
  const prompts = db.collection('reviewprompts');
  const grants = db.collection('rewardgrants');
  const campaigns = db.collection('rewardcampaigns');

  const foods = await foodItems.find({ isActive: true }).limit(4).toArray();
  if (foods.length < 2) {
    throw new Error('Need at least 2 active food items. Run `npm run seed` first.');
  }

  const adminId = await upsertUser(users, ADMIN, 'admin');
  const customerId = await upsertUser(users, CUSTOMER, 'user');

  // ---- Reset the customer's review state so the flow can be re-tested ----
  const touchedFoodIds = (
    await reviews.find({ userId: customerId }).project({ foodItemId: 1 }).toArray()
  ).map((r) => r.foodItemId as Id);
  const oldOrders = await orders
    .find({ orderNumber: { $regex: `^${ORDER_PREFIX}` } })
    .project({ _id: 1 })
    .toArray();
  const oldOrderIds = oldOrders.map((o) => o._id);
  await Promise.all([
    reviews.deleteMany({ userId: customerId }),
    orderReviews.deleteMany({ userId: customerId }),
    prompts.deleteMany({ userId: customerId }),
    grants.deleteMany({ userId: customerId }),
    orderItems.deleteMany({ orderId: { $in: oldOrderIds } }),
    orders.deleteMany({ _id: { $in: oldOrderIds } }),
  ]);
  for (const foodItemId of touchedFoodIds) {
    const [stats] = await reviews
      .aggregate<{ avg: number; n: number }>([
        { $match: { foodItemId, moderationStatus: { $ne: 'hidden' } } },
        { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
      ])
      .toArray();
    await foodItems.updateOne(
      { _id: foodItemId },
      {
        $set: {
          averageRating: stats ? Math.round(stats.avg * 10) / 10 : 0,
          ratingCount: stats ? stats.n : 0,
        },
      },
    );
  }

  // ---- Delivered orders ----
  const pickup = await db.collection('pickuplocations').findOne({ isActive: true });
  const pick = (i: number) => foods[i % foods.length];
  const plan: Array<{ hoursAgo: number; items: (typeof foods)[number][] }> = [
    { hoursAgo: 1, items: [pick(0), pick(1)] },
    { hoursAgo: 20, items: [pick(2), pick(3)] },
    { hoursAgo: 5 * 24, items: [pick(1)] },
  ];
  for (const [i, o] of plan.entries()) {
    const deliveredAt = new Date(Date.now() - o.hoursAgo * HOUR);
    const createdAt = new Date(deliveredAt.getTime() - HOUR);
    const subtotal = o.items.reduce((s, f) => s + (f.price as number), 0);
    const order = await orders.insertOne({
      orderNumber: `${ORDER_PREFIX}${i + 1}`,
      userId: customerId,
      status: 'delivered',
      deliveryType: 'pickup',
      subtotal,
      extrasTotal: 0,
      deliveryFee: 0,
      packagingFee: 0,
      discountAmount: 0,
      total: subtotal,
      itemCount: o.items.length,
      extrasCount: 0,
      paymentStatus: 'paid',
      paymentMethod: 'card',
      ...(pickup ? { pickupLocationId: pickup._id } : {}),
      deliveredAt,
      createdAt,
      updatedAt: deliveredAt,
    });
    for (const f of o.items) {
      await orderItems.insertOne({
        orderId: order.insertedId,
        foodItemId: f._id,
        name: f.name,
        description: f.description,
        slug: f.slug,
        price: f.price,
        currency: f.currency ?? 'NGN',
        imageUrl: f.imageUrl,
        quantity: 1,
        estimatedTime: f.estimatedTime,
        lineTotal: f.price,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  // ---- Reward campaign ----
  const now = new Date();
  const earnFrom = new Date(now.getTime() - 24 * HOUR);
  const earnTo = new Date(now.getTime() + 30 * 24 * HOUR);
  const clash = await campaigns.findOne({
    trigger: 'review',
    status: 'active',
    code: { $ne: CAMPAIGN_CODE },
    earnFrom: { $lt: earnTo },
    earnTo: { $gt: earnFrom },
  });
  if (clash) {
    console.warn(
      `WARNING: another active review campaign (${clash.code}) overlaps, so ${CAMPAIGN_CODE} was not created. Disable that one or use it for testing.`,
    );
  } else {
    await campaigns.updateOne(
      { code: CAMPAIGN_CODE },
      {
        $set: {
          name: 'Review & save 5%',
          description: 'Review a meal you ordered and get 5% off your next order.',
          trigger: 'review',
          status: 'active',
          earnFrom,
          earnTo,
          validityDays: 30,
          requiresApproval: true,
          accumulation: { enabled: true },
          discountType: 'percentage',
          discountValue: 5,
          updatedAt: now,
        },
        $setOnInsert: { createdBy: adminId, createdAt: now },
      },
      { upsert: true },
    );
  }

  console.log('\n========================================');
  console.log('Review & rewards test data is ready.');
  console.log('\nCustomer (the app):');
  console.log(`  Phone:    ${CUSTOMER.phone}`);
  console.log(`  Email:    ${CUSTOMER.email}`);
  console.log(`  Password: ${CUSTOMER.password}`);
  console.log('\nAdmin (the dashboard):');
  console.log(`  Email:    ${ADMIN.email}`);
  console.log(`  Password: ${ADMIN.password}`);
  console.log(`\nCampaign: ${CAMPAIGN_CODE} (5% off, earn window open for 30 days)`);
  console.log(
    `Orders: ${ORDER_PREFIX}1 (1h ago) and ${ORDER_PREFIX}2 (20h ago) show the prompt, newest first;`,
  );
  console.log(`        ${ORDER_PREFIX}3 (5 days ago) is reviewable from order history.`);
  console.log('Re-run this script any time to reset and test again.');
  console.log('========================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Review/rewards seed failed:', err);
  process.exit(1);
});
