import { useId } from 'react';

/** Campos de formulario con etiqueta asociada (accesibles), compartidos por el checkout y el perfil. */
export function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = true,
  error,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  min?: string;
  max?: string;
  /** Mensaje de error bajo el campo (marca el input como inválido). */
  error?: string;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${fieldId}-error` : undefined} {...rest} />
      {error && <span id={`${fieldId}-error`} className="field-error" role="alert">{error}</span>}
    </div>
  );
}

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  const fieldId = useId();
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <select id={fieldId} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </div>
  );
}
