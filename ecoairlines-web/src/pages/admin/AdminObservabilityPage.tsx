import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getObservability, type ObservabilitySnapshot } from '../../api/extensions';
import { useAuth } from '../../auth/AuthContext';
import { ProblemAlert } from '../../components/ProblemAlert';
import { formatDateTime } from '../../lib/format';
import { EventsPanel } from './EventsPanel';
import { FleetSchedulePanel } from './FleetSchedulePanel';
import { browserObservability, type BrowserSnapshot, type ObservabilityEvent } from '../../lib/observability';

/**
 * Panel de observabilidad (solo administradores), basado en el de Ejemplo 1:
 * - **Backend:** métricas HTTP de la API (`GET /admin/observability`, extensión fuera del contrato).
 * - **Flota:** horario de cada avión por día (`GET /admin/fleet-schedule`).
 * - **Navegador:** rendimiento, errores, recursos, interacciones y entorno, guardados solo en este navegador.
 */
export function AdminObservabilityPage() {
  const { token } = useAuth();
  const [backend, setBackend] = useState<ObservabilitySnapshot | null>(null);
  const [browser, setBrowser] = useState<BrowserSnapshot>(() => browserObservability.getSnapshot());
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState('Panel cargado con los datos disponibles.');

  const refresh = useCallback(async () => {
    browserObservability.refreshEnvironment();
    setBrowser(browserObservability.getSnapshot());
    if (!token) return;
    try {
      setBackend(await getObservability(token));
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [token]);

  // Métricas del backend al abrir el panel; las del navegador ya se leyeron al iniciar el estado.
  useEffect(() => {
    if (!token) return;
    let active = true;
    getObservability(token)
      .then((data) => active && setBackend(data))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [token]);

  const download = () => {
    const content = JSON.stringify({ backend, navegador: browserObservability.getSnapshot() }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ecoairlines-observabilidad-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Snapshot JSON descargado.');
  };

  const clear = () => {
    if (!window.confirm('¿Borrar los datos de observabilidad guardados en este navegador? Las métricas del backend no se borran.')) return;
    browserObservability.clear();
    setBrowser(browserObservability.getSnapshot());
    setStatus('Almacenamiento local de observabilidad limpiado.');
  };

  const log = browser.log;
  const byCategory = (category: ObservabilityEvent['categoria']) => log.filter((event) => event.categoria === category);
  const environment = browser.environment;

  return (
    <div className="container section admin">
      <header className="admin-head">
        <div>
          <p className="eyebrow">Portal administrativo</p>
          <h1>Observabilidad</h1>
          <p className="muted small">Solo visible para administradores. Nunca se registran tokens, contraseñas, datos de pago ni valores de formularios.</p>
        </div>
        <Link to="/admin" className="btn btn-ghost">← Volver al panel</Link>
      </header>

      <div className="admin-actions" role="toolbar" aria-label="Acciones del panel">
        <button type="button" className="btn btn-primary" onClick={() => { void refresh(); setStatus(`Datos actualizados el ${formatDateTime(new Date().toISOString())}.`); }}>Actualizar datos</button>
        <button type="button" className="btn btn-ghost" onClick={() => { browserObservability.logDemoEvent(); setBrowser(browserObservability.getSnapshot()); setStatus('Evento de demostración agregado al registro.'); }}>Generar evento de demostración</button>
        <button type="button" className="btn btn-ghost" onClick={download}>Descargar snapshot JSON</button>
        <button type="button" className="btn btn-danger" onClick={clear}>Limpiar almacenamiento</button>
      </div>
      <p className="muted small" role="status" aria-live="polite">{status}</p>
      {error ? <ProblemAlert error={error} /> : null}

      <h2>Backend (API)</h2>
      {backend ? (
        <>
          <section className="stats-grid" aria-label="Resumen del backend">
            <Stat label="Peticiones" value={backend.totals.requests} />
            <Stat label="Errores 4xx" value={backend.totals.statusClasses['4xx']} />
            <Stat label="Errores 5xx" value={backend.totals.statusClasses['5xx']} />
            <Stat label="Latencia media" value={`${backend.totals.latency.averageMs} ms`} />
            <Stat label="Latencia p95" value={`${backend.totals.latency.p95Ms} ms`} />
            <Stat label="Encendida hace" value={formatUptime(backend.uptimeSeconds)} />
          </section>
          <p className="muted small">
            Node {backend.process.nodeVersion} · memoria {backend.process.rssMb} MB (heap {backend.process.heapUsedMb} / {backend.process.heapTotalMb} MB) ·
            desde {formatDateTime(backend.startedAt)}
          </p>

          <Table
            caption="Peticiones por ruta (patrón de la ruta, sin ids ni query strings)"
            headers={['Método', 'Ruta', 'Peticiones', '2xx', '4xx', '5xx', 'Media', 'p95', 'Máx.']}
            empty="Sin peticiones registradas."
            rows={backend.routes.map((route) => [
              route.method,
              <code key="r">{route.route}</code>,
              route.count,
              route.statusClasses['2xx'],
              route.statusClasses['4xx'],
              route.statusClasses['5xx'],
              `${route.latency.averageMs} ms`,
              `${route.latency.p95Ms} ms`,
              `${route.latency.maxMs} ms`,
            ])}
          />
          <Table
            caption="Errores recientes (buscar en el log por X-Request-Id)"
            headers={['Hora', 'Método', 'Ruta', 'Status', 'Duración', 'X-Request-Id']}
            empty="Sin errores registrados."
            rows={backend.recentErrors.map((entry) => [
              formatDateTime(entry.at),
              entry.method,
              <code key="r">{entry.route}</code>,
              entry.status,
              `${Math.round(entry.durationMs)} ms`,
              <code key="id">{entry.requestId ?? '—'}</code>,
            ])}
          />
        </>
      ) : (
        !error && <p className="muted">Cargando métricas del backend…</p>
      )}

      <EventsPanel />

      <FleetSchedulePanel />

      <h2>Navegador (este equipo)</h2>
      <section className="stats-grid" aria-label="Resumen del navegador">
        <Stat label="Sesión" value={browser.meta?.sessionId.slice(-6) ?? '—'} />
        <Stat label="Eventos registrados" value={log.length} />
        <Stat label="Errores JS" value={byCategory('error').length} />
        <Stat label="Viewport" value={environment?.viewport.width ? `${environment.viewport.width} × ${environment.viewport.height}` : '—'} />
        <Stat label="Conexión" value={environment?.conexion.soportado ? environment.conexion.effectiveType ?? 'sí' : 'No informada'} />
        <Stat label="Almacenamiento" value={browser.almacenamientoDisponible ? 'localStorage' : 'Solo memoria'} />
      </section>

      <Table
        caption="Rendimiento de navegación (Performance API)"
        headers={['Hora', 'Página', 'TTFB', 'DOMContentLoaded', 'Carga completa', 'Método']}
        empty="Sin datos todavía."
        rows={byCategory('performance').map((event) => [
          formatDateTime(event.timestamp),
          event.pagina,
          ms(event.detalle.tiempoHastaPrimerByte),
          ms(event.detalle.domContentCargado),
          ms(event.detalle.cargaCompleta),
          text(event.detalle.metodo ?? event.detalle.motivo),
        ])}
      />
      <Table
        caption="Errores de JavaScript y promesas rechazadas"
        headers={['Hora', 'Tipo', 'Página', 'Mensaje', 'Ubicación']}
        empty="Sin errores registrados."
        rows={byCategory('error').map((event) => [
          formatDateTime(event.timestamp),
          event.tipo === 'promesa-rechazada' ? 'Promesa rechazada' : 'Error de JavaScript',
          event.pagina,
          text(event.detalle.mensaje),
          event.detalle.archivo ? `${text(event.detalle.archivo)}:${text(event.detalle.linea)}` : '—',
        ])}
      />
      <Table
        caption="Errores de carga de recursos"
        headers={['Hora', 'Página', 'Etiqueta', 'Fuente']}
        empty="Sin errores de recursos registrados."
        rows={byCategory('recurso').map((event) => [formatDateTime(event.timestamp), event.pagina, text(event.detalle.etiqueta), text(event.detalle.fuente)])}
      />
      <Table
        caption="Clics en enlaces, botones y controles (últimos 50)"
        headers={['Hora', 'Página', 'Elemento', 'Texto / destino']}
        empty="Sin interacciones registradas."
        rows={[...byCategory('interaccion'), ...byCategory('demo')]
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 50)
          .map((event) =>
            event.categoria === 'demo'
              ? [formatDateTime(event.timestamp), event.pagina, 'Evento de demostración', text(event.detalle.mensaje)]
              : [formatDateTime(event.timestamp), event.pagina, text(event.detalle.etiqueta), text(event.detalle.texto ?? event.detalle.href)],
          )}
      />
      <Table
        caption="Cambios de visibilidad de la pestaña"
        headers={['Hora', 'Página', 'Estado']}
        empty="Sin cambios de visibilidad registrados."
        rows={byCategory('visibilidad').map((event) => [formatDateTime(event.timestamp), event.pagina, event.tipo === 'hidden' ? 'Oculta' : 'Visible'])}
      />

      <section className="card" aria-labelledby="json-title">
        <h2 id="json-title">Snapshot JSON del navegador</h2>
        <pre className="snapshot-json" tabIndex={0}>{JSON.stringify(browser, null, 2)}</pre>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat-card">
      <p className="muted small">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

function Table({ caption, headers, rows, empty }: { caption: string; headers: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <section className="card">
      <div className="table-wrap">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="muted">{empty}</td></tr>
            ) : (
              rows.map((row, index) => <tr key={index}>{row.map((cell, position) => <td key={position}>{cell}</td>)}</tr>)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const text = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : String(value));
const ms = (value: unknown) => (typeof value === 'number' ? `${value} ms` : '—');

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}
