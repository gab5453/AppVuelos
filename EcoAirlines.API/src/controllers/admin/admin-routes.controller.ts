import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  AdminRoutesQueryDto,
  ScheduledRouteRequestDto,
  type ScheduledRouteDto,
} from '@ecoairlines/business/dto/admin/scheduled-route.dto.js';
import { AdminRoutesService } from '@ecoairlines/business/services/admin/admin-routes.service.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { ADMIN_SCOPE } from '../../auth/extension-scopes.js';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import { ForbidUnknownPropertiesGuard } from '../../guards/forbid-unknown-properties.guard.js';

const ROUTE_FIELDS = ['origin', 'destination', 'outboundDepartureLocal', 'inboundDepartureLocal', 'weekdays', 'aircraftType', 'aircraft'];

/**
 * CRUD de **rutas programadas** — extensión fuera del contrato (`contract/ecoairlines-extensions.yaml`). Exige el scope
 * `ecoairlines:admin`. Cada cambio se publica en el GDS: la búsqueda y la venta ven el horario nuevo al instante.
 */
@Controller('admin/routes')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
@Scopes(ADMIN_SCOPE)
export class AdminRoutesController {
  constructor(private readonly routes: AdminRoutesService) {}

  @Get()
  list(@Query() query: AdminRoutesQueryDto): Promise<ScheduledRouteDto[]> {
    return this.routes.list({ airport: query.airport });
  }

  @Get(':routeId')
  get(@Param('routeId') routeId: string): Promise<ScheduledRouteDto> {
    return this.routes.get(routeId);
  }

  @Post()
  @UseGuards(new ForbidUnknownPropertiesGuard({ root: ROUTE_FIELDS }))
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: ScheduledRouteRequestDto): Promise<ScheduledRouteDto> {
    return this.routes.create(body, user.sub);
  }

  @Put(':routeId')
  @UseGuards(new ForbidUnknownPropertiesGuard({ root: ROUTE_FIELDS }))
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('routeId') routeId: string,
    @Body() body: ScheduledRouteRequestDto,
  ): Promise<ScheduledRouteDto> {
    return this.routes.update(routeId, body, user.sub);
  }

  @Delete(':routeId')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('routeId') routeId: string): Promise<void> {
    await this.routes.remove(routeId, user.sub);
  }
}
