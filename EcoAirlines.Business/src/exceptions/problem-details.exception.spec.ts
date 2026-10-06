import { describe, expect, it } from 'vitest';
import { ProblemDetailsException } from './problem-details.exception.js';

describe('ProblemDetailsException', () => {
  it('produces a body matching the ProblemDetails schema', () => {
    const exception = new ProblemDetailsException({
      status: 409,
      code: 'SEAT_TAKEN',
      title: 'El asiento ya fue tomado.',
      retryAfterSeconds: 5,
    });

    expect(exception.getStatus()).toBe(409);
    expect(exception.retryAfterSeconds).toBe(5);
    expect(exception.getResponse()).toMatchObject({
      type: 'about:blank',
      title: 'El asiento ya fue tomado.',
      status: 409,
      code: 'SEAT_TAKEN',
    });
  });

  it('omits detail and invalidParams when not provided', () => {
    const exception = new ProblemDetailsException({
      status: 400,
      code: 'VALIDATION_FAILED',
      title: 'Petición inválida.',
    });

    const body = exception.getResponse() as Record<string, unknown>;
    expect(body).not.toHaveProperty('detail');
    expect(body).not.toHaveProperty('invalidParams');
  });
});
