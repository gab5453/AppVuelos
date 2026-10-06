import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LeafLogo } from '../components/LeafLogo';

/** Solo se permiten redirecciones internas tras el login (evita open redirect con `?next=https://…`). */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function LoginPage() {
  const { token, login, register } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to={next} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const user = mode === 'LOGIN' ? await login(email.trim(), password) : await register(name.trim(), email.trim(), password);
      // El administrador entra directo a su panel, salvo que viniera de otra página.
      navigate(user.role === 'ADMIN' && next === '/' ? '/admin' : next, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <LeafLogo size={48} />
        <h1>{mode === 'LOGIN' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta'}</h1>
        {mode === 'REGISTER' && (
          <label className="field">
            Nombre completo
            <input value={name} autoComplete="name" maxLength={80} required onChange={(event) => setName(event.target.value)} />
          </label>
        )}
        <label className="field">
          Correo
          <input type="email" value={email} autoComplete="email" maxLength={254} required onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          Contraseña
          <input
            type="password"
            value={password}
            autoComplete={mode === 'LOGIN' ? 'current-password' : 'new-password'}
            minLength={8}
            maxLength={128}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'LOGIN' ? 'Ingresar' : 'Crear cuenta'}
        </button>
        <button type="button" className="btn btn-link" onClick={() => setMode(mode === 'LOGIN' ? 'REGISTER' : 'LOGIN')}>
          {mode === 'LOGIN' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Ingresa'}
        </button>
        <p className="muted small">
          Entorno de prueba: cliente <code>demo@ecoairlines.test</code> / <code>EcoDemo2026</code>; administrador <code>admin@ecoairlines.test</code> / <code>EcoAdmin2026</code>. Tu sesión dura 1 hora y se cierra al recargar la página.
        </p>
      </form>
    </div>
  );
}
