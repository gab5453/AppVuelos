import { ArgumentsHost, BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ProblemDetailsException } from './problem-details.exception.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

function makeHost(headersSent = false) {
  const response = {
    headersSent,
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    contentTypeValue: '',
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    contentType(value: string) {
      this.contentTypeValue = value;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const request = { method: 'GET', path: '/x' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ProblemDetailsFilter', () => {
  const filter = new ProblemDetailsFilter();
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorLog.mockRestore();
  });

  it('responde ProblemDetailsException tal cual, con Retry-After si corresponde', () => {
    const { host, response } = makeHost();
    filter.catch(
      new ProblemDetailsException({ status: 429, code: 'RATE_LIMIT_EXCEEDED', title: 'Demasiadas', retryAfterSeconds: 30 }),
      host,
    );

    expect(response.statusCode).toBe(429);
    expect(response.contentTypeValue).toBe('application/problem+json');
    expect(response.headers['Retry-After']).toBe('30');
    expect(response.body).toEqual({ type: 'about:blank', title: 'Demasiadas', status: 429, code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('convierte una HttpException 4xx nativa en ProblemDetails con título estándar', () => {
    const { host, response } = makeHost();
    filter.catch(new NotFoundException('Cannot GET /nope'), host);

    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'VALIDATION_FAILED',
      detail: 'Cannot GET /nope',
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('el body de error de ParseUUIDPipe cumple el schema (sin propiedades extra)', () => {
    const { host, response } = makeHost();
    filter.catch(new BadRequestException('Validation failed (uuid is expected)'), host);
    expect(Object.keys(response.body as object).sort()).toEqual(['code', 'detail', 'status', 'title', 'type']);
  });

  it('un error inesperado responde 500 genérico, sin mensaje ni stack, y se registra en el log', () => {
    const { host, response } = makeHost();
    filter.catch(new Error('connection refused: postgres://admin:s3cr3t@db'), host);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'VALIDATION_FAILED',
    });
    expect(JSON.stringify(response.body)).not.toContain('s3cr3t');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
  });

  it('una HttpException 5xx tampoco expone su mensaje', () => {
    const { host, response } = makeHost();
    filter.catch(new HttpException('detalle interno del upstream', 502), host);
    expect(response.body).toEqual({ type: 'about:blank', title: 'Bad Gateway', status: 502, code: 'VALIDATION_FAILED' });
  });

  it('si la respuesta ya se envió, solo registra el error', () => {
    const { host, response } = makeHost(true);
    filter.catch(new Error('tarde'), host);
    expect(response.body).toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
  });
});
