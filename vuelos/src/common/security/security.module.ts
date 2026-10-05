import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { loadSecurityConfig } from './security.config.js';
import { ProblemDetailsThrottlerGuard } from './problem-details-throttler.guard.js';

/**
 * Rate limiting global. El almacenamiento es en memoria (por instancia); al escalar
 * horizontalmente debe reemplazarse por un ThrottlerStorage compartido (p. ej. Redis).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const { rateLimit } = loadSecurityConfig();
        return { throttlers: [{ name: 'default', ttl: rateLimit.ttlMs, limit: rateLimit.limit }] };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ProblemDetailsThrottlerGuard }],
})
export class SecurityModule {}
