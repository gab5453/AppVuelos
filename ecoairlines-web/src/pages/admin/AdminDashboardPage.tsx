import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getDashboardStats,
  getFlightPassengers,
  updateFlightStatus,
  type AdminDashboardStats,
  type FlightOccupancy,
} from '../../api/extensions';
import type { FlightOperationalStatus, PassengerItem } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { PASSENGER_LABELS, STATUS_LABELS, formatDateTime, formatMoney, localTime } from '../../lib/format';

const FLIGHT_STATUSES: FlightOperationalStatus[] = ['SCHEDULED', 'BOARDING', 'DEPARTED', 'DELAYED', 'ARRIVED', 'CANCELLED', 'DIVERTED'];
type Tab = 'FLIGHTS' | 'ROUTES' | 'BOOKINGS';
const TABS: { id: Tab; label: string }[] = [
  { id: 'FLIGHTS', label: 'Vuelos de hoy' },
  { id: 'ROUTES', label: 'Rutas' },
  { id: 'BOOKINGS', label: 'Reservas recientes' },
];

const usd = (value: number) => formatMoney(value.toFixed(2));

/**
 * Panel de administración (extensión fuera del contrato), con las secciones y campos de la plantilla del
 * grupo: indicadores, vuelos del día con su ocupación y estado, pasajeros por vuelo, rutas y reservas recientes.
 */
export function AdminDashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string>();
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('FLIGHTS');
  const [filter, setFilter] = useState('');
  const [updating, setUpdating] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [selected, setSelected] = useState<FlightOccupancy>();
  const [passengers, setPassengers] = useState<PassengerItem[] | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setStats(await getDashboardStats(token));
      setRefreshedAt(new Date().toISOString());
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getDashboardStats(token)
      .then((data) => {
        if (!active) return;
        setStats(data);
        setRefreshedAt(new Date().toISOString());
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [token]);

  const changeStatus = async (flight: FlightOccupancy, status: FlightOperationalStatus) => {
    if (!token) return;
    setUpdating(flight.flightId);
    setNotice(undefined);
    try {
      await updateFlightStatus(token, flight.flightNumber, flight.scheduledDeparture.slice(0, 10), status);
      setNotice(`${flight.flightNumber}: estado cambiado a ${STATUS_LABELS[status] ?? status}.`);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setUpdating(undefined);
    }
  };

  const showPassengers = async (flight: FlightOccupancy) => {
    if (!token) return;
    setSelected(flight);
    setPassengers(null);
    try {
      setPassengers(await getFlightPassengers(token, flight.flightNumber, flight.scheduledDeparture.slice(0, 10)));
    } catch (caught) {
      setError(caught);
    }
  };

  if (!stats) {
    return (
      <div className="container section">
        {error ? <ProblemAlert error={error} onRetry={() => void load()} /> : <p className="muted">Cargando indicadores…</p>}
      </div>
    );
  }

  const query = filter.trim().toUpperCase();
  const flights = stats.flightOccupancies.filter((flight) => !query || `${flight.flightNumber} ${flight.route}`.toUpperCase().includes(query));

  return (
    <div className="container section admin">
      <header className="admin-head">
        <div>
          <p className="eyebrow">Portal administrativo</p>
          <h1>Operaciones EcoAirlines</h1>
          <p className="muted small">Actualizado: {formatDateTime(refreshedAt)}</p>
        </div>
        <div className="admin-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>Actualizar</button>
          <Link to="/admin/observabilidad" className="btn btn-primary">Observabilidad</Link>
        </div>
      </header>

      {error ? <ProblemAlert error={error} /> : null}
      {notice && <p className="alert alert-success" role="status">{notice}</p>}

      <section className="stats-grid" aria-label="Indicadores">
        <Stat label="Reservas" value={stats.totalBookings} />
        <Stat label="Confirmadas" value={stats.confirmedBookings} />
        <Stat label="Canceladas" value={stats.cancelledBookings} />
        <Stat label="Pasajeros" value={stats.totalPassengers} />
        <Stat label="Ingresos confirmados" value={usd(stats.totalRevenue)} />
        <Stat label="Vuelos hoy" value={stats.totalFlightsToday} />
      </section>

      <section className="card">
        <div className="tabs" role="tablist" aria-label="Secciones del panel">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`admin-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`admin-panel-${item.id}`}
              className={`tab ${tab === item.id ? 'is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div id={`admin-panel-${tab}`} role="tabpanel" aria-labelledby={`admin-tab-${tab}`} className="tab-panel">
          {tab === 'FLIGHTS' && (
            <>
              <label className="field admin-filter">
                Buscar vuelo o ruta
                <input value={filter} placeholder="EA300, UIO…" onChange={(event) => setFilter(event.target.value)} />
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Vuelo</th>
                      <th scope="col">Ruta</th>
                      <th scope="col">Salida</th>
                      <th scope="col">Ocupación</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Pasajeros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flights.map((flight) => (
                      <tr key={flight.flightId}>
                        <td><strong>{flight.flightNumber}</strong></td>
                        <td>{flight.route}</td>
                        <td>{localTime(flight.scheduledDeparture)}</td>
                        <td>
                          <div className="occupancy" title={`${flight.bookedSeats} de ${flight.totalSeats} asientos`}>
                            <span className="occupancy-bar"><span style={{ width: `${Math.min(100, flight.occupancyPercentage)}%` }} /></span>
                            <span className="small">{flight.occupancyPercentage}% · {flight.availableSeats} libres</span>
                          </div>
                        </td>
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
                    ))}
                  </tbody>
                </table>
              </div>

              {selected && (
                <section className="admin-passengers" aria-labelledby="pax-admin-title">
                  <h2 id="pax-admin-title">Pasajeros de {selected.flightNumber} ({selected.route})</h2>
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
          )}

          {tab === 'ROUTES' && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Ruta</th>
                    <th scope="col">Vuelos diarios</th>
                    <th scope="col">Reservas confirmadas</th>
                    <th scope="col">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.routeStats.map((route) => (
                    <tr key={route.route}>
                      <td>{route.route}</td>
                      <td>{route.flightsCount}</td>
                      <td>{route.bookingsCount}</td>
                      <td>{usd(route.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'BOOKINGS' && (
            stats.recentBookings.length === 0 ? (
              <p className="muted">Todavía no hay reservas.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">PNR</th>
                      <th scope="col">Creada</th>
                      <th scope="col">Ruta</th>
                      <th scope="col">Pasajeros</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentBookings.map((booking) => {
                      const segments = booking.itineraries?.[0]?.segments ?? [];
                      return (
                        <tr key={booking.bookingId}>
                          <td><strong>{booking.pnr}</strong></td>
                          <td className="small">{formatDateTime(booking.createdAt)}</td>
                          <td>{segments[0]?.departure.iataCode ?? '—'} → {segments.at(-1)?.arrival.iataCode ?? '—'}</td>
                          <td>{booking.passengers?.length ?? 0}</td>
                          <td><span className={`status status-${booking.status.toLowerCase()}`}>{STATUS_LABELS[booking.status] ?? booking.status}</span></td>
                          <td>{formatMoney(booking.grandTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <p className="muted small">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}
