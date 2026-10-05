import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'oauth2Scopes';

/** Declara los scopes OAuth2 requeridos (security.OAuth2Security del contrato) para un endpoint. */
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
