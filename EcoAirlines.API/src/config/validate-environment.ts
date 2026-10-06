import { loadAuthConfig } from '../auth/auth.config.js';
import { loadSecurityConfig } from '../security/security.config.js';

const NODE_ENVS = ['development', 'production', 'test'];
const BOOLEAN_FLAGS = ['SWAGGER_ENABLED', 'HTTP_ACCESS_LOG'];

/**
 * Valida toda la configuración antes de crear la aplicación y devuelve TODOS los errores
 * encontrados (no solo el primero), para que una configuración incorrecta se corrija de una vez.
 * Una lista vacía significa que la configuración es válida.
 */
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];

  if (env.NODE_ENV !== undefined && !NODE_ENVS.includes(env.NODE_ENV)) {
    errors.push(`NODE_ENV debe ser uno de: ${NODE_ENVS.join(', ')}.`);
  }

  if (env.PORT !== undefined) {
    const port = Number(env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      errors.push('PORT debe ser un entero entre 1 y 65535.');
    }
  }

  for (const flag of BOOLEAN_FLAGS) {
    if (env[flag] !== undefined && !['true', 'false'].includes(env[flag])) {
      errors.push(`${flag} debe ser "true" o "false".`);
    }
  }

  for (const name of ['ASYNC_PROCESSING_DELAY_MS', 'CHECK_IN_WINDOW_HOURS']) {
    const value = env[name];
    if (value !== undefined && !(Number.isInteger(Number(value)) && Number(value) > 0)) {
      errors.push(`${name} debe ser un entero positivo.`);
    }
  }

  if (Boolean(env.HTTPS_KEY_PATH) !== Boolean(env.HTTPS_CERT_PATH)) {
    errors.push('HTTPS_KEY_PATH y HTTPS_CERT_PATH deben definirse juntos.');
  }

  for (const load of [loadAuthConfig, loadSecurityConfig]) {
    try {
      load(env);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return errors;
}
