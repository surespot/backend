import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_IN_DEVELOPMENT_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public (optional, for future use)
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isPublicInDevelopment = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_IN_DEVELOPMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublicInDevelopment && process.env.NODE_ENV === 'development') {
      return true;
    }

    return super.canActivate(context);
  }
}
