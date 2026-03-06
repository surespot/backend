import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { SupportRepository } from './support.repository';
import { OrdersRepository } from '../orders/orders.repository';
import { STORAGE_SERVICE } from '../../common/storage/storage.constants';
import type { IStorageService } from '../../common/storage/interfaces/storage.interface';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { GetSupportRequestsFilterDto } from './dto/get-support-requests-filter.dto';
import { SubmitterRole } from './schemas/support-request.schema';
import { UserRole } from '../auth/schemas/user.schema';
import { SupportRequestDocument } from './schemas/support-request.schema';

@Injectable()
export class SupportService {
  constructor(
    private readonly supportRepository: SupportRepository,
    private readonly ordersRepository: OrdersRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  private toSubmitterRole(role: string): SubmitterRole {
    if (role === UserRole.RIDER || role === 'rider') {
      return SubmitterRole.RIDER;
    }
    if (role === UserRole.USER || role === 'user') {
      return SubmitterRole.CUSTOMER;
    }
    throw new ForbiddenException({
      success: false,
      error: {
        code: 'INVALID_ROLE',
        message: 'Only customers and riders can submit support requests',
      },
    });
  }

  async submit(
    userId: string,
    userRole: string,
    dto: CreateSupportRequestDto,
    files: Express.Multer.File[] = [],
  ): Promise<SupportRequestDocument> {
    const submitterRole = this.toSubmitterRole(userRole);

    if (dto.orderId) {
      const order = await this.ordersRepository.findById(dto.orderId);
      if (!order) {
        throw new BadRequestException({
          success: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order not found',
          },
        });
      }
      const orderUserId =
        typeof order.userId === 'object' &&
        order.userId !== null &&
        '_id' in order.userId
          ? (order.userId as { _id: { toString(): string } })._id.toString()
          : String(order.userId);
      if (orderUserId !== userId) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: 'ORDER_ACCESS_DENIED',
            message: 'You can only link support requests to your own orders',
          },
        });
      }
    }

    let attachments: string[] = [];
    if (files && files.length > 0) {
      const uploads = await Promise.all(
        files.slice(0, 3).map((file) => this.upload(file)),
      );
      attachments = uploads.map((u) => u.url);
    }

    return this.supportRepository.create({
      submitterRole,
      userId,
      source: dto.source,
      category: dto.category,
      type: dto.type,
      description: dto.description,
      contactPhone: dto.contactPhone,
      orderId: dto.orderId,
      title: dto.title,
      attachments,
      stepsToReproduce: dto.stepsToReproduce,
      areaAffected: dto.areaAffected,
      issueType: dto.issueType,
    });
  }

  async listOwn(userId: string, filter: GetSupportRequestsFilterDto) {
    return this.supportRepository.findByUserId(userId, {
      page: filter.page,
      limit: filter.limit,
      status: filter.status,
    });
  }

  async getOwnById(
    id: string,
    userId: string,
  ): Promise<SupportRequestDocument> {
    const request = await this.supportRepository.findByIdForUser(id, userId);
    if (!request) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Support request not found',
        },
      });
    }
    return request;
  }

  async upload(file: Express.Multer.File): Promise<{ url: string }> {
    const result = await this.storageService.uploadImage(file);
    return { url: result.secure_url };
  }
}
