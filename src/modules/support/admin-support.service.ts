import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportRepository } from './support.repository';
import { OrdersRepository } from '../orders/orders.repository';
import { MailService } from '../mail/mail.service';
import { UpdateSupportStatusDto } from './dto/update-support-status.dto';
import { AdminGetSupportDto } from './dto/admin-get-support.dto';
import { SupportRequestSource } from './schemas/support-request.schema';

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly supportRepository: SupportRepository,
    private readonly ordersRepository: OrdersRepository,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async getAll(filter: AdminGetSupportDto) {
    return this.supportRepository.findAll({
      page: filter.page,
      limit: filter.limit,
      submitterRole: filter.submitterRole,
      status: filter.status,
    });
  }

  async getById(id: string) {
    const request = await this.supportRepository.findByIdWithPopulatedUser(id);
    if (!request) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Support request not found',
        },
      });
    }

    const user = request.userId as unknown as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };
    const userName =
      user?.firstName && user?.lastName
        ? `${user.firstName} ${user.lastName}`
        : 'Unknown';

    let orderDetails: Record<string, unknown> | null = null;
    if (request.orderId) {
      const orderIdStr =
        typeof request.orderId === 'object' &&
        request.orderId !== null &&
        '_id' in request.orderId
          ? (request.orderId as { _id: { toString(): string } })._id.toString()
          : String(request.orderId);
      const order = await this.ordersRepository.findById(orderIdStr);
      if (order) {
        const orderItems =
          await this.ordersRepository.findOrderItemsByOrderId(
            order._id.toString(),
          );
        const itemsWithExtras = await Promise.all(
          orderItems.map(async (item) => {
            const extras =
              await this.ordersRepository.findOrderExtrasByOrderItemId(
                item._id.toString(),
              );
            const extrasStr =
              extras.length > 0
                ? extras.map((e) => `${e.name} x${e.quantity}`).join(', ')
                : null;
            return {
              name: `${item.name} x${item.quantity}`,
              extras: extrasStr,
            };
          }),
        );
        const itemsStr = itemsWithExtras.map((i) => i.name).join(', ');
        const extrasStr = itemsWithExtras
          .map((i) => i.extras)
          .filter(Boolean)
          .join('; ');

        orderDetails = {
          orderNumber: order.orderNumber,
          items: itemsStr,
          extras: extrasStr || '',
          total: order.total,
          formattedTotal: this.formatPrice(order.total),
          date: order.createdAt?.toISOString(),
        };
      }
    }

    return {
      id: request._id.toString(),
      submitterRole: request.submitterRole,
      status: request.status,
      source: request.source,
      category: request.category,
      type: request.type,
      title: request.title,
      description: request.description,
      contactPhone: request.contactPhone,
      attachments: request.attachments,
      stepsToReproduce: request.stepsToReproduce,
      areaAffected: request.areaAffected,
      issueType: request.issueType,
      createdAt: request.createdAt?.toISOString(),
      user: {
        name: userName,
        email: user?.email ?? '',
        phone: user?.phone ?? request.contactPhone,
      },
      orderDetails,
    };
  }

  async updateStatus(id: string, dto: UpdateSupportStatusDto) {
    const request = await this.supportRepository.updateStatus(id, dto.status);
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

  async forwardBugReportToDevelopers(id: string): Promise<void> {
    const request = await this.supportRepository.findByIdWithPopulatedUser(id);
    if (!request) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Support request not found',
        },
      });
    }

    if (request.source !== SupportRequestSource.BUG_REPORT) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NOT_BUG_REPORT',
          message:
            'Only bug reports can be forwarded to developers. This request is not a bug report.',
        },
      });
    }

    const emailsStr = this.configService.get<string>(
      'BUG_REPORT_DEVELOPER_EMAILS',
      '',
    );
    const developerEmails = emailsStr
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    if (developerEmails.length === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'NO_DEVELOPER_EMAILS',
          message:
            'No developer emails configured. Set BUG_REPORT_DEVELOPER_EMAILS in .env',
        },
      });
    }

    const user = request.userId as unknown as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    };
    const submitterName =
      user?.firstName && user?.lastName
        ? `${user.firstName} ${user.lastName}`
        : 'Unknown';

    const submittedAt = request.createdAt
      ? new Date(request.createdAt).toLocaleString('en-NG', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'Unknown';

    await this.mailService.sendBugReportEmail({
      to: developerEmails,
      reportId: request._id.toString(),
      submitterName,
      submitterRole: request.submitterRole,
      submitterEmail: user?.email ?? 'N/A',
      submitterPhone: request.contactPhone,
      submittedAt,
      title: request.title,
      description: request.description,
      issueType: request.issueType,
      areaAffected: request.areaAffected,
      stepsToReproduce: request.stepsToReproduce,
      attachmentUrls: request.attachments ?? [],
    });
  }

  private formatPrice(price: number): string {
    if (price === 0) return '₦0';
    const amount = price / 100;
    return `₦${amount.toLocaleString('en-NG')}`;
  }
}
