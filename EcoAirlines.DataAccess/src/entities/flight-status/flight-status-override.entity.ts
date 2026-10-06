import type { FlightOperationalStatus } from '../../common/contract/common.types.js';

/**
 * Ajuste operativo del estado de un vuelo en una fecha, registrado por un administrador
 * (`PUT /admin/flights/{flightNumber}/status`). Reemplaza el estado calculado por el GDS en
 * `GET /flights/{flightNumber}/status`. **Base de datos futura: `flight-status`.**
 */
export interface FlightStatusOverride {
  flightNumber: string;
  /** Fecha local de salida (YYYY-MM-DD). */
  date: string;
  status: FlightOperationalStatus;
  /** Momento real de salida o llegada, cuando el administrador marca DEPARTED o ARRIVED. */
  actualDepartureAt?: string;
  actualArrivalAt?: string;
  updatedAt: string;
  /** `sub` del administrador que hizo el cambio (auditoría). */
  updatedBy: string;
}
