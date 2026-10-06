/**
 * Operaciones de asientos sobre el GDS. Cada dominio que asigna asientos (bookings y post-sale) las obtiene
 * de SU propio gateway; la regla de asignación (todo o nada) está en EcoAirlines.Business (`SeatAssigner`).
 */
export interface SeatInventoryGateway {
  seatInfo(segmentId: string, seatNumber: string): Promise<{ cabinClass: string; isAvailable: boolean; holder?: string } | undefined>;
  assignSeat(segmentId: string, seatNumber: string, holder: string): Promise<boolean>;
  releaseSeat(segmentId: string, seatNumber: string, holder: string): Promise<void>;
}
