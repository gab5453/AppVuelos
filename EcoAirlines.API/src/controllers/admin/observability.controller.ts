import { Controller, Get, UseGuards } from '@nestjs/common';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { ADMIN_SCOPE } from '../../auth/extension-scopes.js';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import { HttpMetricsStore, type ObservabilitySnapshot } from '../../observability/http-metrics.store.js';

/** Observabilidad del backend — **extensión fuera del contrato**, solo para administradores. */
@Controller('admin/observability')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
@Scopes(ADMIN_SCOPE)
export class ObservabilityController {
  constructor(private readonly metrics: HttpMetricsStore) {}

  @Get()
  getSnapshot(): ObservabilitySnapshot {
    return this.metrics.snapshot();
  }
}
