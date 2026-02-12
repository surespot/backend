import { Injectable, Logger } from '@nestjs/common';
import { OrdersRepository } from '../orders/orders.repository';
import { FoodItemsRepository } from '../food-items/food-items.repository';
import {
  StatsGridDto,
  ProfitChartDto,
  OrderTrafficChartDto,
  OrderBreakdownDto,
  MenuPerformanceDto,
  CustomerRatingsDto,
  DashboardOverviewResponseDto,
} from './dto/dashboard-response.dto';
import { Types } from 'mongoose';

export interface DateRange {
  start: Date;
  end: Date;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly foodItemsRepository: FoodItemsRepository,
  ) {}

  /**
   * Resolve pickupLocationId filter: convert string to ObjectId if present
   */
  private resolvePickupLocationFilter(
    pickupLocationId?: string,
  ): Types.ObjectId | undefined {
    return pickupLocationId
      ? new Types.ObjectId(pickupLocationId)
      : undefined;
  }

  /**
   * Generate main dashboard overview aggregating all sections
   */
  async getDashboardOverview(
    pickupLocationId: string | undefined,
    dateRange: DateRange,
    previousDateRange: DateRange,
  ): Promise<DashboardOverviewResponseDto> {
    const pickupLocationFilter =
      this.resolvePickupLocationFilter(pickupLocationId);

    const [
      stats,
      profit,
      orderTraffic,
      orderBreakdown,
      menuPerformance,
      customerRatings,
    ] = await Promise.all([
      this.getStats(pickupLocationFilter, dateRange, previousDateRange),
      this.getProfit(pickupLocationFilter, dateRange),
      this.getOrderTraffic(pickupLocationFilter, dateRange),
      this.getOrderBreakdown(pickupLocationFilter, dateRange),
      this.getMenuPerformance(pickupLocationFilter, dateRange, previousDateRange),
      this.getCustomerRatings(pickupLocationFilter, dateRange),
    ]);

    return {
      stats,
      profit,
      orderTraffic,
      orderBreakdown,
      menuPerformance,
      customerRatings,
    };
  }

  /**
   * StatsGrid: orders count, revenue, active orders, avg delivery time with deltas
   */
  async getStats(
    pickupLocationId: Types.ObjectId | undefined,
    dateRange: DateRange,
    previousDateRange: DateRange,
  ): Promise<StatsGridDto> {
    const [currentStats, previousStats] = await Promise.all([
      this.ordersRepository.getOrderStats(
        pickupLocationId,
        dateRange.start,
        dateRange.end,
      ),
      this.ordersRepository.getOrderStats(
        pickupLocationId,
        previousDateRange.start,
        previousDateRange.end,
      ),
    ]);

    const activeOrdersCount =
      await this.ordersRepository.getActiveOrdersCount(pickupLocationId);

    return {
      ordersTodayCount: currentStats.count,
      ordersTodayDeltaPct: this.calculateDeltaPct(
        currentStats.count,
        previousStats.count,
      ),
      revenueToday: currentStats.revenue,
      revenueTodayDeltaPct: this.calculateDeltaPct(
        currentStats.revenue,
        previousStats.revenue,
      ),
      activeOrdersCount,
      activeOrdersDeltaPct: 0, // Can be computed if we track historical active orders
      avgDeliveryTimeMinutes: currentStats.avgDeliveryTime,
      avgDeliveryTimeDeltaPct: this.calculateDeltaPct(
        currentStats.avgDeliveryTime,
        previousStats.avgDeliveryTime,
        true,
      ),
    };
  }

  /**
   * ProfitChart: total profit and daily series
   */
  async getProfit(
    pickupLocationId: Types.ObjectId | undefined,
    dateRange: DateRange,
  ): Promise<ProfitChartDto> {
    const dailyProfits = await this.ordersRepository.getDailyRevenue(
      pickupLocationId,
      dateRange.start,
      dateRange.end,
    );

    const totalProfit = dailyProfits.reduce(
      (sum, day) => sum + day.revenue,
      0,
    );

    const series = dailyProfits.map((day) => ({
      label: this.formatDateLabel(day.date),
      profit: day.revenue,
    }));

    return { totalProfit, series };
  }

  /**
   * OrderTrafficChart: hourly order counts.
   *
   * - For a single day range, it shows traffic for that day.
   * - For multi-day ranges, it aggregates all hours across the entire period
   *   (e.g. all 9AM orders across all days in the range).
   */
  async getOrderTraffic(
    pickupLocationId: Types.ObjectId | undefined,
    dateRange: DateRange,
  ): Promise<OrderTrafficChartDto> {
    const isSingleDay =
      dateRange.start.toDateString() === dateRange.end.toDateString();

    let rangeStart: Date;
    let rangeEnd: Date;
    let label: string;

    if (isSingleDay) {
      // Normalize to full day bounds
      const dayStart = new Date(dateRange.start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateRange.start);
      dayEnd.setHours(23, 59, 59, 999);

      rangeStart = dayStart;
      rangeEnd = dayEnd;
      label = dayStart.toISOString().split('T')[0];
    } else {
      // Use the full period as provided (already normalized in controller)
      rangeStart = dateRange.start;
      rangeEnd = dateRange.end;

      const startLabel = rangeStart.toISOString().split('T')[0];
      const endLabel = rangeEnd.toISOString().split('T')[0];
      label = `${startLabel} - ${endLabel}`;
    }

    const hourlyData = await this.ordersRepository.getHourlyOrderCounts(
      pickupLocationId,
      rangeStart,
      rangeEnd,
    );

    const buckets = hourlyData.map((bucket) => ({
      timeLabel: this.formatHourLabel(bucket.hour),
      ordersCount: bucket.count,
    }));

    return {
      date: label,
      buckets,
    };
  }

  /**
   * OrderBreakdown: total and by-status counts
   */
  async getOrderBreakdown(
    pickupLocationId: Types.ObjectId | undefined,
    dateRange: DateRange,
  ): Promise<OrderBreakdownDto> {
    const breakdown = await this.ordersRepository.getOrderStatusBreakdown(
      pickupLocationId,
      dateRange.start,
      dateRange.end,
    );

    const totalOrders = breakdown.reduce((sum, item) => sum + item.count, 0);

    return {
      totalOrders,
      byStatus: breakdown,
    };
  }

  /**
   * MenuPerformance: best and worst performing food items
   */
  async getMenuPerformance(
    pickupLocationId: Types.ObjectId | undefined,
    dateRange: DateRange,
    previousDateRange: DateRange,
  ): Promise<MenuPerformanceDto> {
    const [currentPerformance, previousPerformance] = await Promise.all([
      this.ordersRepository.getMenuItemPerformance(
        pickupLocationId,
        dateRange.start,
        dateRange.end,
        10,
      ),
      this.ordersRepository.getMenuItemPerformance(
        pickupLocationId,
        previousDateRange.start,
        previousDateRange.end,
        10,
      ),
    ]);

    // Build a map of previous period performance by foodItemId
    const previousMap = new Map(
      previousPerformance.map((item) => [
        item.foodItemId.toString(),
        item.orderCount,
      ]),
    );

    // Calculate delta percentage for each item
    const performanceWithDelta = currentPerformance.map((item) => {
      const previous = previousMap.get(item.foodItemId.toString()) || 0;
      return {
        ...item,
        deltaPct: this.calculateDeltaPct(item.orderCount, previous),
      };
    });

    // Sort by delta to get best and worst
    const sorted = [...performanceWithDelta].sort(
      (a, b) => b.deltaPct - a.deltaPct,
    );

    const bestPerformers = sorted.slice(0, 3).map((item) => ({
      name: item.name,
      imageUrl: item.imageUrl,
      deltaPct: Math.round(item.deltaPct * 10) / 10,
    }));

    const worstPerformers = sorted.slice(-3).reverse().map((item) => ({
      name: item.name,
      imageUrl: item.imageUrl,
      deltaPct: Math.round(item.deltaPct * 10) / 10,
    }));

    return { bestPerformers, worstPerformers };
  }

  /**
   * CustomerRatings: recent reviews/ratings
   * Currently returns empty array - to be implemented when reviews collection is added
   */
  async getCustomerRatings(
    pickupLocationId: Types.ObjectId | undefined,
    dateRange: DateRange,
  ): Promise<CustomerRatingsDto> {
    // TODO: Implement when reviews collection is added
    // For now, return empty array
    return { reviews: [] };
  }

  /**
   * Calculate percentage change between current and previous values
   */
  private calculateDeltaPct(
    current: number,
    previous: number,
    invert = false,
  ): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    const delta = ((current - previous) / previous) * 100;
    return Math.round((invert ? -delta : delta) * 10) / 10;
  }

  /**
   * Format date for chart labels (e.g., "Mon" or "2026-02-10")
   */
  private formatDateLabel(date: string): string {
    const d = new Date(date);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }

  /**
   * Format hour for traffic chart (e.g., "9AM", "12PM", "6PM")
   */
  private formatHourLabel(hour: number): string {
    if (hour === 0) return '12AM';
    if (hour === 12) return '12PM';
    if (hour < 12) return `${hour}AM`;
    return `${hour - 12}PM`;
  }
}
