import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      // NestJS ValidationPipe errors come back as objects — preserve them
      message = typeof res === 'string' ? res : (res as any).message ?? res;
    } else if (isClientError(exception)) {
      // Express body-parser errors (payload too large, malformed JSON) are plain
      // Errors carrying a 4xx status; report them as the client error they are.
      status = exception.status;
      message =
        exception.type === 'entity.too.large'
          ? 'Request body too large'
          : exception.type === 'entity.parse.failed'
            ? 'Malformed JSON body'
            : 'Bad request';
    } else if (exception instanceof Error) {
      // Never expose raw Prisma / DB errors — just log internally
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}

/** body-parser (http-errors) style error: a 4xx `status` and a `type` tag. */
function isClientError(e: unknown): e is Error & { status: number; type: string } {
  if (!(e instanceof Error)) return false;
  const { status, type } = e as { status?: unknown; type?: unknown };
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    typeof type === 'string' &&
    type.startsWith('entity.')
  );
}
