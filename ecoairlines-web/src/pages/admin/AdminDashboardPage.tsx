import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStats, type AdminDashboardStats } from '../../api/extensions';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { STATUS_LABELS, formatDateTime, formatMoney } from '../../lib/format';
import { AdminFlightsPanel } from './AdminFlightsPanel';
import { FleetPanel } from './FleetPanel';
import { RoutesPanel } from './RoutesPanel';

type Tab = 'FLIGHTS' | 'SCHEDULE' | 'FLEET' | 'ROUTES' | 'BOOKINGS';
const TABS: { id: Tab; label: string }[] = [
  { id: 'FLIGHTS', label: 'Vuelos y asientos' },
  { id: 'SCHEDULE', label: 'Rutas programadas' },
  { id: 'FLEET', label: 'Flota' },
  { id: 'ROUTES', label: 'Ventas por ruta' },
  { id: 'BOOKINGS', label: 'Reservas recientes' },
];

const usd = (value: number) => formatMoney(value.toFixed(2));

/**
 * Panel de administración (extensión fuera del contrato), con las secciones y campos de la plantilla del
 * grupo: indicadores, vuelos con su ocupación y estado (por fecha, origen o ruta), pasajeros por vuelo, rutas y reservas recientes.
 * Además, el CRUD de rutas programadas (crear, editar y dar de baja vuelos del horario).
 */
export function AdminDashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string>();
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>('FLIGHTS');

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

  if (!stats) {
    return (
      <div className="container section">
        {error ? <ProblemAlert error={error} onRetry={() => void load()} /> : <p className="muted">Cargando indicadores…</p>}
      </div>
    );
  }

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
          {tab === 'FLIGHTS' && <AdminFlightsPanel />}

          {tab === 'SCHEDULE' && <RoutesPanel onChanged={() => void load()} />}

          {tab === 'FLEET' && <FleetPanel />}

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
