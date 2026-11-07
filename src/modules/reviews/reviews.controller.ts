import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import {
  SubmitItemReviewsDto,
  SubmitOrderReviewDto,
} from './dto/submit-reviews.dto';

@ApiTags('reviews')
@Controller('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('pending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Order the customer should be asked to review (call on app open)',
    description:
      'Returns the most recently delivered order (within 2 days of delivery) that has not been reviewed or skipped and still has an unreviewed item, plus how many are queued and whether reviewing currently earns a special reward. `prompt` is null when there is nothing to ask. After the customer submits or skips, call again for the next order.',
  })
  @ApiResponse({ status: 200, description: 'Pending review prompt' })
  getPending(@CurrentUser() user: { id: string; isDemo?: boolean }) {
    return this.reviewsService.getPending(user.id, user.isDemo ?? false);
  }

  @Post('orders/:orderId/item-reviews')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Review individual items of an order' })
  submitItemReviews(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
    @Body() dto: SubmitItemReviewsDto,
  ) {
    return this.reviewsService.submitItemReviews(user.id, orderId, dto);
  }

  @Post('orders/:orderId/order-review')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Review a whole order',
    description:
      'The rating and comment are applied to every item of the order the customer has not already reviewed.',
  })
  submitOrderReview(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
    @Body() dto: SubmitOrderReviewDto,
  ) {
    return this.reviewsService.submitOrderReview(user.id, orderId, dto);
  }

  @Post('orders/:orderId/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Skip reviewing an order',
    description: 'The order leaves the queue and is not asked about again.',
  })
  dismiss(
    @CurrentUser() user: { id: string },
    @Param('orderId') orderId: string,
  ) {
    return this.reviewsService.dismiss(user.id, orderId);
  }
}
