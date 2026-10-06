import { aircraftOn, type FleetAircraft, type Timetable } from '../../seed/timetable.js';

export { TURNAROUND_MINUTES } from '../../seed/timetable.js';

/** Avión de la flota (alias para quienes consultan el plan). */
export type PlannedAircraft = FleetAircraft;

export interface FleetPlan {
  aircraft: readonly PlannedAircraft[];
  /** Matrícula del avión que opera un vuelo en una fecha local de salida; `undefined` si el vuelo no opera ese día. */
  registrationFor(localDate: string, flightNumber: string): string | undefined;
}

/**
 * Plan de flota de un horario. Cada avión tiene un **horario semanal fijo** definido en el propio horario
 * (`timetable.ts`): el avión de un vuelo depende solo del día de la semana, así que el martes de la semana 13 lo opera el
 * mismo avión que hoy martes. El horario ya viene validado (ningún avión está en dos lugares a la vez).
 */
export function fleetPlan(timetable: Timetable): FleetPlan {
  return { aircraft: timetable.fleet, registrationFor: (localDate, flightNumber) => aircraftOn(timetable, flightNumber, localDate) };
}
