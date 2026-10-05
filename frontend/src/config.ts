/** URLs configurables con variables de Vite (ver `.env.example`). */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
export const AUTH_URL = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? 'http://localhost:4000';

export const BRAND = {
  name: 'EcoAirlines',
  tagline: 'Vuela a donde sueñas, cuidando el planeta',
} as const;
