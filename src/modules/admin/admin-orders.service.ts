import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrdersRepository } from '../orders/orders.repository';
import { OrdersService } from '../orders/orders.service';
import { OrderDocument, OrderStatus, DeliveryType } from '../orders/schemas/order.schema';
import { DeliveryStatus } from '../orders/schemas/order-delivery-status.schema';
import { AuthRepository } from '../auth/auth.repository';
import { RidersRepository } from '../riders/riders.repository';
import {
  AdminOrderRowDto,
  AdminOrderDetailsDto,
  AdminOrderItemDto,
} from './dto/admin-order-response.dto';
import { AdminGetOrdersDto } from './dto/admin-get-orders.dto';
import { AdminUpdateOrderStatusDto, AdminOrderStatus } from './dto/admin-update-order-status.dto';

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly ordersService: OrdersService,
    private readonly authRepository: AuthRepository,
    private readonly ridersRepository: RidersRepository,
  ) {}

  /**
   * Map admin UI status to internal OrderStatus array
   */
  private mapStatusFilter(statusParam?: string): OrderStatus[] | undefined {
    if (!statusParam) {
      return undefined;
    }

    const statusMap: Record<string, OrderStatus> = {
      pending: OrderStatus.PENDING,
      confirmed: OrderStatus.CONFIRMED,
      preparing: OrderStatus.PREPARING,
      ready: OrderStatus.READY,
      pickedup: OrderStatus.OUT_FOR_DELIVERY,
      delivered: OrderStatus.DELIVERED,
      cancelled: OrderStatus.CANCELLED,
    };

    const statuses = statusParam.split(',').map((s) => s.trim().toLowerCase());
    return statuses
      .map((s) => statusMap[s])
      .filter((s) => s !== undefined) as OrderStatus[];
  }

  /**
   * Map internal OrderStatus to admin UI status string
   */
  private mapOrderStatusToUiStatus(status: OrderStatus): string {
    const statusMap: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'Pending',
      [OrderStatus.CONFIRMED]: 'Confirmed',
      [OrderStatus.PREPARING]: 'Preparing',
      [OrderStatus.READY]: 'Ready',
      [OrderStatus.OUT_FOR_DELIVERY]: 'Picked Up',
      [OrderStatus.DELIVERED]: 'Delivered',
      [OrderStatus.CANCELLED]: 'Cancelled',
    };
    return statusMap[status] || status;
  }

  /**
   * Map delivery type to UI type string
   */
  private mapDeliveryTypeToUiType(
    deliveryType: DeliveryType,
  ): 'Delivery' | 'Pickup' {
    return deliveryType === DeliveryType.DOOR_DELIVERY ? 'Delivery' : 'Pickup';
  }

  /**
   * Calculate time remaining until estimated delivery
   */
  private calculateTimeRemaining(estimatedDeliveryTime?: Date): string | undefined {
    if (!estimatedDeliveryTime) {
      return undefined;
    }

    const now = new Date();
    const diff = estimatedDeliveryTime.getTime() - now.getTime();

    if (diff <= 0) {
      return 'Overdue';
    }

    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  /**
   * Format order for list view (admin row)
   */
  async formatOrderRow(order: OrderDocument): Promise<AdminOrderRowDto> {
    // Get customer info
    const customer = await this.authRepository.findUserById(
      order.userId.toString(),
    );

    return {
      id: order._id.toString(),
      orderNo: order.orderNumber,
      customerName: customer
        ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
        : 'Unknown Customer',
      customerAvatarUrl: customer?.avatar,
      timeRemaining: this.calculateTimeRemaining(order.estimatedDeliveryTime),
      itemsCount: order.itemCount,
      type: this.mapDeliveryTypeToUiType(order.deliveryType),
      status: this.mapOrderStatusToUiStatus(order.status),
      amount: order.total,
      assignedRiderId: order.assignedRiderId
        ? order.assignedRiderId.toString()
        : null,
    };
  }

  /**
   * Format order for details view
   */
  async formatOrderDetails(
    order: OrderDocument,
  ): Promise<AdminOrderDetailsDto> {
    // Get customer info
    const customer = await this.authRepository.findUserById(
      order.userId.toString(),
    );

    // Get order items
    const orderItems = await this.ordersRepository.findOrderItemsByOrderId(
      order._id.toString(),
    );

    // Format items with extras
    const items: AdminOrderItemDto[] = [];
    for (const item of orderItems) {
      // Add main food item
      items.push({
        id: item._id.toString(),
        name: item.name,
        description: item.description || '',
        price: item.price,
        qty: item.quantity,
        imageUrl: item.imageUrl || '',
        category: 'food',
      });

      // Add extras as separate items
      const extras = await this.ordersRepository.findOrderExtrasByOrderItemId(
        item._id.toString(),
      );
      for (const extra of extras) {
        items.push({
          id: extra._id.toString(),
          name: extra.name,
          description: '',
          price: extra.price,
          qty: extra.quantity,
          imageUrl: '',
          category: 'extra',
        });
      }
    }

    // Get rider info if assigned
    let riderName: string | undefined;
    let riderPhone: string | undefined;
    if (order.assignedRiderId) {
      const riderProfile = await this.ridersRepository.findById(
        order.assignedRiderId.toString(),
      );
      if (riderProfile) {
        riderName =
          `${riderProfile.firstName || ''} ${riderProfile.lastName || ''}`.trim() ||
          undefined;
        riderPhone = riderProfile.phone;
      }
    }

    return {
      id: order._id.toString(),
      orderNo: order.orderNumber,
      type: this.mapDeliveryTypeToUiType(order.deliveryType),
      status: this.mapOrderStatusToUiStatus(order.status),
      assignedRiderId: order.assignedRiderId
        ? order.assignedRiderId.toString()
        : null,
      customerName: customer
        ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
        : 'Unknown Customer',
      customerAvatarUrl: customer?.avatar,
      customerPhone: customer?.phone || '',
      deliveryAddress: order.deliveryAddress?.address,
      createdAt: order.createdAt?.toISOString() || new Date().toISOString(),
      expectedDelivery:
        order.estimatedDeliveryTime?.toISOString() ||
        new Date().toISOString(),
      items,
      subtotal: order.subtotal,
      extras: order.extrasTotal,
      discount: order.discountAmount,
      deliveryFee: order.deliveryFee,
      total: order.total,
      riderName,
      riderPhone,
      deliveryConfirmationCode: order.deliveryConfirmationCode,
    };
  }

  /**
   * Get orders list with filters
   */
  async getOrders(pickupLocationId: string, dto: AdminGetOrdersDto) {
    // Parse date range
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (dto.from) {
      fromDate = new Date(dto.from);
      fromDate.setHours(0, 0, 0, 0);
    }

    if (dto.to) {
      toDate = new Date(dto.to);
      toDate.setHours(23, 59, 59, 999);
    }

    // Map statuses
    const statuses = this.mapStatusFilter(dto.status);

    // Get orders from repository
    const result = await this.ordersRepository.findByPickupLocationWithFilters(
      pickupLocationId,
      {
        statuses,
        from: fromDate,
        to: toDate,
        sort: dto.sort,
        direction: dto.direction,
        search: dto.search,
        customerId: dto.customerId,
        riderId: dto.riderId,
        page: dto.page,
        limit: dto.limit,
      },
    );

    // Format orders
    const orders = await Promise.all(
      result.items.map((order) => this.formatOrderRow(order)),
    );

    return {
      success: true,
      data: {
        items: orders,
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
      },
    };
  }

  /**
   * Check if an order belongs to the given pickup location.
   * Handles both ObjectId and populated document cases.
   */
  private orderBelongsToPickupLocation(
    order: OrderDocument,
    pickupLocationId: string,
  ): boolean {
    const pl: any = order.pickupLocationId;
    if (!pl) {
      return false;
    }

    // If it's a plain ObjectId
    if (pl instanceof Types.ObjectId) {
      return pl.toString() === pickupLocationId;
    }

    // If it's a populated document with _id
    if (pl._id) {
      return pl._id.toString() === pickupLocationId;
    }

    return false;
  }

  /**
   * Get order statistics for a pickup location
   */
  async getOrderStats(pickupLocationId: string) {
    const counts = await this.ordersRepository.getOrderCountsByStatus(
      new Types.ObjectId(pickupLocationId),
    );
    const todayRevenue = await this.ordersRepository.getTodayRevenue(
      new Types.ObjectId(pickupLocationId),
    );

    return {
      totalOrders:
        counts.pending +
        counts.confirmed +
        counts.preparing +
        counts.ready +
        counts[OrderStatus.OUT_FOR_DELIVERY] +
        counts.delivered +
        counts.cancelled,
      pendingOrders: counts.pending,
      confirmedOrders: counts.confirmed,
      preparingOrders: counts.preparing,
      readyOrders: counts.ready,
      outForDeliveryOrders: counts[OrderStatus.OUT_FOR_DELIVERY],
      deliveredOrders: counts.delivered,
      cancelledOrders: counts.cancelled,
      todayRevenue,
    };
  }

  /**
   * Get order details by ID
   */
  async getOrderById(pickupLocationId: string, orderId: string) {
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      return null;
    }

    // Verify order belongs to this pickup location
    if (!this.orderBelongsToPickupLocation(order, pickupLocationId)) {
      return null;
    }

    const orderDetails = await this.formatOrderDetails(order);

    return {
      success: true,
      data: orderDetails,
    };
  }

  /**
   * Map admin UI status to internal DeliveryStatus
   */
  private mapAdminStatusToDeliveryStatus(
    adminStatus: AdminOrderStatus,
  ): DeliveryStatus {
    const statusMap: Record<AdminOrderStatus, DeliveryStatus> = {
      [AdminOrderStatus.PENDING]: DeliveryStatus.PENDING,
      [AdminOrderStatus.CONFIRMED]: DeliveryStatus.PREPARING,
      [AdminOrderStatus.PREPARING]: DeliveryStatus.PREPARING,
      [AdminOrderStatus.READY]: DeliveryStatus.READY,
      [AdminOrderStatus.PICKED_UP]: DeliveryStatus.RIDER_PICKED_UP,
      [AdminOrderStatus.DELIVERED]: DeliveryStatus.DELIVERED,
      [AdminOrderStatus.CANCELLED]: DeliveryStatus.CANCELLED,
    };

    return statusMap[adminStatus];
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    pickupLocationId: string,
    orderId: string,
    dto: AdminUpdateOrderStatusDto,
    updatedById: string,
  ) {
    // Verify order exists and belongs to this pickup location
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    // Verify order belongs to this pickup location
    if (!this.orderBelongsToPickupLocation(order, pickupLocationId)) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message:
            'Order not found or does not belong to your pickup location',
        },
      });
    }

    // Validate cancellation reason
    if (dto.status === AdminOrderStatus.CANCELLED && !dto.reason) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'REASON_REQUIRED',
          message: 'Cancellation reason is required',
        },
      });
    }

    // Map admin status to delivery status
    const deliveryStatus = this.mapAdminStatusToDeliveryStatus(dto.status);

    // Delegate to OrdersService.updateOrderStatus
    await this.ordersService.updateOrderStatus(
      orderId,
      {
        status: deliveryStatus,
        message: dto.reason,
      },
      updatedById,
    );

    // Return formatted order details
    const updatedOrder = await this.ordersRepository.findById(orderId);
    if (!updatedOrder) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
      });
    }

    const orderDetails = await this.formatOrderDetails(updatedOrder);

    return {
      success: true,
      message: 'Order status updated successfully',
      data: orderDetails,
    };
  }
}
