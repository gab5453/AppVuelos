import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * `PUT /bookings/{bookingId}/seat` — **extensión fuera del contrato**, con los campos de la plantilla del
 * grupo (`ChangeSeatRequest`: `passengerId`, `newSeatNumber`). Se agrega `segmentId` (opcional) porque una
 * reserva puede tener varios vuelos; si se omite, la reserva debe tener un solo segmento.
 */
export class ChangeSeatRequestDto {
  /** Si se omite, se usa el primer pasajero con asiento (como en la plantilla). */
  @IsOptional()
  @IsString()
  passengerId?: string;

  @IsString()
  @IsNotEmpty()
  newSeatNumber!: string;

  @IsOptional()
  @IsString()
  segmentId?: string;
}

/** Respuesta con los campos de la plantilla (`ChangeSeatResponse`) más el segmento afectado. */
export interface ChangeSeatResponseDto {
  bookingId: string;
  passengerId: string;
  seatNumber: string;
  segmentId: string;
  message: string;
}
