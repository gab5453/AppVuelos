import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { UUID_PATTERN } from '../../validation/patterns.js';
import { IsCalendarDate } from '../../validation/is-calendar-date.decorator.js';
import { PaymentReferenceDto } from '../common/payment-reference.dto.js';

class ContactDto {
  @IsString()
  email!: string;

  @IsString()
  phone!: string;
}

class AssignedSeatDto {
  @IsString()
  segmentId!: string;

  @IsString()
  seatNumber!: string;
}

class ExtraBaggageDto {
  @IsString()
  itineraryId!: string;

  /** El contrato no declara `minimum`; una cantidad < 1 se rechaza como regla de negocio (422). */
  @IsInt()
  quantity!: number;
}

export class PassengerItemDto {
  @IsString()
  passengerId!: string;

  @IsEnum(['ADULT', 'YOUTH', 'CHILD', 'INFANT'])
  passengerType!: 'ADULT' | 'YOUTH' | 'CHILD' | 'INFANT';

  @IsOptional()
  @IsString()
  associatedAdultId?: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsIn(['PASSPORT', 'NATIONAL_ID'])
  documentType!: 'PASSPORT' | 'NATIONAL_ID';

  @IsString()
  documentNumber!: string;

  @IsString()
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
  @Type(() => ContactDto)
  contact!: ContactDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignedSeatDto)
  assignedSeats?: AssignedSeatDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraBaggageDto)
  extraBaggage?: ExtraBaggageDto[];
}

export class BookingRequestDto {
  @Matches(UUID_PATTERN)
  holdId!: string;

  /** Sin `minItems` en el contrato: que coincida con el hold se valida como regla de negocio (422). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PassengerItemDto)
  passengers!: PassengerItemDto[];

  @IsDefined()
  @ValidateNested()
  @Type(() => PaymentReferenceDto)
  payment!: PaymentReferenceDto;
}
