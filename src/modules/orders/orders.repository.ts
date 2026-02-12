import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  Order,
  OrderDocument,
  OrderStatus,
  DeliveryType,
  PaymentStatus,
} from './schemas/order.schema';
import { OrderItem, OrderItemDocument } from './schemas/order-item.schema';
import { OrderExtra, OrderExtraDocument } from './schemas/order-extra.schema';
import {
  OrderDeliveryStatus,
  OrderDeliveryStatusDocument,
  DeliveryStatus,
} from './schemas/order-delivery-status.schema';

export interface PaginationResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

@Injectable()
export class OrdersRepository {
  private readonly logger = new Logger(OrdersRepository.name);

  constructor(
    @InjectModel(Order.name)
    private orderModel: Model<OrderDocument>,
    @InjectModel(OrderItem.name)
    private orderItemModel: Model<OrderItemDocument>,
    @InjectModel(OrderExtra.name)
    private orderExtraModel: Model<OrderExtraDocument>,
    @InjectModel(OrderDeliveryStatus.name)
    private orderDeliveryStatusModel: Model<OrderDeliveryStatusDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  private validateObjectId(id: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: `Invalid ${fieldName} format`,
        },
      });
    }
  }

  // ============ Order Operations ============

  async createOrder(data: {
    orderNumber: string;
    userId: string;
    deliveryType: DeliveryType;
    subtotal: number;
    extrasTotal: number;
    deliveryFee: number;
    discountAmount: number;
    discountPercent?: number;
    promoCode?: string;
    promotionId?: string;
    total: number;
    itemCount: number;
    extrasCount: number;
    deliveryAddress?: {
      id?: string;
      address: string;
      street?: string;
      city?: string;
      state?: string;
      country?: string;
      coordinates?: { latitude: number; longitude: number };
      instructions?: string;
      contactPhone?: string;
    };
    pickupLocationId?: string;
    estimatedDeliveryTime?: Date;
    estimatedPreparationTime?: number;
    paymentMethod?: string;
    paymentIntentId?: string;
    instructions?: string;
  }): Promise<OrderDocument> {
    this.validateObjectId(data.userId, 'userId');

    const orderData: Record<string, unknown> = {
      orderNumber: data.orderNumber,
      userId: new Types.ObjectId(data.userId),
      status: OrderStatus.PENDING,
      deliveryType: data.deliveryType,
      subtotal: data.subtotal,
      extrasTotal: data.extrasTotal,
      deliveryFee: data.deliveryFee,
      discountAmount: data.discountAmount,
      discountPercent: data.discountPercent,
      promoCode: data.promoCode,
      total: data.total,
      itemCount: data.itemCount,
      extrasCount: data.extrasCount,
      deliveryAddress: data.deliveryAddress,
      estimatedDeliveryTime: data.estimatedDeliveryTime,
      estimatedPreparationTime: data.estimatedPreparationTime,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: data.paymentMethod,
      paymentIntentId: data.paymentIntentId,
      instructions: data.instructions,
    };

    // Generate a 4-digit delivery confirmation code for door-delivery orders
    if (data.deliveryType === DeliveryType.DOOR_DELIVERY) {
      orderData.deliveryConfirmationCode = Math.floor(
        1000 + Math.random() * 9000,
      ).toString();
    }

    if (data.promotionId) {
      orderData.promotionId = new Types.ObjectId(data.promotionId);
    }

    if (data.pickupLocationId) {
      this.validateObjectId(data.pickupLocationId, 'pickupLocationId');
      orderData.pickupLocationId = new Types.ObjectId(data.pickupLocationId);
    }

    const order = new this.orderModel(orderData);
    return order.save();
  }

  async findById(id: string): Promise<OrderDocument | null> {
    this.validateObjectId(id, 'orderId');
    return this.orderModel.findById(id).populate('pickupLocationId').exec();
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderDocument | null> {
    return this.orderModel
      .findOne({ orderNumber })
      .populate('pickupLocationId')
      .exec();
  }

  async findByPaymentIntentId(
    paymentIntentId: string,
  ): Promise<OrderDocument | null> {
    console.log(
      'Searching for paymentIntentId:',
      paymentIntentId,
      'type:',
      typeof paymentIntentId,
    );
    const query = { paymentIntentId };
    console.log('Query:', JSON.stringify(query));

    const order = await this.orderModel
      .findOne(query)
      .populate('pickupLocationId')
      .exec();

    if (order) {
      console.log('Found order:', {
        id: order._id.toString(),
        orderNumber: order.orderNumber,
        paymentIntentId: order.paymentIntentId,
        paymentIntentIdType: typeof order.paymentIntentId,
        paymentStatus: order.paymentStatus,
      });
    } else {
      console.log(
        'No order found. Checking all orders with paymentIntentId field...',
      );
      const allOrders = await this.orderModel
        .find({ paymentIntentId: { $exists: true } })
        .select('paymentIntentId orderNumber')
        .limit(5)
        .exec();
      console.log(
        'Sample orders with paymentIntentId:',
        allOrders.map((o) => ({
          orderNumber: o.orderNumber,
          paymentIntentId: o.paymentIntentId,
          matches: o.paymentIntentId === paymentIntentId,
        })),
      );
    }

    return order;
  }

  async findByUserId(
    userId: string,
    filter: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
      deliveryType?: DeliveryType;
    },
  ): Promise<PaginationResult<OrderDocument>> {
    this.validateObjectId(userId, 'userId');

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.deliveryType) {
      query.deliveryType = filter.deliveryType;
    }

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('pickupLocationId')
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findByRegionAndStatus(
    regionId: string,
    status: OrderStatus,
    pagination: {
      page?: number;
      limit?: number;
    },
  ): Promise<PaginationResult<OrderDocument>> {
    this.validateObjectId(regionId, 'regionId');

    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    // Find orders with the specified status that have a pickup location in the region
    // We need to populate pickupLocationId first, then filter by regionId
    const query: any = {
      status,
      deliveryType: DeliveryType.DOOR_DELIVERY, // Only door delivery orders
      paymentStatus: PaymentStatus.PAID, // Only paid orders
      pickupLocationId: { $exists: true, $ne: null },
      $or: [{ assignedRiderId: { $exists: false } }, { assignedRiderId: null }], // Only unassigned orders
    };

    // First, get all pickup locations in the region
    const pickupLocationModel = this.connection.models.PickupLocation;
    const pickupLocations = await pickupLocationModel
      .find({ regionId: new Types.ObjectId(regionId), isActive: true })
      .select('_id')
      .lean()
      .exec();

    const pickupLocationIds = pickupLocations.map(
      (pl: { _id: unknown }) => new Types.ObjectId(pl._id as string),
    );

    if (pickupLocationIds.length === 0) {
      // No pickup locations in region, return empty result
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }

    query.pickupLocationId = { $in: pickupLocationIds };

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('pickupLocationId')
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async updateOrder(
    id: string,
    data: Partial<{
      status: OrderStatus;
      paymentStatus: PaymentStatus;
      paymentIntentId: string;
      transactionId: string;
      deliveredAt: Date;
      cancelledAt: Date;
      cancellationReason: string;
    }>,
  ): Promise<OrderDocument | null> {
    this.validateObjectId(id, 'orderId');

    const updateData: Record<string, unknown> = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.paymentStatus !== undefined)
      updateData.paymentStatus = data.paymentStatus;
    if (data.paymentIntentId !== undefined)
      updateData.paymentIntentId = data.paymentIntentId;
    if (data.deliveredAt !== undefined)
      updateData.deliveredAt = data.deliveredAt;
    if (data.cancelledAt !== undefined)
      updateData.cancelledAt = data.cancelledAt;
    if (data.cancellationReason !== undefined)
      updateData.cancellationReason = data.cancellationReason;

    if (data.transactionId) {
      updateData.transactionId = new Types.ObjectId(data.transactionId);
    }

    return this.orderModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .populate('pickupLocationId')
      .exec();
  }

  /**
   * Atomically assign a rider to an order
   * Uses findOneAndUpdate with conditions to prevent race conditions
   * Returns null if order is already assigned or doesn't meet conditions
   */
  async assignRiderToOrder(
    orderId: string,
    riderProfileId: string,
    userId: string,
  ): Promise<OrderDocument | null> {
    this.validateObjectId(orderId, 'orderId');
    this.validateObjectId(riderProfileId, 'riderProfileId');
    this.validateObjectId(userId, 'userId');

    // Atomic update: only assign if order is READY, not already assigned, and is DOOR_DELIVERY
    const updatedOrder = await this.orderModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(orderId),
          status: OrderStatus.READY,
          $or: [
            { assignedRiderId: { $exists: false } },
            { assignedRiderId: null },
          ], // Not already assigned
          deliveryType: DeliveryType.DOOR_DELIVERY,
        },
        {
          $set: {
            assignedRiderId: new Types.ObjectId(riderProfileId),
            assignedAt: new Date(),
            assignedBy: new Types.ObjectId(userId),
          },
        },
        { new: true },
      )
      .populate('pickupLocationId')
      .exec();

    return updatedOrder;
  }

  /**
   * Find orders assigned to a specific rider
   */
  async findByAssignedRider(
    riderProfileId: string,
    filter: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
    },
  ): Promise<PaginationResult<OrderDocument>> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      assignedRiderId: new Types.ObjectId(riderProfileId),
    };

    if (filter.status) {
      query.status = filter.status;
    }

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('pickupLocationId')
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Count active orders assigned to a rider (not delivered or cancelled)
   */
  async countActiveAssignedOrders(riderProfileId: string): Promise<number> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    return this.orderModel
      .countDocuments({
        assignedRiderId: new Types.ObjectId(riderProfileId),
        status: {
          $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
        },
      })
      .exec();
  }

  /**
   * Get today's stats for a rider (completed orders and earnings)
   */
  async getTodayStatsForRider(riderProfileId: string): Promise<{
    completedOrders: number;
    earnings: number; // in kobo
  }> {
    this.validateObjectId(riderProfileId, 'riderProfileId');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [completedOrders, earningsResult] = await Promise.all([
      this.orderModel
        .countDocuments({
          assignedRiderId: new Types.ObjectId(riderProfileId),
          status: OrderStatus.DELIVERED,
          deliveredAt: { $gte: todayStart, $lte: todayEnd },
        })
        .exec(),
      this.orderModel
        .aggregate([
          {
            $match: {
              assignedRiderId: new Types.ObjectId(riderProfileId),
              status: OrderStatus.DELIVERED,
              deliveredAt: { $gte: todayStart, $lte: todayEnd },
            },
          },
          {
            $group: {
              _id: null,
              totalEarnings: { $sum: '$deliveryFee' },
            },
          },
        ])
        .exec(),
    ]);

    return {
      completedOrders,
      earnings: earningsResult[0]?.totalEarnings || 0,
    };
  }

  /**
   * Get today's earnings grouped by rider (for daily processing)
   */
  async getTodayEarningsByRider(): Promise<
    Array<{
      riderProfileId: string;
      totalEarnings: number;
      orderCount: number;
      orderIds: string[];
    }>
  > {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const results = await this.orderModel
      .aggregate<{
        _id: Types.ObjectId;
        totalEarnings: number;
        orderCount: number;
        orderIds: Types.ObjectId[];
      }>([
        {
          $match: {
            status: OrderStatus.DELIVERED,
            deliveredAt: { $gte: todayStart, $lte: todayEnd },
            assignedRiderId: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$assignedRiderId',
            totalEarnings: { $sum: '$deliveryFee' },
            orderCount: { $sum: 1 },
            orderIds: { $push: '$_id' },
          },
        },
      ])
      .exec();

    return results.map((r) => ({
      riderProfileId: r._id.toString(),
      totalEarnings: r.totalEarnings,
      orderCount: r.orderCount,
      orderIds: r.orderIds.map((id) => id.toString()),
    }));
  }

  async countOrdersForYear(year: number): Promise<number> {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    return this.orderModel
      .countDocuments({
        createdAt: { $gte: startOfYear, $lt: endOfYear },
      })
      .exec();
  }

  // ============ Order Item Operations ============

  async createOrderItem(data: {
    orderId: string;
    foodItemId: string;
    name: string;
    description: string;
    slug: string;
    price: number;
    currency: string;
    imageUrl: string;
    quantity: number;
    estimatedTime: { min: number; max: number };
    lineTotal: number;
  }): Promise<OrderItemDocument> {
    this.validateObjectId(data.orderId, 'orderId');
    this.validateObjectId(data.foodItemId, 'foodItemId');

    const orderItem = new this.orderItemModel({
      orderId: new Types.ObjectId(data.orderId),
      foodItemId: new Types.ObjectId(data.foodItemId),
      name: data.name,
      description: data.description,
      slug: data.slug,
      price: data.price,
      currency: data.currency,
      imageUrl: data.imageUrl,
      quantity: data.quantity,
      estimatedTime: data.estimatedTime,
      lineTotal: data.lineTotal,
    });
    return orderItem.save();
  }

  async findOrderItemsByOrderId(orderId: string): Promise<OrderItemDocument[]> {
    this.validateObjectId(orderId, 'orderId');
    return this.orderItemModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .exec();
  }

  async getPreviouslyOrderedFoodItemIds(
    userId: string,
  ): Promise<Types.ObjectId[]> {
    this.validateObjectId(userId, 'userId');

    // Get all orders for the user
    const orders = await this.orderModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id')
      .exec();

    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order._id);

    // Get all order items for these orders
    const orderItems = await this.orderItemModel
      .find({ orderId: { $in: orderIds } })
      .select('foodItemId')
      .exec();

    // Extract unique food item IDs
    const foodItemIds = Array.from(
      new Set(orderItems.map((item) => item.foodItemId.toString())),
    ).map((id) => new Types.ObjectId(id));

    return foodItemIds;
  }

  // ============ Order Extra Operations ============

  async createOrderExtra(data: {
    orderItemId: string;
    foodExtraId: string;
    name: string;
    price: number;
    currency: string;
    quantity: number;
  }): Promise<OrderExtraDocument> {
    this.validateObjectId(data.orderItemId, 'orderItemId');
    this.validateObjectId(data.foodExtraId, 'foodExtraId');

    const orderExtra = new this.orderExtraModel({
      orderItemId: new Types.ObjectId(data.orderItemId),
      foodExtraId: new Types.ObjectId(data.foodExtraId),
      name: data.name,
      price: data.price,
      currency: data.currency,
      quantity: data.quantity,
    });
    return orderExtra.save();
  }

  async findOrderExtrasByOrderItemId(
    orderItemId: string,
  ): Promise<OrderExtraDocument[]> {
    this.validateObjectId(orderItemId, 'orderItemId');
    return this.orderExtraModel
      .find({ orderItemId: new Types.ObjectId(orderItemId) })
      .exec();
  }

  // ============ Order Delivery Status Operations ============

  async createDeliveryStatus(data: {
    orderId: string;
    status: DeliveryStatus;
    message?: string;
    updatedBy?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<OrderDeliveryStatusDocument> {
    this.validateObjectId(data.orderId, 'orderId');

    const statusData: Record<string, unknown> = {
      orderId: new Types.ObjectId(data.orderId),
      status: data.status,
      message: data.message,
    };

    if (data.updatedBy) {
      this.validateObjectId(data.updatedBy, 'updatedBy');
      statusData.updatedBy = new Types.ObjectId(data.updatedBy);
    }

    if (data.latitude !== undefined && data.longitude !== undefined) {
      statusData.location = {
        type: 'Point',
        coordinates: [data.longitude, data.latitude],
      };
    }

    const deliveryStatus = new this.orderDeliveryStatusModel(statusData);
    return deliveryStatus.save();
  }

  async findDeliveryStatusHistory(
    orderId: string,
  ): Promise<OrderDeliveryStatusDocument[]> {
    this.validateObjectId(orderId, 'orderId');
    return this.orderDeliveryStatusModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .sort({ createdAt: 1 })
      .populate('updatedBy', 'firstName lastName')
      .exec();
  }

  async findLatestDeliveryStatus(
    orderId: string,
  ): Promise<OrderDeliveryStatusDocument | null> {
    this.validateObjectId(orderId, 'orderId');
    return this.orderDeliveryStatusModel
      .findOne({ orderId: new Types.ObjectId(orderId) })
      .sort({ createdAt: -1 })
      .populate('updatedBy', 'firstName lastName')
      .exec();
  }

  // ============ Dashboard Analytics Operations ============

  /**
   * Get order statistics for a date range
   */
  async getOrderStats(
    pickupLocationId: Types.ObjectId | undefined,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    count: number;
    revenue: number;
    avgDeliveryTime: number;
  }> {
    const matchStage: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: PaymentStatus.PAID,
    };

    if (pickupLocationId) {
      matchStage.pickupLocationId = pickupLocationId;
    }

    const [countResult, deliveryTimeResult] = await Promise.all([
      this.orderModel
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              revenue: { $sum: '$total' },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          {
            $match: {
              ...matchStage,
              status: OrderStatus.DELIVERED,
              deliveredAt: { $exists: true, $ne: null },
            },
          },
          {
            $project: {
              deliveryTimeMinutes: {
                $divide: [
                  { $subtract: ['$deliveredAt', '$createdAt'] },
                  1000 * 60,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              avgDeliveryTime: { $avg: '$deliveryTimeMinutes' },
            },
          },
        ])
        .exec(),
    ]);

    return {
      count: countResult[0]?.count || 0,
      revenue: countResult[0]?.revenue || 0,
      avgDeliveryTime: Math.round(deliveryTimeResult[0]?.avgDeliveryTime || 0),
    };
  }

  /**
   * Get count of active orders (not delivered or cancelled)
   */
  async getActiveOrdersCount(
    pickupLocationId: Types.ObjectId | undefined,
  ): Promise<number> {
    const query: Record<string, unknown> = {
      status: {
        $nin: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      },
    };

    if (pickupLocationId) {
      query.pickupLocationId = pickupLocationId;
    }

    return this.orderModel.countDocuments(query).exec();
  }

  /**
   * Get daily revenue grouped by date
   */
  async getDailyRevenue(
    pickupLocationId: Types.ObjectId | undefined,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ date: string; revenue: number }>> {
    const matchStage: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: endDate },
      paymentStatus: PaymentStatus.PAID,
    };

    if (pickupLocationId) {
      matchStage.pickupLocationId = pickupLocationId;
    }

    const results = await this.orderModel
      .aggregate<{ _id: string; revenue: number }>([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            revenue: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    return results.map((r) => ({
      date: r._id,
      revenue: r.revenue,
    }));
  }

  /**
   * Get hourly order counts for a specific day
   */
  async getHourlyOrderCounts(
    pickupLocationId: Types.ObjectId | undefined,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<Array<{ hour: number; count: number }>> {
    const matchStage: Record<string, unknown> = {
      createdAt: { $gte: dayStart, $lte: dayEnd },
    };

    if (pickupLocationId) {
      matchStage.pickupLocationId = pickupLocationId;
    }

    const results = await this.orderModel
      .aggregate<{ _id: number; count: number }>([
        { $match: matchStage },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    // Fill in missing hours with 0 counts
    const hourCounts = new Array(24).fill(0).map((_, i) => ({
      hour: i,
      count: 0,
    }));

    results.forEach((r) => {
      hourCounts[r._id].count = r.count;
    });

    return hourCounts;
  }

  /**
   * Get order status breakdown
   */
  async getOrderStatusBreakdown(
    pickupLocationId: Types.ObjectId | undefined,
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ status: string; count: number }>> {
    const matchStage: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: endDate },
    };

    if (pickupLocationId) {
      matchStage.pickupLocationId = pickupLocationId;
    }

    const results = await this.orderModel
      .aggregate<{ _id: string; count: number }>([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ])
      .exec();

    return results.map((r) => ({
      status: this.formatStatusLabel(r._id),
      count: r.count,
    }));
  }

  /**
   * Get menu item performance by order count
   */
  async getMenuItemPerformance(
    pickupLocationId: Types.ObjectId | undefined,
    startDate: Date,
    endDate: Date,
    limit: number,
  ): Promise<
    Array<{
      foodItemId: Types.ObjectId;
      name: string;
      imageUrl: string;
      orderCount: number;
    }>
  > {
    // First get orders in the date range
    const orderMatchStage: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: endDate },
    };

    if (pickupLocationId) {
      orderMatchStage.pickupLocationId = pickupLocationId;
    }

    const orders = await this.orderModel
      .find(orderMatchStage)
      .select('_id')
      .exec();

    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order._id);

    // Get order items for these orders and aggregate by food item
    const results = await this.orderItemModel
      .aggregate<{
        _id: Types.ObjectId;
        name: string;
        imageUrl: string;
        orderCount: number;
      }>([
        { $match: { orderId: { $in: orderIds } } },
        {
          $group: {
            _id: '$foodItemId',
            name: { $first: '$name' },
            imageUrl: { $first: '$imageUrl' },
            orderCount: { $sum: '$quantity' },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: limit },
      ])
      .exec();

    return results.map((r) => ({
      foodItemId: r._id,
      name: r.name,
      imageUrl: r.imageUrl,
      orderCount: r.orderCount,
    }));
  }

  /**
   * Format status enum to readable label
   */
  private formatStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      [OrderStatus.PENDING]: 'Pending',
      [OrderStatus.CONFIRMED]: 'Confirmed',
      [OrderStatus.PREPARING]: 'Preparing',
      [OrderStatus.READY]: 'Ready',
      [OrderStatus.OUT_FOR_DELIVERY]: 'Out for Delivery',
      [OrderStatus.DELIVERED]: 'Delivered',
      [OrderStatus.CANCELLED]: 'Cancelled',
    };
    return labels[status] || status;
  }

  // ============ Admin Orders Operations ============

  /**
   * Find orders by pickup location with filters for admin dashboard
   */
  async findByPickupLocationWithFilters(
    pickupLocationId: string,
    filters: {
      statuses?: OrderStatus[];
      from?: Date;
      to?: Date;
      sort?: 'createdAt';
      direction?: 'asc' | 'desc';
      search?: string;
      customerId?: string;
      riderId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginationResult<OrderDocument>> {
    this.validateObjectId(pickupLocationId, 'pickupLocationId');

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      pickupLocationId: new Types.ObjectId(pickupLocationId),
    };

    // Apply status filter
    if (filters.statuses && filters.statuses.length > 0) {
      query.status = { $in: filters.statuses };
    }

    // Apply date range filter
    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) {
        (query.createdAt as Record<string, unknown>).$gte = filters.from;
      }
      if (filters.to) {
        (query.createdAt as Record<string, unknown>).$lte = filters.to;
      }
    }

    // Apply customer filter
    if (filters.customerId) {
      this.validateObjectId(filters.customerId, 'customerId');
      query.userId = new Types.ObjectId(filters.customerId);
    }

    // Apply rider filter
    if (filters.riderId) {
      this.validateObjectId(filters.riderId, 'riderId');
      query.assignedRiderId = new Types.ObjectId(filters.riderId);
    }

    // Apply search filter
    if (filters.search) {
      query.$or = [
        { orderNumber: { $regex: filters.search, $options: 'i' } },
      ];
    }

    // Build sort
    const sortField = filters.sort || 'createdAt';
    const sortDirection = filters.direction === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDirection };

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('pickupLocationId')
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get order count by status for a pickup location
   */
  async getOrderCountsByStatus(
    pickupLocationId: Types.ObjectId | undefined,
  ): Promise<Record<OrderStatus, number>> {
    const matchStage: Record<string, unknown> = {};
    if (pickupLocationId) {
      matchStage.pickupLocationId = pickupLocationId;
    }

    const results = await this.orderModel
      .aggregate<{ _id: OrderStatus; count: number }>([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    // Initialize all statuses with 0
    const counts: Record<OrderStatus, number> = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.PREPARING]: 0,
      [OrderStatus.READY]: 0,
      [OrderStatus.OUT_FOR_DELIVERY]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
    };

    // Fill in actual counts
    results.forEach((result) => {
      counts[result._id] = result.count;
    });

    return counts;
  }

  /**
   * Get today's revenue for a pickup location
   */
  async getTodayRevenue(
    pickupLocationId: Types.ObjectId | undefined,
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const matchStage: Record<string, unknown> = {
      createdAt: { $gte: today, $lt: tomorrow },
      status: { $ne: OrderStatus.CANCELLED },
    };

    if (pickupLocationId) {
      matchStage.pickupLocationId = pickupLocationId;
    }

    const results = await this.orderModel
      .aggregate<{ total: number }>([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: '$total' },
          },
        },
      ])
      .exec();

    return results.length > 0 ? results[0].total : 0;
  }
}
