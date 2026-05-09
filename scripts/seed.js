"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const mongoose_1 = __importDefault(require("mongoose"));
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
(0, dotenv_1.config)({ path: envFile });
(0, dotenv_1.config)({ path: '.env' });
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/surespot';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'surespot';
const SEED_REGION_NAME = 'Lagos Mainland Region A';
const SEED_PICKUP_NAME = 'SureSpot Eatery, Iba, Ojo';
const SEED_PICKUP_ADDRESS = '1, Iba Junction Bus Stop, Lasu Isheri Road, Lagos';
const SEED_LAT = 6.505919;
const SEED_LNG = 3.200222;
async function seed() {
    console.log('Connecting to MongoDB...');
    await mongoose_1.default.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
    const db = mongoose_1.default.connection.db;
    if (!db) {
        throw new Error('Database connection failed');
    }
    const regionsCol = db.collection('regions');
    const pickupLocationsCol = db.collection('pickuplocations');
    const existingRegion = await regionsCol.findOne({ name: SEED_REGION_NAME });
    let regionId;
    if (existingRegion) {
        console.log(`Region "${SEED_REGION_NAME}" already exists, skipping.`);
        regionId = existingRegion._id;
    }
    else {
        const regionResult = await regionsCol.insertOne({
            name: SEED_REGION_NAME,
            description: 'Mainland Lagos service area',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        regionId = regionResult.insertedId;
        console.log(`Created region: ${SEED_REGION_NAME} (${regionId})`);
    }
    const existingPickup = await pickupLocationsCol.findOne({
        name: SEED_PICKUP_NAME,
    });
    if (existingPickup) {
        console.log(`Pickup location "${SEED_PICKUP_NAME}" already exists, skipping.`);
    }
    else {
        await pickupLocationsCol.insertOne({
            name: SEED_PICKUP_NAME,
            address: SEED_PICKUP_ADDRESS,
            location: {
                type: 'Point',
                coordinates: [SEED_LNG, SEED_LAT],
            },
            regionId,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log(`Created pickup location: ${SEED_PICKUP_NAME}`);
    }
    console.log('Seed completed successfully.');
    await mongoose_1.default.disconnect();
    process.exit(0);
}
seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map