import type { FlightSegment } from '../api/types';
import { estimateCo2Kg, treesEquivalent } from '../lib/co2';

/** Sello de emisiones estimadas y compensadas (dato ilustrativo, solo del frontend). */
export function Co2Badge({ segments, cabinClass }: { segments: FlightSegment[]; cabinClass?: string }) {
  const kg = estimateCo2Kg(segments, cabinClass);
  const trees = treesEquivalent(kg);
  return (
    <span
      className="co2-badge"
      title={`Estimación ilustrativa: ${kg} kg de CO₂ por pasajero, compensados con el equivalente a lo que absorben ${trees} árbol(es) en un año.`}
    >
      <span aria-hidden="true">🌱</span> {kg} kg CO₂ · compensado
    </span>
  );
}
