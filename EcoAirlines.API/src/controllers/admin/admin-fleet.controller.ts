import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  AircraftQueryDto,
  AircraftRequestDto,
  UpdateAircraftRequestDto,
  type AircraftDto,
  type AircraftTypeDto,
} from '@ecoairlines/business/dto/admin/fleet.dto.js';
import { AdminFleetService } from '@ecoairlines/business/services/admin/admin-fleet.service.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { ADMIN_SCOPE } from '../../auth/extension-scopes.js';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import { ForbidUnknownPropertiesGuard } from '../../guards/forbid-unknown-properties.guard.js';

/**
 * CRUD de la **flota** — extensión fuera del contrato (`contract/ecoairlines-extensions.yaml`). Exige `ecoairlines:admin`.
 * Los tipos de avión se consultan (`GET /admin/aircraft-types`); los aviones se registran, cambian de base y se retiran.
 */
@Controller('admin')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
@Scopes(ADMIN_SCOPE)
export class AdminFleetController {
  constructor(private readonly fleet: AdminFleetService) {}

  @Get('aircraft-types')
  listTypes(): Promise<AircraftTypeDto[]> {
    return this.fleet.listTypes();
  }

  @Get('aircraft')
  list(@Query() query: AircraftQueryDto): Promise<AircraftDto[]> {
    return this.fleet.list({ base: query.base, aircraftType: query.aircraftType });
  }

  @Get('aircraft/:registration')
  get(@Param('registration') registration: string): Promise<AircraftDto> {
    return this.fleet.get(registration);
  }

  @Post('aircraft')
  @UseGuards(new ForbidUnknownPropertiesGuard({ root: ['aircraftType', 'base'] }))
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: AircraftRequestDto): Promise<AircraftDto> {
    return this.fleet.create(body, user.sub);
  }

  @Put('aircraft/:registration')
  @UseGuards(new ForbidUnknownPropertiesGuard({ root: ['base'] }))
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('registration') registration: string,
    @Body() body: UpdateAircraftRequestDto,
  ): Promise<AircraftDto> {
    return this.fleet.update(registration, body, user.sub);
  }

  @Delete('aircraft/:registration')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('registration') registration: string): Promise<void> {
    await this.fleet.remove(registration, user.sub);
  }
}
