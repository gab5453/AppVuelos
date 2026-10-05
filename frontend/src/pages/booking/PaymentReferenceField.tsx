import { useId } from 'react';

/**
 * El contrato solo recibe una referencia de pago (`PaymentReference`): esta API no procesa
 * tarjetas, 3DS, autorización ni captura. En el entorno de prueba se genera una referencia simulada.
 */
export function PaymentReferenceField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>Referencia de pago</label>
      <div className="input-row">
        <input id={id} value={value} placeholder="pay_…" maxLength={68} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(`pay_demo_${crypto.randomUUID().slice(0, 8)}`)}>
          Generar de prueba
        </button>
      </div>
      <span className="muted small">La entrega la pasarela de pagos; nunca ingreses aquí datos de tarjeta.</span>
    </div>
  );
}
