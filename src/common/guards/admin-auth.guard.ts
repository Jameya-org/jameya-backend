import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RequestWithUser } from '../types/request-with-user.interface';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const roles = request.user?.roles ?? [];

    if (!roles.includes('admin')) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
