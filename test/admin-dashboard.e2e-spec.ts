import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserRole } from '../src/modules/auth/schemas/user.schema';

describe('Admin Dashboard (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let pickupAdminToken: string;
  let userToken: string;
  let pickupLocationId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();

    // Setup: Create test users and get tokens
    // Note: In a real test, you'd want to use test database and seed data
    // For this example, we're showing the structure
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/dashboard/overview', () => {
    it('should return 401 for unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .expect(401);
    });

    it('should return 403 for regular users', () => {
      // Assuming userToken is a regular USER role token
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('should return dashboard data for super admin with assigned location', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'today' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('stats');
          expect(res.body.data).toHaveProperty('profit');
          expect(res.body.data).toHaveProperty('orderTraffic');
          expect(res.body.data).toHaveProperty('orderBreakdown');
          expect(res.body.data).toHaveProperty('menuPerformance');
          expect(res.body.data).toHaveProperty('customerRatings');
        });
    });

    it('should return scoped dashboard data for pickup admin', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${pickupAdminToken}`)
        .query({ period: 'today' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toHaveProperty('stats');
          // Should be scoped to pickup admin's location
        });
    });

    it('should reject admin without assigned pickup location', () => {
      // Assuming adminTokenNoLocation is a token for admin without pickupLocationId
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'today' })
        .expect(403)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error.code).toBe('NO_PICKUP_LOCATION');
        });
    });

    it('should support different time periods', async () => {
      const periods = ['today', '7d', '30d'];

      for (const period of periods) {
        await request(app.getHttpServer())
          .get('/admin/dashboard/overview')
          .set('Authorization', `Bearer ${adminToken}`)
          .query({ period })
          .expect(200)
          .expect((res) => {
            expect(res.body.success).toBe(true);
            expect(res.body.data.stats).toBeDefined();
          });
      }
    });

    it('should support custom date ranges', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ from: '2026-02-01', to: '2026-02-10' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });

    it('should reject invalid date ranges', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ from: '2026-02-10', to: '2026-02-01' })
        .expect(400);
    });

    it('should validate date format', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ from: 'invalid-date', to: '2026-02-10' })
        .expect(400);
    });
  });

  describe('Dashboard Data Structure', () => {
    it('should return stats with all required fields', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'today' })
        .expect(200)
        .expect((res) => {
          const { stats } = res.body.data;
          expect(stats).toHaveProperty('ordersTodayCount');
          expect(stats).toHaveProperty('ordersTodayDeltaPct');
          expect(stats).toHaveProperty('revenueToday');
          expect(stats).toHaveProperty('revenueTodayDeltaPct');
          expect(stats).toHaveProperty('activeOrdersCount');
          expect(stats).toHaveProperty('activeOrdersDeltaPct');
          expect(stats).toHaveProperty('avgDeliveryTimeMinutes');
          expect(stats).toHaveProperty('avgDeliveryTimeDeltaPct');
        });
    });

    it('should return profit chart with series data', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: '7d' })
        .expect(200)
        .expect((res) => {
          const { profit } = res.body.data;
          expect(profit).toHaveProperty('totalProfit');
          expect(profit).toHaveProperty('series');
          expect(Array.isArray(profit.series)).toBe(true);
        });
    });

    it('should return order traffic with hourly buckets', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'today' })
        .expect(200)
        .expect((res) => {
          const { orderTraffic } = res.body.data;
          expect(orderTraffic).toHaveProperty('date');
          expect(orderTraffic).toHaveProperty('buckets');
          expect(Array.isArray(orderTraffic.buckets)).toBe(true);
          expect(orderTraffic.buckets.length).toBe(24); // 24 hours
        });
    });

    it('should return order breakdown by status', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'today' })
        .expect(200)
        .expect((res) => {
          const { orderBreakdown } = res.body.data;
          expect(orderBreakdown).toHaveProperty('totalOrders');
          expect(orderBreakdown).toHaveProperty('byStatus');
          expect(Array.isArray(orderBreakdown.byStatus)).toBe(true);
        });
    });

    it('should return menu performance with best and worst performers', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: '7d' })
        .expect(200)
        .expect((res) => {
          const { menuPerformance } = res.body.data;
          expect(menuPerformance).toHaveProperty('bestPerformers');
          expect(menuPerformance).toHaveProperty('worstPerformers');
          expect(Array.isArray(menuPerformance.bestPerformers)).toBe(true);
          expect(Array.isArray(menuPerformance.worstPerformers)).toBe(true);
        });
    });

    it('should return customer ratings array', () => {
      return request(app.getHttpServer())
        .get('/admin/dashboard/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'today' })
        .expect(200)
        .expect((res) => {
          const { customerRatings } = res.body.data;
          expect(customerRatings).toHaveProperty('reviews');
          expect(Array.isArray(customerRatings.reviews)).toBe(true);
        });
    });
  });
});
