import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_IN_DEVELOPMENT_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UserRole } from '../schemas/user.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublicInDevelopment = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_IN_DEVELOPMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublicInDevelopment && process.env.NODE_ENV === 'development') {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest() as Request & {
      user?: CurrentUser;
    };

    const user = request.user;

    if (!user || !user.role || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        },
      });
    }

    return true;
  }
}
