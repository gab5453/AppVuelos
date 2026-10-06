import { IsNotEmpty, IsString } from 'class-validator';

/** `segmentId` es `required: true` en `GET /offers/{offerId}/seatmap`. */
export class SeatMapQueryDto {
  @IsString()
  @IsNotEmpty()
  segmentId!: string;
}
