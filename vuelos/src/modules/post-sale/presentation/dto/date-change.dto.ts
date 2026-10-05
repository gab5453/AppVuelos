import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PaymentReferenceDto } from '../../../../common/validation/dto/payment-reference.dto.js';
import { IsCalendarDate } from '../../../../common/validation/is-calendar-date.decorator.js';
import type { FlightSegment } from '../../../../common/contract-types/common.types.js';

class DateChangeItemDto {
  @IsString()
  itineraryId!: string;

  @IsCalendarDate()
  newDepartureDate!: string;
}

export class DateChangeSearchRequestDto {
  /** Sin `minItems` en el contrato: una lista vacía devuelve cero opciones. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DateChangeItemDto)
  changes!: DateChangeItemDto[];
}

export interface DateChangeOfferDto {
  changeOfferId?: string;
  expiresAt?: string;
  segments?: FlightSegment[];
  priceDifference?: {
    fareDifference?: string;
    taxDifference?: string;
    changeFee?: string;
    totalToPay?: string;
  };
}

export type DateChangeSearchResponseDto = DateChangeOfferDto[];

/** En `DateChangeRequest` ninguna propiedad del asiento es `required` (a diferencia de PassengerItem). */
class AssignedSeatDto {
  @IsOptional()
  @IsString()
  segmentId?: string;

  @IsOptional()
  @IsString()
  seatNumber?: string;
}

export class DateChangeRequestDto {
  @IsString()
  changeOfferId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentReferenceDto)
  payment?: PaymentReferenceDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignedSeatDto)
  assignedSeats?: AssignedSeatDto[];
}
