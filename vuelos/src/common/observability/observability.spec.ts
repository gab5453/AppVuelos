import { EventEmitter } from 'node:events';
import type { LoggerService } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createAccessLogMiddleware, isAccessLogEnabled } from './access-log.middleware.js';
import { REQUEST_ID_HEADER, getRequestId, requestIdMiddleware } from './request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fakeRequest(headers: Record<string, string> = {}, extra: Record<string, unknown> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    headers,
    method: 'GET',
    originalUrl: '/bookings?pnr=ABC123',
    ip: '203.0.113.7',
    ...extra,
  } as unknown as Request;
}

function fakeResponse(statusCode = 200) {
  const emitter = new EventEmitter();
  const headers: Record<string, string> = {};
  const response = Object.assign(emitter, {
    statusCode,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  });
  return { response: response as unknown as Response & EventEmitter, headers };
}

describe('requestIdMiddleware', () => {
  it('genera un UUID cuando el cliente no envía X-Request-Id', () => {
    const req = fakeRequest();
    const { response, headers } = fakeResponse();
    requestIdMiddleware(req, response, () => undefined);

    expect(getRequestId(req)).toMatch(UUID);
    expect(headers[REQUEST_ID_HEADER]).toBe(getRequestId(req));
  });

  it('respeta un X-Request-Id entrante si es un UUID', () => {
    const incoming = '3f2b8a52-6f0e-4a8e-9b1c-0d7e5a4c3b21';
    const req = fakeRequest({ 'x-request-id': incoming });
    requestIdMiddleware(req, fakeResponse().response, () => undefined);
    expect(getRequestId(req)).toBe(incoming);
  });

  it('reemplaza un X-Request-Id que no es UUID (evita inyección en logs)', () => {
    const req = fakeRequest({ 'x-request-id': 'abc\n[ERROR] fake log line' });
    requestIdMiddleware(req, fakeResponse().response, () => undefined);
    expect(getRequestId(req)).toMatch(UUID);
  });
});

describe('access log', () => {
  function capture() {
    const lines: { level: string; entry: Record<string, unknown> }[] = [];
    const logger: LoggerService = {
      log: (message: string) => lines.push({ level: 'log', entry: JSON.parse(message) }),
      warn: (message: string) => lines.push({ level: 'warn', entry: JSON.parse(message) }),
      error: (message: string) => lines.push({ level: 'error', entry: JSON.parse(message) }),
    };
    return { lines, logger };
  }

  it('registra una línea JSON sin query string, headers ni body', () => {
    const { lines, logger } = capture();
    const req = fakeRequest(
      { authorization: 'Bearer secret-token', 'idempotency-key': 'k' },
      { body: { payment: { paymentReference: 'pay_1' } }, user: { sub: 'user-1', scopes: [] } },
    );
    const { response } = fakeResponse(201);

    createAccessLogMiddleware(logger)(req, response, () => undefined);
    response.emit('finish');

    expect(lines).toHaveLength(1);
    expect(lines[0]!.entry).toMatchObject({ method: 'GET', path: '/bookings', status: 201, ip: '203.0.113.7', sub: 'user-1' });
    const serialized = JSON.stringify(lines[0]!.entry);
    for (const forbidden of ['secret-token', 'pnr', 'ABC123', 'pay_1', 'idempotency']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('usa el nivel según el status (4xx warn, 5xx error)', () => {
    const { lines, logger } = capture();
    for (const status of [404, 503]) {
      const { response } = fakeResponse(status);
      createAccessLogMiddleware(logger)(fakeRequest(), response, () => undefined);
      response.emit('finish');
    }
    expect(lines.map((line) => line.level)).toEqual(['warn', 'error']);
  });

  it('está desactivado por defecto en pruebas y activo en el resto', () => {
    expect(isAccessLogEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(isAccessLogEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(isAccessLogEnabled({ NODE_ENV: 'test', HTTP_ACCESS_LOG: 'true' })).toBe(true);
  });
});
