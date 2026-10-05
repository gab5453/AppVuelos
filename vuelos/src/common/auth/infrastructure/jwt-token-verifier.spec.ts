import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { loadAuthConfig, type AuthConfig, type SecretAuthConfig } from '../auth.config.js';
import { JwtTokenVerifier } from './jwt-token-verifier.js';
import { issueDevToken } from './dev-token-issuer.js';

const config = loadAuthConfig({ NODE_ENV: 'test' }) as SecretAuthConfig;
const secretKey = new TextEncoder().encode(config.secret);

function sign(payload: JWTPayload, overrides: { secret?: Uint8Array; issuer?: string; audience?: string; exp?: string | number } = {}) {
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(overrides.issuer ?? config.issuer)
    .setAudience(overrides.audience ?? config.audience)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? '5m');
  return jwt.sign(overrides.secret ?? secretKey);
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('JwtTokenVerifier (modo secreto HS256)', () => {
  const verifier = new JwtTokenVerifier(config);

  it('acepta un token válido y extrae sub y scopes del claim `scope`', async () => {
    const token = await issueDevToken({ sub: 'user-1', scopes: ['flights:read', 'flights:book'] }, config);
    await expect(verifier.verify(token)).resolves.toEqual({
      sub: 'user-1',
      scopes: ['flights:read', 'flights:book'],
      clientId: undefined,
    });
  });

  it('acepta scopes como arreglo en `scp` y toma clientId de `client_id`', async () => {
    const token = await sign({ sub: 'svc-1', scp: ['flights:webhooks'], client_id: 'partner-a' });
    await expect(verifier.verify(token)).resolves.toEqual({
      sub: 'svc-1',
      scopes: ['flights:webhooks'],
      clientId: 'partner-a',
    });
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = await sign({ sub: 'user-1' }, { secret: new TextEncoder().encode('x'.repeat(40)) });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rechaza un token expirado', async () => {
    const token = await sign({ sub: 'user-1' }, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rechaza `alg: none` (token sin firma)', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const token = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: 'attacker', iss: config.issuer, aud: config.audience, exp, scope: 'flights:book' })}.`;
    await expect(verifier.verify(token)).rejects.toThrow();
  });

  it('rechaza issuer o audience incorrectos', async () => {
    await expect(verifier.verify(await sign({ sub: 'user-1' }, { issuer: 'https://evil.example.com' }))).rejects.toThrow();
    await expect(verifier.verify(await sign({ sub: 'user-1' }, { audience: 'otra-api' }))).rejects.toThrow();
  });

  it('rechaza un token sin `sub`', async () => {
    await expect(verifier.verify(await sign({ scope: 'flights:read' }))).rejects.toThrow();
  });

  it('rechaza el antiguo formato mock `sub:scopes`', async () => {
    await expect(verifier.verify('user-1:flights:book')).rejects.toThrow();
  });
});

describe('JwtTokenVerifier (modo JWKS RS256)', () => {
  let server: Server;
  let verifier: JwtTokenVerifier;
  let privateKey: CryptoKey;
  const issuer = 'https://auth.example.com';
  const audience = 'vuelos-api';

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' };

    server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const jwksConfig: AuthConfig = {
      mode: 'jwks',
      jwksUrl: `http://127.0.0.1:${port}/jwks`,
      issuer,
      audience,
      algorithms: ['RS256'],
      clockToleranceSeconds: 5,
    };
    verifier = new JwtTokenVerifier(jwksConfig);
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('acepta un token firmado con la clave publicada en el JWKS', async () => {
    const token = await new SignJWT({ scope: 'flights:read' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
      .setSubject('user-1')
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifier.verify(token)).resolves.toMatchObject({ sub: 'user-1', scopes: ['flights:read'] });
  });

  it('rechaza un HS256 aunque use la clave pública como secreto (confusión de algoritmos)', async () => {
    const token = await sign({ sub: 'attacker' }, { issuer, audience });
    await expect(verifier.verify(token)).rejects.toThrow();
  });
});

describe('issueDevToken', () => {
  it('se niega a emitir tokens en producción', async () => {
    await expect(issueDevToken({ sub: 'u', scopes: [] }, config, { NODE_ENV: 'production' })).rejects.toThrow();
  });

  it('se niega a emitir tokens si la API verifica contra un JWKS', async () => {
    const jwksConfig = loadAuthConfig({ AUTH_JWKS_URL: 'https://auth.example.com/jwks' });
    await expect(issueDevToken({ sub: 'u', scopes: [] }, jwksConfig, {})).rejects.toThrow();
  });
});
