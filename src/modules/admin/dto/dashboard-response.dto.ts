import { ApiProperty } from '@nestjs/swagger';

export class StatsGridDto {
  @ApiProperty({ example: 34 })
  ordersTodayCount: number;

  @ApiProperty({ example: 24 })
  ordersTodayDeltaPct: number;

  @ApiProperty({ example: 142130 })
  revenueToday: number;

  @ApiProperty({ example: -0.3 })
  revenueTodayDeltaPct: number;

  @ApiProperty({ example: 17 })
  activeOrdersCount: number;

  @ApiProperty({ example: 0.5 })
  activeOrdersDeltaPct: number;

  @ApiProperty({ example: 32 })
  avgDeliveryTimeMinutes: number;

  @ApiProperty({ example: -32 })
  avgDeliveryTimeDeltaPct: number;
}

export class ProfitSeriesPointDto {
  @ApiProperty({ example: 'Mon' })
  label: string;

  @ApiProperty({ example: 120000 })
  profit: number;
}

export class ProfitChartDto {
  @ApiProperty({ example: 1632428 })
  totalProfit: number;

  @ApiProperty({ type: [ProfitSeriesPointDto] })
  series: ProfitSeriesPointDto[];
}

export class OrderTrafficBucketDto {
  @ApiProperty({ example: '9AM' })
  timeLabel: string;

  @ApiProperty({ example: 5 })
  ordersCount: number;
}

export class OrderTrafficChartDto {
  @ApiProperty({ example: '2026-02-10' })
  date: string;

  @ApiProperty({ type: [OrderTrafficBucketDto] })
  buckets: OrderTrafficBucketDto[];
}

export class OrderStatusBreakdownDto {
  @ApiProperty({ example: 'Delivered' })
  status: string;

  @ApiProperty({ example: 68 })
  count: number;
}

export class OrderBreakdownDto {
  @ApiProperty({ example: 100 })
  totalOrders: number;

  @ApiProperty({ type: [OrderStatusBreakdownDto] })
  byStatus: OrderStatusBreakdownDto[];
}

export class MenuPerformerDto {
  @ApiProperty({ example: 'Jollof Rice' })
  name: string;

  @ApiProperty({ example: 'https://cdn.surespot.app/images/jollof-rice.jpg' })
  imageUrl: string;

  @ApiProperty({ example: 45 })
  deltaPct: number;
}

export class MenuPerformanceDto {
  @ApiProperty({ type: [MenuPerformerDto] })
  bestPerformers: MenuPerformerDto[];

  @ApiProperty({ type: [MenuPerformerDto] })
  worstPerformers: MenuPerformerDto[];
}

export class CustomerReviewDto {
  @ApiProperty({ example: 'Okpara James' })
  name: string;

  @ApiProperty({
    example: 'https://cdn.surespot.app/avatar.jpg',
    required: false,
  })
  avatarUrl?: string;

  @ApiProperty({ example: 5 })
  rating: number;

  @ApiProperty({
    example: "Honestly didn't expect it to be this good. Proper flavor.",
  })
  comment: string;

  @ApiProperty({ example: 'Jollof Rice' })
  food: string;

  @ApiProperty({ example: '2026-02-10T12:34:00Z' })
  createdAt: string;
}

export class CustomerRatingsDto {
  @ApiProperty({ type: [CustomerReviewDto] })
  reviews: CustomerReviewDto[];
}

export class DashboardOverviewResponseDto {
  @ApiProperty({ type: StatsGridDto })
  stats: StatsGridDto;

  @ApiProperty({ type: ProfitChartDto })
  profit: ProfitChartDto;

  @ApiProperty({ type: OrderTrafficChartDto })
  orderTraffic: OrderTrafficChartDto;

  @ApiProperty({ type: OrderBreakdownDto })
  orderBreakdown: OrderBreakdownDto;

  @ApiProperty({ type: MenuPerformanceDto })
  menuPerformance: MenuPerformanceDto;

  @ApiProperty({ type: CustomerRatingsDto })
  customerRatings: CustomerRatingsDto;
}
