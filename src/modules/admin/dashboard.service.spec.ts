import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { OrdersRepository } from '../orders/orders.repository';
import { FoodItemsRepository } from '../food-items/food-items.repository';
import { Types } from 'mongoose';

describe('DashboardService', () => {
  let service: DashboardService;
  let ordersRepository: jest.Mocked<OrdersRepository>;
  let foodItemsRepository: jest.Mocked<FoodItemsRepository>;

  const mockPickupLocationId = new Types.ObjectId();
  const mockDateRange = {
    start: new Date('2026-02-01'),
    end: new Date('2026-02-10'),
  };
  const mockPreviousDateRange = {
    start: new Date('2026-01-22'),
    end: new Date('2026-01-31'),
  };

  beforeEach(async () => {
    const mockOrdersRepository = {
      getOrderStats: jest.fn(),
      getActiveOrdersCount: jest.fn(),
      getDailyRevenue: jest.fn(),
      getHourlyOrderCounts: jest.fn(),
      getOrderStatusBreakdown: jest.fn(),
      getMenuItemPerformance: jest.fn(),
    };

    const mockFoodItemsRepository = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: OrdersRepository,
          useValue: mockOrdersRepository,
        },
        {
          provide: FoodItemsRepository,
          useValue: mockFoodItemsRepository,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    ordersRepository = module.get(OrdersRepository);
    foodItemsRepository = module.get(FoodItemsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should return stats with correct delta calculations', async () => {
      const currentStats = { count: 100, revenue: 500000, avgDeliveryTime: 30 };
      const previousStats = { count: 80, revenue: 400000, avgDeliveryTime: 40 };
      const activeOrders = 15;

      ordersRepository.getOrderStats
        .mockResolvedValueOnce(currentStats)
        .mockResolvedValueOnce(previousStats);
      ordersRepository.getActiveOrdersCount.mockResolvedValue(activeOrders);

      const result = await service.getStats(
        mockPickupLocationId,
        mockDateRange,
        mockPreviousDateRange,
      );

      expect(result).toEqual({
        ordersTodayCount: 100,
        ordersTodayDeltaPct: 25, // (100-80)/80 * 100 = 25%
        revenueToday: 500000,
        revenueTodayDeltaPct: 25, // (500k-400k)/400k * 100 = 25%
        activeOrdersCount: 15,
        activeOrdersDeltaPct: 0,
        avgDeliveryTimeMinutes: 30,
        avgDeliveryTimeDeltaPct: 25, // Inverted: (30-40)/40 * -100 = 25%
      });

      expect(ordersRepository.getOrderStats).toHaveBeenCalledWith(
        mockPickupLocationId,
        mockDateRange.start,
        mockDateRange.end,
      );
      expect(ordersRepository.getOrderStats).toHaveBeenCalledWith(
        mockPickupLocationId,
        mockPreviousDateRange.start,
        mockPreviousDateRange.end,
      );
    });

    it('should handle zero previous stats correctly', async () => {
      const currentStats = { count: 10, revenue: 50000, avgDeliveryTime: 30 };
      const previousStats = { count: 0, revenue: 0, avgDeliveryTime: 0 };

      ordersRepository.getOrderStats
        .mockResolvedValueOnce(currentStats)
        .mockResolvedValueOnce(previousStats);
      ordersRepository.getActiveOrdersCount.mockResolvedValue(5);

      const result = await service.getStats(
        mockPickupLocationId,
        mockDateRange,
        mockPreviousDateRange,
      );

      expect(result.ordersTodayDeltaPct).toBe(100); // 100% increase from 0
      expect(result.revenueTodayDeltaPct).toBe(100);
    });
  });

  describe('getProfit', () => {
    it('should aggregate daily revenue into profit series', async () => {
      const dailyRevenue = [
        { date: '2026-02-01', revenue: 100000 },
        { date: '2026-02-02', revenue: 120000 },
        { date: '2026-02-03', revenue: 80000 },
      ];

      ordersRepository.getDailyRevenue.mockResolvedValue(dailyRevenue);

      const result = await service.getProfit(
        mockPickupLocationId,
        mockDateRange,
      );

      expect(result.totalProfit).toBe(300000);
      expect(result.series).toHaveLength(3);
      expect(result.series[0]).toEqual({
        label: expect.any(String),
        profit: 100000,
      });
    });
  });

  describe('getOrderTraffic', () => {
    it('should return hourly order counts for a day', async () => {
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: i === 12 ? 10 : 2, // Peak at noon
      }));

      ordersRepository.getHourlyOrderCounts.mockResolvedValue(hourlyData);

      const result = await service.getOrderTraffic(
        mockPickupLocationId,
        mockDateRange,
      );

      expect(result.date).toBe('2026-02-10');
      expect(result.buckets).toHaveLength(24);
      expect(result.buckets[12]).toEqual({
        timeLabel: '12PM',
        ordersCount: 10,
      });
      expect(result.buckets[0]).toEqual({
        timeLabel: '12AM',
        ordersCount: 2,
      });
    });
  });

  describe('getOrderBreakdown', () => {
    it('should return order counts by status', async () => {
      const breakdown = [
        { status: 'delivered', count: 50 },
        { status: 'pending', count: 20 },
        { status: 'cancelled', count: 5 },
      ];

      ordersRepository.getOrderStatusBreakdown.mockResolvedValue(breakdown);

      const result = await service.getOrderBreakdown(
        mockPickupLocationId,
        mockDateRange,
      );

      expect(result.totalOrders).toBe(75);
      expect(result.byStatus).toEqual(breakdown);
    });
  });

  describe('getMenuPerformance', () => {
    it('should return best and worst performers with delta calculations', async () => {
      const currentPerformance = [
        {
          foodItemId: new Types.ObjectId(),
          name: 'Jollof Rice',
          imageUrl: 'url1',
          orderCount: 100,
        },
        {
          foodItemId: new Types.ObjectId(),
          name: 'Fried Rice',
          imageUrl: 'url2',
          orderCount: 80,
        },
        {
          foodItemId: new Types.ObjectId(),
          name: 'Beans',
          imageUrl: 'url3',
          orderCount: 20,
        },
      ];

      const previousPerformance = [
        { ...currentPerformance[0], orderCount: 50 }, // +100% increase
        { ...currentPerformance[1], orderCount: 80 }, // 0% change
        { ...currentPerformance[2], orderCount: 40 }, // -50% decrease
      ];

      ordersRepository.getMenuItemPerformance
        .mockResolvedValueOnce(currentPerformance)
        .mockResolvedValueOnce(previousPerformance);

      const result = await service.getMenuPerformance(
        mockPickupLocationId,
        mockDateRange,
        mockPreviousDateRange,
      );

      expect(result.bestPerformers).toHaveLength(3);
      expect(result.worstPerformers).toHaveLength(3);
      expect(result.bestPerformers[0].name).toBe('Jollof Rice');
      expect(result.bestPerformers[0].deltaPct).toBe(100);
      expect(result.worstPerformers[0].name).toBe('Beans');
      expect(result.worstPerformers[0].deltaPct).toBe(-50);
    });
  });

  describe('getCustomerRatings', () => {
    it('should return empty reviews array (not implemented yet)', async () => {
      const result = await service.getCustomerRatings(
        mockPickupLocationId,
        mockDateRange,
      );

      expect(result.reviews).toEqual([]);
    });
  });

  describe('getDashboardOverview', () => {
    it('should aggregate all dashboard sections', async () => {
      ordersRepository.getOrderStats.mockResolvedValue({
        count: 50,
        revenue: 250000,
        avgDeliveryTime: 35,
      });
      ordersRepository.getActiveOrdersCount.mockResolvedValue(10);
      ordersRepository.getDailyRevenue.mockResolvedValue([
        { date: '2026-02-10', revenue: 250000 },
      ]);
      ordersRepository.getHourlyOrderCounts.mockResolvedValue(
        Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 2 })),
      );
      ordersRepository.getOrderStatusBreakdown.mockResolvedValue([
        { status: 'delivered', count: 40 },
      ]);
      ordersRepository.getMenuItemPerformance.mockResolvedValue([
        {
          foodItemId: new Types.ObjectId(),
          name: 'Test Item',
          imageUrl: 'url',
          orderCount: 10,
        },
      ]);

      const result = await service.getDashboardOverview(
        mockPickupLocationId.toString(),
        mockDateRange,
        mockPreviousDateRange,
      );

      expect(result).toHaveProperty('stats');
      expect(result).toHaveProperty('profit');
      expect(result).toHaveProperty('orderTraffic');
      expect(result).toHaveProperty('orderBreakdown');
      expect(result).toHaveProperty('menuPerformance');
      expect(result).toHaveProperty('customerRatings');
    });
  });
});
