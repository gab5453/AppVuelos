import { Type } from 'class-transformer';
import { IsDefined, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { IsCalendarDate } from '../../validation/is-calendar-date.decorator.js';

class CustomerContactDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;
}

/**
 * Perfil del cliente — **extensión fuera del contrato** (`PUT /customers/me`). Tiene los mismos campos que
 * `PassengerItem` del contrato (y que la plantilla del grupo), sin los propios de una reserva
 * (`passengerId`, `passengerType`, asientos y maletas): así el perfil se copia tal cual al primer pasajero
 * y coincide con lo que espera el booking al integrarse.
 */
export class CustomerProfileRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  @IsIn(['PASSPORT', 'NATIONAL_ID'])
  documentType!: 'PASSPORT' | 'NATIONAL_ID';

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  documentNumber!: string;

  /** Código de país ISO 3166-1 alfa-2, como en el ejemplo del contrato (`EC`). */
  @Matches(/^[A-Z]{2}$/)
  nationality!: string;

  @IsOptional()
  @IsCalendarDate()
  documentExpiryDate?: string;

  @IsCalendarDate()
  birthDate!: string;

  @IsIn(['M', 'F', 'X'])
  gender!: 'M' | 'F' | 'X';

  @IsDefined()
  @ValidateNested()
  @Type(() => CustomerContactDto)
  contact!: CustomerContactDto;
}

export interface CustomerProfileDto {
  firstName: string;
  lastName: string;
  documentType: 'PASSPORT' | 'NATIONAL_ID';
  documentNumber: string;
  nationality: string;
  documentExpiryDate?: string;
  birthDate: string;
  gender: 'M' | 'F' | 'X';
  contact: { email: string; phone: string };
  updatedAt: string;
}
