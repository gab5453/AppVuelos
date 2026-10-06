import type { MoneyAmount } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { HoldStatus } from '@ecoairlines/data-access/entities/offers/hold.entity.js';

export type { HoldStatus } from '@ecoairlines/data-access/entities/offers/hold.entity.js';

export interface HoldResponseDto {
  holdId: string;
  status: 'HELD';
  expiresAt: string;
  ttlMinutes: number;
  lockedPrice: MoneyAmount;
}

export interface HoldStatusResponseDto {
  status: HoldStatus;
  expiresAt?: string;
  remainingSeconds: number;
  lockedPrice: MoneyAmount;
}
