import { useEffect, useState } from 'react';
import { getAdminFlights, getFlightPassengers, updateFlightStatus, type FlightOccupancy } from '../../api/extensions';
import type { FlightOperationalStatus, PassengerItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { AIRPORTS, cityOf } from '../../data/airports';
import { PASSENGER_LABELS, STATUS_LABELS, lastSaleDate, localDate, localTime, todayIso } from '../../lib/format';

const FLIGHT_STATUSES: FlightOperationalStatus[] = ['SCHEDULED', 'BOARDING', 'DEPARTED', 'DELAYED', 'ARRIVED', 'CANCELLED', 'DIVERTED'];

/**
 * Vuelos del panel de administración (extensión `GET /admin/flights`): ocupación por **fecha** (hoy por defecto),
 * **aeropuerto de origen** o **ruta** (origen + destino), para observar cómo se reservan los asientos de cualquier día
 * publicado. Distingue los cupos tomados por clientes (holds y reservas) de los pasajeros simulados de la primera semana.
 */
export function AdminFlightsPanel() {
  const { token } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [filter, setFilter] = useState('');
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; flights?: FlightOccupancy[]; error?: unknown }>({ key: '' });
  const [updating, setUpdating] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [actionError, setActionError] = useState<unknown>(null);
  const [selected, setSelected] = useState<FlightOccupancy>();
  const [passengers, setPassengers] = useState<PassengerItem[] | null>(null);

  const requestKey = `${date}|${origin}|${destination}|${reload}`;
  useEffect(() => {
    if (!token) return;
    let active = true;
    getAdminFlights(token, { date, origin: origin || undefined, destination: destination || undefined })
      .then((flights) => active && setLoaded({ key: requestKey, flights }))
      .catch((error: unknown) => active && setLoaded({ key: requestKey, error }));
    return () => {
      active = false;
    };
  }, [token, date, origin, destination, requestKey]);

  const current = loaded.key === requestKey ? loaded : undefined;
  const query = filter.trim().toUpperCase();
  const flights = (current?.flights ?? []).filter((flight) => !query || `${flight.flightNumber} ${flight.route}`.toUpperCase().includes(query));
  const totals = flights.reduce(
    (acc, flight) => ({
      seats: acc.seats + flight.totalSeats,
      booked: acc.booked + flight.bookedSeats,
      reserved: acc.reserved + flight.reservedSeats,
      simulated: acc.simulated + flight.simulatedSeats,
    }),
    { seats: 0, booked: 0, reserved: 0, simulated: 0 },
  );

  const changeStatus = async (flight: FlightOccupancy, status: FlightOperationalStatus) => {
    if (!token) return;
    setUpdating(flight.flightId);
    setNotice(undefined);
    setActionError(null);
    try {
      await updateFlightStatus(token, flight.flightNumber, flight.date, status);
      setNotice(`${flight.flightNumber} del ${localDate(flight.date)}: estado cambiado a ${STATUS_LABELS[status] ?? status}.`);
      setReload((value) => value + 1);
    } catch (caught) {
      setActionError(caught);
    } finally {
      setUpdating(undefined);
    }
  };

  const showPassengers = async (flight: FlightOccupancy) => {
    if (!token) return;
    setSelected(flight);
    setPassengers(null);
    try {
      setPassengers(await getFlightPassengers(token, flight.flightNumber, flight.date));
    } catch (caught) {
      setActionError(caught);
    }
  };

  const scope = destination
    ? `${origin ? `${cityOf(origin)} → ` : 'Hacia '}${cityOf(destination)}`
    : origin
      ? `Salidas de ${cityOf(origin)}`
      : 'Todos los vuelos';

  return (
    <>
      <div className="search-row">
        <label className="field">
          Fecha
          <input type="date" value={date} max={lastSaleDate()} onChange={(event) => event.target.value && setDate(event.target.value)} />
        </label>
        <label className="field">
          Origen
          <select value={origin} onChange={(event) => setOrigin(event.target.value)}>
            <option value="">Todos</option>
            {AIRPORTS.map((airport) => (
              <option key={airport.code} value={airport.code}>{airport.city} ({airport.code})</option>
            ))}
          </select>
        </label>
        <label className="field">
          Destino (ruta)
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option value="">Todos</option>
            {AIRPORTS.filter((airport) => airport.code !== origin).map((airport) => (
              <option key={airport.code} value={airport.code}>{airport.city} ({airport.code})</option>
            ))}
          </select>
        </label>
        <label className="field">
          Buscar vuelo
          <input value={filter} placeholder="EA104…" onChange={(event) => setFilter(event.target.value)} />
        </label>
        <button type="button" className="btn btn-ghost field-end" onClick={() => { setDate(todayIso()); setOrigin(''); setDestination(''); setFilter(''); }}>
          Hoy, todos
        </button>
      </div>

      {current?.error ? <ProblemAlert error={current.error} /> : null}
      {actionError ? <ProblemAlert error={actionError} /> : null}
      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {!current && <p className="muted">Cargando vuelos…</p>}

      {current?.flights && (
        <>
          <div className="stats-grid" aria-label="Resumen de la selección">
            <div className="stat-card"><p className="muted small">Vuelos</p><p className="stat-value">{flights.length}</p></div>
            <div className="stat-card"><p className="muted small">Tomados por clientes (holds + reservas)</p><p className="stat-value">{totals.reserved}</p></div>
            <div className="stat-card"><p className="muted small">Simulados (1.ª semana)</p><p className="stat-value">{totals.simulated}</p></div>
            <div className="stat-card"><p className="muted small">Asientos libres</p><p className="stat-value">{totals.seats - totals.booked}</p></div>
            <div className="stat-card"><p className="muted small">Ocupación</p><p className="stat-value">{totals.seats ? Math.round((totals.booked / totals.seats) * 1000) / 10 : 0}%</p></div>
          </div>

          <div className="table-wrap">
            <table>
              <caption>{scope} · {localDate(date)}{date === todayIso() ? ' (hoy)' : ''}</caption>
              <thead>
                <tr>
                  <th scope="col">Vuelo</th>
                  <th scope="col">Ruta</th>
                  <th scope="col">Salida</th>
                  <th scope="col">Ocupación</th>
                  <th scope="col" title="Asientos retenidos (holds vigentes) o vendidos a clientes de EcoAirlines">Clientes</th>
                  <th scope="col">Simulados</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Pasajeros</th>
                </tr>
              </thead>
              <tbody>
                {flights.length === 0 ? (
                  <tr><td colSpan={8} className="muted">No hay vuelos para este filtro.</td></tr>
                ) : (
                  flights.map((flight) => (
                    <tr key={flight.flightId} className={flight.reservedSeats > 0 ? 'row-highlight' : undefined}>
                      <td><strong>{flight.flightNumber}</strong></td>
                      <td>{flight.route}</td>
                      <td>{localTime(flight.scheduledDeparture)}</td>
                      <td>
                        <div className="occupancy" title={`${flight.bookedSeats} de ${flight.totalSeats} asientos`}>
                          <span className="occupancy-bar"><span style={{ width: `${Math.min(100, flight.occupancyPercentage)}%` }} /></span>
                          <span className="small">{flight.occupancyPercentage}% · {flight.availableSeats} libres de {flight.totalSeats}</span>
                        </div>
                      </td>
                      <td>{flight.reservedSeats}</td>
                      <td>{flight.simulatedSeats}</td>
                      <td>
                        <select
                          aria-label={`Estado del vuelo ${flight.flightNumber}`}
                          value={flight.status}
                          disabled={updating === flight.flightId}
                          onChange={(event) => void changeStatus(flight, event.target.value as FlightOperationalStatus)}
                        >
                          {FLIGHT_STATUSES.map((status) => (
                            <option key={status} value={status}>{STATUS_LABELS[status] ?? status}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void showPassengers(flight)}>Ver</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && (
        <section className="admin-passengers" aria-labelledby="pax-admin-title">
          <h2 id="pax-admin-title">Pasajeros de {selected.flightNumber} ({selected.route}) · {localDate(selected.date)}</h2>
          {passengers === null ? (
            <p className="muted">Cargando pasajeros…</p>
          ) : passengers.length === 0 ? (
            <p className="muted">No hay pasajeros con reserva confirmada en este vuelo.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Pasajero</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Documento</th>
                    <th scope="col">Asiento</th>
                    <th scope="col">Contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {passengers.map((passenger, index) => (
                    <tr key={`${passenger.passengerId}-${index}`}>
                      <td>{passenger.firstName} {passenger.lastName}</td>
                      <td>{PASSENGER_LABELS[passenger.passengerType] ?? passenger.passengerType}</td>
                      <td>{passenger.documentType === 'PASSPORT' ? 'Pasaporte' : 'Cédula'} {passenger.documentNumber}</td>
                      <td>{passenger.assignedSeats?.[0]?.seatNumber ?? (passenger.passengerType === 'INFANT' ? 'En brazos' : 'Sin asignar')}</td>
                      <td className="small">{passenger.contact.email} · {passenger.contact.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
