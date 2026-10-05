import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AUTH_URL } from '../config';

export interface SessionUser {
  name: string;
  email: string;
}

interface Session {
  token: string;
  user: SessionUser;
  expiresAt: number;
}

interface AuthContextValue {
  token: string | null;
  user: SessionUser | null;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * El token vive SOLO en memoria (no en localStorage/sessionStorage): un script inyectado no puede
 * leerlo del almacenamiento y desaparece al cerrar o recargar la pestaña. La sesión se cierra sola
 * al vencer el JWT. El servidor de autenticación es externo a la API de vuelos (HALL-03).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const logout = useCallback(() => setSession(null), []);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(logout, Math.max(0, session.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session, logout]);

  const authenticate = useCallback(async (path: '/login' | '/register', body: Record<string, string>) => {
    let response: Response;
    try {
      response = await fetch(new URL(path, AUTH_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
      });
    } catch {
      throw new Error('No se pudo conectar con el servicio de autenticación.');
    }
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      user?: SessionUser;
      title?: string;
    };
    if (!response.ok || !data.access_token || !data.user) {
      throw new Error(data.title ?? 'No se pudo iniciar sesión.');
    }
    setSession({
      token: data.access_token,
      user: data.user,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      login: (email, password) => authenticate('/login', { email, password }),
      register: (name, email, password) => authenticate('/register', { name, email, password }),
      logout,
    }),
    [session, authenticate, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return context;
}
