import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { PaymentReferenceDto } from '../common/payment-reference.dto.js';
import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';

export class AddBaggageRequestDto {
  @IsString()
  passengerId!: string;

  @IsString()
  itineraryId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => PaymentReferenceDto)
  payment!: PaymentReferenceDto;
}

export interface BaggageOptionDto {
  passengerId?: string;
  itineraryId?: string;
  price?: MoneyAmount;
  maxAllowed?: number;
  alreadyPurchased?: number;
}

export type BaggageOptionsResponseDto = BaggageOptionDto[];

export interface BaggageAddedResponseDto {
  passengerId?: string;
  itineraryId?: string;
  totalBaggage?: number;
}
