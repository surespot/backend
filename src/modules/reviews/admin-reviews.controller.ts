import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { ReviewsModerationService } from './reviews-moderation.service';
import {
  AdminGetReviewsDto,
  HideReviewDto,
  ReviewKind,
} from './dto/admin-reviews.dto';

@ApiTags('Admin Reviews')
@Controller('admin/reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReviewsController {
  constructor(private readonly moderation: ReviewsModerationService) {}

  @Get()
  @ApiOperation({
    summary: 'List reviews for moderation',
    description:
      "`type=items` lists reviews left on a single item; `type=orders` lists whole-order reviews (their rating is copied onto the order's items, and moderating one covers all of them).",
  })
  list(@Query() query: AdminGetReviewsDto) {
    return this.moderation.list(query);
  }

  @Post(':type/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'type', enum: ReviewKind })
  @ApiOperation({
    summary: 'Approve a review (grants its reward, if it earned one)',
  })
  approve(
    @Param('type', new ParseEnumPipe(ReviewKind)) type: ReviewKind,
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.moderation.approve(type, id, user.id);
  }

  @Post(':type/:id/hide')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'type', enum: ReviewKind })
  @ApiOperation({
    summary: 'Hide a review',
    description:
      'A hidden review no longer counts toward ratings or shows anywhere. Its unused reward is revoked.',
  })
  hide(
    @Param('type', new ParseEnumPipe(ReviewKind)) type: ReviewKind,
    @Param('id') id: string,
    @Body() dto: HideReviewDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.moderation.hide(type, id, user.id, dto.reason);
  }

  @Post(':type/:id/unhide')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'type', enum: ReviewKind })
  @ApiOperation({
    summary: 'Restore a hidden review',
    description:
      'It returns to pending and counts toward ratings again. Approve it again to re-grant its reward.',
  })
  unhide(
    @Param('type', new ParseEnumPipe(ReviewKind)) type: ReviewKind,
    @Param('id') id: string,
  ) {
    return this.moderation.unhide(type, id);
  }
}
