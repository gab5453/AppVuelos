import { useState } from 'react';
import type { CabinPricing, ItineraryOption } from '../../api/types';
import { formatMoney } from '../../lib/format';
import type { CheckoutPassenger } from './SeatSelectionPanel';

/** bags[passengerId][itineraryId] = cantidad */
export type BaggageSelection = Record<string, Record<string, number>>;

/** Máximo de maletas extra por pasajero y vuelo que ofrece la web. */
export const MAX_EXTRA_BAGS = 3;

const route = (itinerary: ItineraryOption) => `${itinerary.segments[0]!.departure.iataCode} - ${itinerary.segments.at(-1)!.arrival.iataCode}`;

/**
 * Equipaje extra de todo el grupo en un solo panel: una pestaña por vuelo, los pasajeros a la izquierda (con lo que suma cada
 * uno) y a la derecha lo que incluye la tarifa y un contador − / + para el pasajero elegido. "Mismo equipaje para todos los
 * vuelos" copia la cantidad a cada vuelo.
 */
export function BaggageSelectionPanel({
  itineraries,
  passengers,
  bags,
  onChange,
}: {
  itineraries: { itinerary: ItineraryOption; pricing: CabinPricing }[];
  passengers: CheckoutPassenger[];
  bags: BaggageSelection;
  onChange: (passengerId: string, itineraryIds: string[], quantity: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [activeId, setActiveId] = useState(passengers[0]?.passengerId ?? '');
  const [sameForAll, setSameForAll] = useState(false);
  const current = itineraries[index];
  if (!current || passengers.length === 0) return null;
  const { itinerary, pricing } = current;
  const active = passengers.find((passenger) => passenger.passengerId === activeId) ?? passengers[0]!;
  const price = Number(pricing.extraCheckedBaggagePrice?.total ?? 0);
  const currency = pricing.extraCheckedBaggagePrice?.currency;
  const countOf = (passengerId: string, itineraryId = itinerary.itineraryId) => bags[passengerId]?.[itineraryId] ?? 0;
  const quantity = countOf(active.passengerId);
  const allowance = pricing.baggageAllowance;

  const set = (passengerId: string, value: number) =>
    onChange(passengerId, sameForAll ? itineraries.map((entry) => entry.itinerary.itineraryId) : [itinerary.itineraryId], value);

  const toggleSameForAll = (checked: boolean) => {
    setSameForAll(checked);
    if (!checked) return;
    // Al activarlo, cada pasajero queda con la cantidad del vuelo visible en todos los vuelos.
    for (const passenger of passengers) {
      onChange(passenger.passengerId, itineraries.map((entry) => entry.itinerary.itineraryId), countOf(passenger.passengerId));
    }
  };

  const totalAll = itineraries.reduce(
    (sum, entry) =>
      sum + Number(entry.pricing.extraCheckedBaggagePrice?.total ?? 0) * passengers.reduce((acc, passenger) => acc + countOf(passenger.passengerId, entry.itinerary.itineraryId), 0),
    0,
  );

  return (
    <div className="picker">
      <div className="tabs" role="tablist" aria-label="Vuelos">
        {itineraries.map(({ itinerary: candidate }, position) => {
          const count = passengers.reduce((acc, passenger) => acc + countOf(passenger.passengerId, candidate.itineraryId), 0);
          return (
            <button
              key={candidate.itineraryId}
              type="button"
              role="tab"
              aria-selected={position === index}
              className={`tab${position === index ? ' is-active' : ''}`}
              onClick={() => setIndex(position)}
            >
              {route(candidate)} {count > 0 && <span className="muted small">· {count} extra</span>}
            </button>
          );
        })}
      </div>

      <div className="picker-layout">
        <ul className="picker-people" aria-label="Pasajeros">
          {passengers.map((passenger) => {
            const count = countOf(passenger.passengerId);
            const isActive = passenger.passengerId === active.passengerId;
            return (
              <li key={passenger.passengerId}>
                <button type="button" className={`person-card person-select${isActive ? ' is-active' : ''}`} aria-pressed={isActive} onClick={() => setActiveId(passenger.passengerId)}>
                  <span className={`person-radio${isActive ? ' is-on' : ''}`} aria-hidden="true" />
                  <span className="person-text">
                    <strong>{passenger.name}</strong>
                    <span className="muted small">{count > 0 ? `${count} ${count === 1 ? 'maleta adicional' : 'maletas adicionales'}` : 'Sin maletas extra'}</span>
                  </span>
                  <span className="person-price">{formatMoney(String((price * count).toFixed(2)), currency)}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="picker-detail">
          <div className="allowance-chips">
            {allowance.personalItemIncluded && <span className="allowance-chip">✓ Artículo personal incluido</span>}
            <span className={`allowance-chip${allowance.carryOnIncluded ? '' : ' is-off'}`}>
              {allowance.carryOnIncluded ? `✓ ${allowance.carryOnIncluded} equipaje de mano (10 kg) incluido` : '✕ Equipaje de mano no incluido'}
            </span>
            <span className={`allowance-chip${allowance.checkedBaggageIncluded ? '' : ' is-off'}`}>
              {allowance.checkedBaggageIncluded ? `✓ ${allowance.checkedBaggageIncluded} equipaje de bodega (23 kg) incluido` : '✕ Equipaje de bodega no incluido'}
            </span>
          </div>
          <div className="bag-card">
            <span className="bag-icon" aria-hidden="true">🧳</span>
            <div className="bag-text">
              <strong>Maleta de bodega de 23 kg</strong>
              <span className="muted small">No debe exceder 158 cm lineales (largo + ancho + alto).</span>
              <span className="small">{formatMoney(pricing.extraCheckedBaggagePrice)} cada una · máximo {MAX_EXTRA_BAGS} por vuelo</span>
            </div>
            <div className="stepper" role="group" aria-label={`Maletas extra de ${active.name}`}>
              <button type="button" aria-label="Quitar una maleta" disabled={quantity <= 0} onClick={() => set(active.passengerId, quantity - 1)}>−</button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" aria-label="Agregar una maleta" disabled={quantity >= MAX_EXTRA_BAGS} onClick={() => set(active.passengerId, quantity + 1)}>+</button>
            </div>
            <div className="bag-total">
              <span className="muted small">Total</span>
              <strong>{formatMoney(String((price * quantity).toFixed(2)), currency)}</strong>
            </div>
          </div>
          <p className="muted small">Viajar ligero ahorra combustible 🌱.</p>
        </div>
      </div>

      <div className="picker-footer">
        {itineraries.length > 1 ? (
          <label className="inline-check">
            <input type="checkbox" checked={sameForAll} onChange={(event) => toggleSameForAll(event.target.checked)} />
            Mismo equipaje para todos los vuelos
          </label>
        ) : (
          <span />
        )}
        <span className="small">
          Total para todos los vuelos <strong>{formatMoney(String(totalAll.toFixed(2)), currency)}</strong>
        </span>
      </div>
    </div>
  );
}
