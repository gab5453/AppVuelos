import { Inject, Injectable } from '@nestjs/common';
import type { CustomerProfileRecord } from '@ecoairlines/data-access/entities/customers/customer-profile.entity.js';
import {
  CUSTOMER_PROFILE_REPOSITORY,
  type CustomerProfileRepository,
} from '@ecoairlines/data-management/interfaces/customers/customer-profile.repository.js';
import type { CustomerProfileDto, CustomerProfileRequestDto } from '../../dto/customers/customer-profile.dto.js';
import { ProblemDetailsException } from '../../exceptions/problem-details.exception.js';

/**
 * Perfil del cliente (dominio **customers**, extensión fuera del contrato). El dueño es siempre el `sub`
 * del JWT: un cliente solo lee y modifica su propio perfil, nunca recibe un `ownerId` del cliente.
 */
@Injectable()
export class CustomerProfileService {
  constructor(@Inject(CUSTOMER_PROFILE_REPOSITORY) private readonly profiles: CustomerProfileRepository) {}

  async getProfile(ownerId: string): Promise<CustomerProfileDto> {
    const profile = await this.profiles.findByOwner(ownerId);
    if (!profile) {
      throw ProblemDetailsException.notFound('El cliente todavía no registró su perfil.');
    }
    return toDto(profile);
  }

  /** Crea o reemplaza el perfil (PUT idempotente). */
  async saveProfile(ownerId: string, request: CustomerProfileRequestDto): Promise<CustomerProfileDto> {
    const saved = await this.profiles.save({
      ownerId,
      firstName: request.firstName,
      lastName: request.lastName,
      documentType: request.documentType,
      documentNumber: request.documentNumber,
      nationality: request.nationality,
      ...(request.documentExpiryDate ? { documentExpiryDate: request.documentExpiryDate } : {}),
      birthDate: request.birthDate,
      gender: request.gender,
      contact: { email: request.contact.email, phone: request.contact.phone },
      updatedAt: new Date().toISOString(),
    });
    return toDto(saved);
  }
}

function toDto({ ownerId: _ownerId, ...profile }: CustomerProfileRecord): CustomerProfileDto {
  return profile;
}
