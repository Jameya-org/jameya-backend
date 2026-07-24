import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { id: string };
    }>();

    return next.handle().pipe(
      tap(() => {
        // TODO: persist audit log entry
        void request.method;
        void request.url;
        void request.user?.id;
      }),
    );
  }
}
