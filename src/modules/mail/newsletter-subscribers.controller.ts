import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NewsletterSubscribersService } from './newsletter-subscribers.service';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterSubscribersController {
  constructor(private readonly subscribers: NewsletterSubscribersService) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  // 5 sign-ups per minute per IP (throttler v6 ttl is in milliseconds)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Subscribe to the Surespot newsletter (Public - no auth required)',
  })
  @ApiResponse({ status: 200, description: 'Subscribed (idempotent)' })
  @ApiResponse({ status: 400, description: 'Invalid email or phone number' })
  async subscribe(@Body() dto: SubscribeNewsletterDto) {
    await this.subscribers.subscribe(dto);
    // Same response for new and existing contacts, so the endpoint can't be
    // used to probe which addresses are already subscribed.
    return { success: true, message: "You're subscribed. Thanks for joining!" };
  }
}
