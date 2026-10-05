import { Global, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { IdempotencyModule } from './idempotency/idempotency.module.js';
import { DeferredTaskRunner } from './scheduling/deferred-task-runner.js';
import { SecurityModule } from './security/security.module.js';

/** Capa transversal: auth OAuth2/scopes, idempotencia, rate limiting y tareas diferidas en toda la app. */
@Global()
@Module({
  imports: [AuthModule, IdempotencyModule, SecurityModule],
  providers: [DeferredTaskRunner],
  exports: [AuthModule, IdempotencyModule, DeferredTaskRunner],
})
export class CommonModule {}
