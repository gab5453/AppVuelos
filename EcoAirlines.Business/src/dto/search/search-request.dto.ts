import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsString, Matches, ValidateNested } from 'class-validator';
import { PassengerBreakdownDto } from '../common/passenger-breakdown.dto.js';
import { IATA_CODE_PATTERN } from '../../validation/patterns.js';
import { IsCalendarDate } from '../../validation/is-calendar-date.decorator.js';

export class SearchItineraryDto {
  @IsString()
  @Matches(IATA_CODE_PATTERN)
  origin!: string;

  @IsString()
  @Matches(IATA_CODE_PATTERN)
  destination!: string;

  @IsCalendarDate()
  departureDate!: string;
}

export class SearchRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SearchItineraryDto)
  itineraries!: SearchItineraryDto[];

  @IsDefined()
  @ValidateNested()
  @Type(() => PassengerBreakdownDto)
  passengers!: PassengerBreakdownDto;
}
