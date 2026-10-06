import { Type } from 'class-transformer';
import { IsArray, IsDefined, IsString, ValidateNested } from 'class-validator';
import { PassengerBreakdownDto } from '../common/passenger-breakdown.dto.js';

export class ItinerarySelectionDto {
  @IsString()
  itineraryId!: string;

  @IsString()
  cabinClass!: string;

  @IsString()
  fareBrand!: string;
}

export class HoldRequestDto {
  @IsString()
  offerId!: string;

  /** Sin `minItems` en el contrato: que cubra los itinerarios de la oferta se valida como regla de negocio (422). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItinerarySelectionDto)
  itinerarySelections!: ItinerarySelectionDto[];

  @IsDefined()
  @ValidateNested()
  @Type(() => PassengerBreakdownDto)
  passengersBreakdown!: PassengerBreakdownDto;
}
