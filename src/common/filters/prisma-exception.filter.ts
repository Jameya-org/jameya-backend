import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(Error)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // TODO: map Prisma error codes to HTTP responses
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: exception.message,
    });
  }
}
