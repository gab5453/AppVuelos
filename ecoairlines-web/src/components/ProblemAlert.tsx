import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { friendlyMessage } from '../api/problem-messages';

/**
 * Muestra un ProblemDetails del contrato en lenguaje claro. Para 409/429 con `Retry-After`
 * muestra una cuenta regresiva y bloquea el reintento hasta que termine.
 */
export function ProblemAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const retryAfter = error instanceof ApiError ? error.retryAfter : undefined;
  // El plazo se fija al recibir el error; el reloj solo avanza con un intervalo.
  const [deadline] = useState(() => Date.now() + (retryAfter ?? 0) * 1000);
  const [now, setNow] = useState(() => Date.now());
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));

  useEffect(() => {
    if (deadline <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  if (!error) return null;
  const problem = error instanceof ApiError ? error.problem : undefined;
  const params = problem?.invalidParams?.filter((param) => param.name || param.reason) ?? [];

  return (
    <div className="alert alert-error" role="alert">
      <p className="alert-title">{friendlyMessage(error)}</p>
      {params.length > 0 && (
        <ul className="alert-list">
          {params.map((param, index) => (
            <li key={index}>
              {param.name && <code>{param.name}</code>} {param.reason}
            </li>
          ))}
        </ul>
      )}
      {seconds > 0 && <p>Podrás intentarlo de nuevo en {seconds} s.</p>}
      {error instanceof ApiError && error.requestId && (
        <p className="alert-meta">Código de soporte: {error.requestId}</p>
      )}
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry} disabled={seconds > 0}>
          Reintentar
        </button>
      )}
    </div>
  );
}
