import { IsOptional, IsString } from 'class-validator';

export interface CancellationQuoteResponseDto {
  quoteId: string;
  isRefundable: boolean;
  refundAmount: string;
  penaltyAmount: string;
  currency: string;
  expiresAt: string;
}

export class CancelBookingRequestDto {
  @IsString()
  quoteId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
