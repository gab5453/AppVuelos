import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import { ProblemDetailsException } from '../problem-details/problem-details.exception.js';
import { ProblemDetailsThrottlerGuard } from './problem-details-throttler.guard.js';

/** Expone el método protegido que arma la respuesta al superar el límite. */
class TestableGuard extends ProblemDetailsThrottlerGuard {
  exceed(detail: ThrottlerLimitDetail): Promise<void> {
    return this.throwThrottlingException({} as ExecutionContext, detail);
  }
}

function detail(timeToBlockExpire: number): ThrottlerLimitDetail {
  return { limit: 30, ttl: 60_000, key: 'k', tracker: '127.0.0.1', totalHits: 31, timeToExpire: 60, isBlocked: true, timeToBlockExpire };
}

describe('ProblemDetailsThrottlerGuard', () => {
  const guard = Object.create(TestableGuard.prototype) as TestableGuard;

  it('responde el ProblemDetails429 del contrato: RATE_LIMIT_EXCEEDED con Retry-After', async () => {
    const error = await guard.exceed(detail(42)).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProblemDetailsException);
    const exception = error as ProblemDetailsException;
    expect(exception.getStatus()).toBe(429);
    expect(exception.retryAfterSeconds).toBe(42);
    expect(exception.getResponse()).toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED', type: 'about:blank' });
  });

  it('nunca informa un Retry-After menor a 1 segundo', async () => {
    const error = (await guard.exceed(detail(0)).catch((caught: unknown) => caught)) as ProblemDetailsException;
    expect(error.retryAfterSeconds).toBe(1);
  });
});
