import type { MoneyAmount } from '../../../../common/contract-types/common.types.js';

export interface HoldResponseDto {
  holdId: string;
  status: 'HELD';
  expiresAt: string;
  ttlMinutes: number;
  lockedPrice: MoneyAmount;
}

export type HoldStatus = 'HELD' | 'RELEASED' | 'EXPIRED' | 'CONSUMED';

export interface HoldStatusResponseDto {
  status: HoldStatus;
  expiresAt?: string;
  remainingSeconds: number;
  lockedPrice: MoneyAmount;
}
