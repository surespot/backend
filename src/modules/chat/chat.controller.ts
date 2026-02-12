import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { GetConversationsDto } from './dto/get-conversations.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('chat')
@Controller('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user conversations' })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConversations(
    @CurrentUser() user: { id: string },
    @Query() dto: GetConversationsDto,
  ) {
    return this.chatService.getConversationsForUser(user.id, {
      page: dto.page,
      limit: dto.limit,
      type: dto.type,
    });
  }

  @Get('conversations/order/:orderId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get conversation for an order' })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order or conversation not found' })
  async getConversationByOrder(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
  ) {
    return this.chatService.findOrCreateOrderConversation(orderId, user.id);
  }

  @Get('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get messages for a conversation' })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getMessages(
    @CurrentUser() user: { id: string },
    @Param('id') conversationId: string,
    @Query() dto: GetMessagesDto,
  ) {
    return this.chatService.getMessages(
      conversationId,
      user.id,
      dto.cursor,
      dto.limit,
    );
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('attachments', 10)) // Max 10 attachments
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Send a message' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'Order ID',
          example: '507f1f77bcf86cd799439011',
        },
        content: {
          type: 'string',
          description: 'Message content',
          example: 'I am on my way to deliver your order',
          maxLength: 5000,
        },
        attachments: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Optional attachments (images or files)',
        },
      },
      required: ['orderId', 'content'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Order or conversation not found' })
  async sendMessage(
    @CurrentUser() user: { id: string },
    @Body() dto: SendMessageDto,
    @UploadedFiles() attachments?: Express.Multer.File[],
  ) {
    // Validate required fields
    if (!dto.orderId || !dto.content) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'orderId and content are required',
        },
      });
    }

    return this.chatService.sendMessage(
      user.id,
      dto.orderId,
      dto.content,
      attachments,
    );
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation as read' })
  @ApiResponse({
    status: 200,
    description: 'Conversation marked as read',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async markRead(
    @CurrentUser() user: { id: string },
    @Param('id') conversationId: string,
  ) {
    return this.chatService.markRead(conversationId, user.id);
  }
}
