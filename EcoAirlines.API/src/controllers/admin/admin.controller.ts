import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { PassengerItem } from '@ecoairlines/data-access/common/contract/common.types.js';
import {
  AdminFlightQueryDto,
  UpdateFlightStatusRequestDto,
  type AdminDashboardStatsDto,
} from '@ecoairlines/business/dto/admin/admin.dto.js';
import type { FlightStatusDto } from '@ecoairlines/business/dto/flight-status/flight-status.dto.js';
import { AdminService } from '@ecoairlines/business/services/admin/admin.service.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { ADMIN_SCOPE } from '../../auth/extension-scopes.js';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import { ForbidUnknownPropertiesGuard } from '../../guards/forbid-unknown-properties.guard.js';

/**
 * Administración — **extensión fuera del contrato** (`contract/ecoairlines-extensions.yaml`), con las rutas y
 * campos de la plantilla del grupo. A diferencia de la plantilla, exige un JWT con el scope `ecoairlines:admin`:
 * sin token responde 401 y con un token de cliente 403.
 */
@Controller('admin')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
@Scopes(ADMIN_SCOPE)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard-stats')
  getDashboardStats(): Promise<AdminDashboardStatsDto> {
    return this.adminService.getDashboardStats();
  }

  @Put('flights/:flightNumber/status')
  @UseGuards(new ForbidUnknownPropertiesGuard({ root: ['status'] }))
  updateFlightStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('flightNumber') flightNumber: string,
    @Query() query: AdminFlightQueryDto,
    @Body() body: UpdateFlightStatusRequestDto,
  ): Promise<FlightStatusDto> {
    return this.adminService.updateFlightStatus(flightNumber, body.status, user.sub, query.date);
  }

  @Get('flights/:flightNumber/passengers')
  getFlightPassengers(
    @Param('flightNumber') flightNumber: string,
    @Query() query: AdminFlightQueryDto,
  ): Promise<PassengerItem[]> {
    return this.adminService.getFlightPassengers(flightNumber, query.date);
  }
}
