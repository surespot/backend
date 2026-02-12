import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { OrdersRepository } from '../src/modules/orders/orders.repository';
import { AuthRepository } from '../src/modules/auth/auth.repository';
import { PickupLocationsRepository } from '../src/modules/pickup-locations/pickup-locations.repository';
import { RidersRepository } from '../src/modules/riders/riders.repository';
import { UserRole } from '../src/modules/auth/schemas/user.schema';
import {
  OrderStatus,
  DeliveryType,
  PaymentStatus,
} from '../src/modules/orders/schemas/order.schema';
import { Types } from 'mongoose';

describe('Admin Orders (e2e)', () => {
  let app: INestApplication;
  let ordersRepository: OrdersRepository;
  let authRepository: AuthRepository;
  let pickupLocationsRepository: PickupLocationsRepository;
  let ridersRepository: RidersRepository;

  let pickupAdminUser: any;
  let pickupAdminToken: string;
  let superAdminUser: any;
  let superAdminToken: string;
  let pickupLocation: any;
  let customerUser: any;
  let testOrder: any;
  let riderProfile: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    ordersRepository = moduleFixture.get<OrdersRepository>(OrdersRepository);
    authRepository = moduleFixture.get<AuthRepository>(AuthRepository);
    pickupLocationsRepository =
      moduleFixture.get<PickupLocationsRepository>(PickupLocationsRepository);
    ridersRepository = moduleFixture.get<RidersRepository>(RidersRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Setup', () => {
    it('should create test pickup location', async () => {
      pickupLocation = await pickupLocationsRepository.create({
        name: 'Test Pickup Location',
        address: '123 Test Street',
        location: {
          type: 'Point',
          coordinates: [3.3792, 6.5244],
        },
        regionId: new Types.ObjectId(),
        isActive: true,
      });

      expect(pickupLocation).toBeDefined();
      expect(pickupLocation._id).toBeDefined();
    });

    it('should create pickup admin user', async () => {
      pickupAdminUser = await authRepository.createUser({
        firstName: 'Pickup',
        lastName: 'Admin',
        email: 'pickupadmin@test.com',
        phone: '+2348012345678',
        password: 'hashedpassword',
        role: UserRole.PICKUP_ADMIN,
        pickupLocationId: pickupLocation._id,
        isEmailVerified: true,
        isActive: true,
      });

      expect(pickupAdminUser).toBeDefined();
      expect(pickupAdminUser.pickupLocationId).toEqual(pickupLocation._id);

      // Get token
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          identifier: 'pickupadmin@test.com',
          password: 'hashedpassword',
        });

      if (loginRes.body.success) {
        pickupAdminToken = loginRes.body.data.accessToken;
      }
    });

    it('should create super admin user', async () => {
      superAdminUser = await authRepository.createUser({
        firstName: 'Super',
        lastName: 'Admin',
        email: 'superadmin@test.com',
        phone: '+2348087654321',
        password: 'hashedpassword',
        role: UserRole.ADMIN,
        pickupLocationId: pickupLocation._id,
        isEmailVerified: true,
        isActive: true,
      });

      expect(superAdminUser).toBeDefined();

      // Get token
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          identifier: 'superadmin@test.com',
          password: 'hashedpassword',
        });

      if (loginRes.body.success) {
        superAdminToken = loginRes.body.data.accessToken;
      }
    });

    it('should create customer user', async () => {
      customerUser = await authRepository.createUser({
        firstName: 'Test',
        lastName: 'Customer',
        email: 'customer@test.com',
        phone: '+2348011111111',
        password: 'hashedpassword',
        role: UserRole.USER,
        isEmailVerified: true,
        isActive: true,
      });

      expect(customerUser).toBeDefined();
    });

    it('should create rider profile', async () => {
      const riderUser = await authRepository.createUser({
        firstName: 'Test',
        lastName: 'Rider',
        email: 'rider@test.com',
        phone: '+2348022222222',
        password: 'hashedpassword',
        role: UserRole.RIDER,
        isEmailVerified: true,
        isActive: true,
      });

      riderProfile = await ridersRepository.createProfile({
        firstName: 'Test',
        lastName: 'Rider',
        phone: '+2348022222222',
        regionId: pickupLocation.regionId,
        registrationCode: 'TEST-RIDER-001',
      });

      await ridersRepository.updateProfile(riderProfile._id, {
        userId: riderUser._id,
      });

      expect(riderProfile).toBeDefined();
    });

    it('should create test order', async () => {
      testOrder = await ordersRepository.createOrder({
        orderNumber: 'ORD-TEST-001',
        userId: customerUser._id.toString(),
        deliveryType: DeliveryType.DOOR_DELIVERY,
        subtotal: 500000,
        extrasTotal: 50000,
        deliveryFee: 100000,
        discountAmount: 0,
        total: 650000,
        itemCount: 2,
        extrasCount: 1,
        deliveryAddress: {
          address: '456 Customer Street',
          coordinates: { latitude: 6.5244, longitude: 3.3792 },
        },
        pickupLocationId: pickupLocation._id.toString(),
        estimatedDeliveryTime: new Date(Date.now() + 60 * 60 * 1000),
        paymentMethod: 'card',
      });

      // Mark as paid
      await ordersRepository.updateOrder(testOrder._id.toString(), {
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.CONFIRMED,
      });

      // Add order items
      await ordersRepository.createOrderItem({
        orderId: testOrder._id.toString(),
        foodItemId: new Types.ObjectId().toString(),
        name: 'Jollof Rice',
        description: 'Tasty jollof rice',
        price: 250000,
        quantity: 2,
        imageUrl: 'https://example.com/jollof.jpg',
      });

      expect(testOrder).toBeDefined();
    });
  });

  describe('GET /admin/orders', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/admin/orders');

      expect(res.status).toBe(401);
    });

    it('should return 403 for user without pickup location', async () => {
      const userWithoutLocation = await authRepository.createUser({
        firstName: 'No',
        lastName: 'Location',
        email: 'nolocation@test.com',
        phone: '+2348033333333',
        password: 'hashedpassword',
        role: UserRole.ADMIN,
        isEmailVerified: true,
        isActive: true,
      });

      // Get token
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          identifier: 'nolocation@test.com',
          password: 'hashedpassword',
        });

      const token = loginRes.body.data?.accessToken;

      const res = await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NO_PICKUP_LOCATION');
    });

    it('should return orders for pickup admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${pickupAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);

      const order = res.body.data.items[0];
      expect(order.id).toBeDefined();
      expect(order.orderNo).toBeDefined();
      expect(order.customerName).toBeDefined();
      expect(order.type).toBeDefined();
      expect(order.status).toBeDefined();
      expect(order.amount).toBeDefined();
    });

    it('should filter orders by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/orders?status=confirmed')
        .set('Authorization', `Bearer ${pickupAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();
    });

    it('should filter orders by date range', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app.getHttpServer())
        .get(`/admin/orders?from=${today}&to=${today}`)
        .set('Authorization', `Bearer ${pickupAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/orders?page=1&limit=10')
        .set('Authorization', `Bearer ${pickupAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(10);
    });
  });

  describe('GET /admin/orders/:orderId', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app.getHttpServer()).get(
        `/admin/orders/${testOrder._id.toString()}`,
      );

      expect(res.status).toBe(401);
    });

    it('should return order details for pickup admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/admin/orders/${testOrder._id.toString()}`)
        .set('Authorization', `Bearer ${pickupAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(testOrder._id.toString());
      expect(res.body.data.orderNo).toBeDefined();
      expect(res.body.data.customerName).toBeDefined();
      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.subtotal).toBeDefined();
      expect(res.body.data.total).toBeDefined();
    });

    it('should return 404 for order from different pickup location', async () => {
      // Create another pickup location
      const otherLocation = await pickupLocationsRepository.create({
        name: 'Other Pickup Location',
        address: '789 Other Street',
        location: {
          type: 'Point',
          coordinates: [3.3792, 6.5244],
        },
        regionId: new Types.ObjectId(),
        isActive: true,
      });

      // Create order for other location
      const otherOrder = await ordersRepository.createOrder({
        orderNumber: 'ORD-TEST-002',
        userId: customerUser._id.toString(),
        deliveryType: DeliveryType.DOOR_DELIVERY,
        subtotal: 300000,
        extrasTotal: 0,
        deliveryFee: 100000,
        discountAmount: 0,
        total: 400000,
        itemCount: 1,
        extrasCount: 0,
        pickupLocationId: otherLocation._id.toString(),
      });

      const res = await request(app.getHttpServer())
        .get(`/admin/orders/${otherOrder._id.toString()}`)
        .set('Authorization', `Bearer ${pickupAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('PATCH /admin/orders/:orderId/status', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${testOrder._id.toString()}/status`)
        .send({ status: 'Preparing' });

      expect(res.status).toBe(401);
    });

    it('should update order status to Preparing', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${testOrder._id.toString()}/status`)
        .set('Authorization', `Bearer ${pickupAdminToken}`)
        .send({ status: 'Preparing' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Preparing');
    });

    it('should update order status to Ready', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${testOrder._id.toString()}/status`)
        .set('Authorization', `Bearer ${pickupAdminToken}`)
        .send({ status: 'Ready' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Ready');
    });

    it('should update order status to PickedUp after assigning rider', async () => {
      // Assign rider first
      await ordersRepository.assignRiderToOrder(
        testOrder._id.toString(),
        riderProfile._id.toString(),
        superAdminUser._id.toString(),
      );

      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${testOrder._id.toString()}/status`)
        .set('Authorization', `Bearer ${pickupAdminToken}`)
        .send({ status: 'PickedUp' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Picked Up');
      expect(res.body.data.assignedRiderId).toBeDefined();
    });

    it('should reject invalid status transitions', async () => {
      // Try to mark as delivered without being out for delivery
      const newOrder = await ordersRepository.createOrder({
        orderNumber: 'ORD-TEST-003',
        userId: customerUser._id.toString(),
        deliveryType: DeliveryType.DOOR_DELIVERY,
        subtotal: 200000,
        extrasTotal: 0,
        deliveryFee: 100000,
        discountAmount: 0,
        total: 300000,
        itemCount: 1,
        extrasCount: 0,
        pickupLocationId: pickupLocation._id.toString(),
      });

      await ordersRepository.updateOrder(newOrder._id.toString(), {
        paymentStatus: PaymentStatus.PAID,
        status: OrderStatus.CONFIRMED,
      });

      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${newOrder._id.toString()}/status`)
        .set('Authorization', `Bearer ${pickupAdminToken}`)
        .send({ status: 'Delivered' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should require reason for cancellation', async () => {
      const newOrder = await ordersRepository.createOrder({
        orderNumber: 'ORD-TEST-004',
        userId: customerUser._id.toString(),
        deliveryType: DeliveryType.DOOR_DELIVERY,
        subtotal: 200000,
        extrasTotal: 0,
        deliveryFee: 100000,
        discountAmount: 0,
        total: 300000,
        itemCount: 1,
        extrasCount: 0,
        pickupLocationId: pickupLocation._id.toString(),
      });

      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${newOrder._id.toString()}/status`)
        .set('Authorization', `Bearer ${pickupAdminToken}`)
        .send({ status: 'Cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('REASON_REQUIRED');
    });

    it('should cancel order with reason', async () => {
      const newOrder = await ordersRepository.createOrder({
        orderNumber: 'ORD-TEST-005',
        userId: customerUser._id.toString(),
        deliveryType: DeliveryType.DOOR_DELIVERY,
        subtotal: 200000,
        extrasTotal: 0,
        deliveryFee: 100000,
        discountAmount: 0,
        total: 300000,
        itemCount: 1,
        extrasCount: 0,
        pickupLocationId: pickupLocation._id.toString(),
      });

      const res = await request(app.getHttpServer())
        .patch(`/admin/orders/${newOrder._id.toString()}/status`)
        .set('Authorization', `Bearer ${pickupAdminToken}`)
        .send({
          status: 'Cancelled',
          reason: 'Customer requested cancellation',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cancelled');
    });
  });

  describe('Scoping', () => {
    it('should only return orders for admin\'s pickup location', async () => {
      // Create another pickup location and admin
      const otherLocation = await pickupLocationsRepository.create({
        name: 'Other Pickup Location',
        address: '999 Other Street',
        location: {
          type: 'Point',
          coordinates: [3.3792, 6.5244],
        },
        regionId: new Types.ObjectId(),
        isActive: true,
      });

      const otherAdmin = await authRepository.createUser({
        firstName: 'Other',
        lastName: 'Admin',
        email: 'otheradmin@test.com',
        phone: '+2348044444444',
        password: 'hashedpassword',
        role: UserRole.PICKUP_ADMIN,
        pickupLocationId: otherLocation._id,
        isEmailVerified: true,
        isActive: true,
      });

      // Get token for other admin
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          identifier: 'otheradmin@test.com',
          password: 'hashedpassword',
        });

      const otherToken = loginRes.body.data.accessToken;

      // Get orders - should not include orders from first location
      const res = await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Should not contain test order from first location
      const orderIds = res.body.data.items.map((o: any) => o.id);
      expect(orderIds).not.toContain(testOrder._id.toString());
    });
  });
});
