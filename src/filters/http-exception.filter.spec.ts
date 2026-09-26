import { BadRequestException } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host: any = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/x' }),
    }),
  };
  new GlobalExceptionFilter().catch(exception, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

// body-parser / http-errors style errors
const bodyParserError = (status: number, type: string) =>
  Object.assign(new Error('raw internal message'), { status, type });

describe('GlobalExceptionFilter', () => {
  it('keeps NestJS HttpExceptions as they are', () => {
    const r = run(new BadRequestException('nope'));
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('nope');
  });

  it('reports an oversized body as 413, not 500', () => {
    const r = run(bodyParserError(413, 'entity.too.large'));
    expect(r.status).toBe(413);
    expect(r.body.message).toBe('Request body too large');
  });

  it('reports malformed JSON as 400, not 500', () => {
    const r = run(bodyParserError(400, 'entity.parse.failed'));
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Malformed JSON body');
  });

  it('still hides unknown errors behind a generic 500', () => {
    const r = run(new Error('prisma exploded: secret connection string'));
    expect(r.status).toBe(500);
    expect(r.body.message).toBe('Internal server error');
  });

  it('does not trust arbitrary errors that merely have a 4xx status', () => {
    const r = run(Object.assign(new Error('secret'), { status: 418 }));
    expect(r.status).toBe(500);
  });
});
