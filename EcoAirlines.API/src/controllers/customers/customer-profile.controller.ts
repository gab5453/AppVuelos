import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CustomerProfileRequestDto, type CustomerProfileDto } from '@ecoairlines/business/dto/customers/customer-profile.dto.js';
import { CustomerProfileService } from '@ecoairlines/business/services/customers/customer-profile.service.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Scopes } from '../../auth/decorators/scopes.decorator.js';
import { PROFILE_SCOPE } from '../../auth/extension-scopes.js';
import { OAuth2AuthGuard } from '../../auth/guards/oauth2-auth.guard.js';
import { ScopesGuard } from '../../auth/guards/scopes.guard.js';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface.js';
import { ForbidUnknownPropertiesGuard } from '../../guards/forbid-unknown-properties.guard.js';

const PROFILE_KEYS = [
  'firstName',
  'lastName',
  'documentType',
  'documentNumber',
  'nationality',
  'documentExpiryDate',
  'birthDate',
  'gender',
  'contact',
] as const;

/** Perfil del cliente — **extensión fuera del contrato**. El dueño es siempre el `sub` del JWT. */
@Controller('customers/me')
@UseGuards(OAuth2AuthGuard, ScopesGuard)
@Scopes(PROFILE_SCOPE)
export class CustomerProfileController {
  constructor(private readonly profiles: CustomerProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<CustomerProfileDto> {
    return this.profiles.getProfile(user.sub);
  }

  @Put()
  @UseGuards(new ForbidUnknownPropertiesGuard({ root: PROFILE_KEYS, nested: { contact: ['email', 'phone'] } }))
  saveProfile(@CurrentUser() user: AuthenticatedUser, @Body() body: CustomerProfileRequestDto): Promise<CustomerProfileDto> {
    return this.profiles.saveProfile(user.sub, body);
  }
}
