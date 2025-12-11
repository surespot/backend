import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUser {
  id: string;
  role: string;
  email?: string;
  phone?: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUser => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const request = ctx.switchToHttp().getRequest() as Request & {
      user: CurrentUser;
    };
    return request.user;
  },
);
