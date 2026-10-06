import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export const WEBHOOK_URL_POLICY = Symbol('WEBHOOK_URL_POLICY');

export type HostResolver = (hostname: string) => Promise<string[]>;

export class WebhookUrlRejectedError extends Error {}

/**
 * Rangos no enrutables públicamente: loopback, privados, link-local (incluye metadata cloud), CGNAT, multicast, reservados.
 * Se usan listas separadas por familia: BlockList compara las IPv4 también contra reglas IPv6 de IPv4 mapeada
 * (`::ffff:0:0/96`), que cubren todo el espacio IPv4 y bloquearían cualquier dirección.
 */
const NON_PUBLIC_V4 = new BlockList();
const NON_PUBLIC_V6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC_V4.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96], // IPv4 mapeada: no hay webhooks legítimos que la usen
  ['64:ff9b::', 96], // NAT64
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NON_PUBLIC_V6.addSubnet(network, prefix, 'ipv6');
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal'];

const defaultResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * Política anti-SSRF para `WebhookSubscription.url`. Solo es estricta en producción: en desarrollo
 * se permite registrar `http://localhost` para probar la recepción de eventos.
 * En modo estricto exige https y que el host (y todas sus IPs resueltas) sea público.
 * Nota: el despachador real deberá repetir la comprobación al enviar (protección ante DNS rebinding).
 */
export class WebhookUrlPolicy {
  constructor(
    private readonly strict: boolean,
    private readonly resolve: HostResolver = defaultResolver,
  ) {}

  async assertAllowed(rawUrl: string): Promise<void> {
    if (!this.strict) {
      return;
    }

    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') {
      throw new WebhookUrlRejectedError('must use https');
    }
    if (url.username || url.password) {
      throw new WebhookUrlRejectedError('must not contain credentials');
    }

    const host = url.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
    if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
      throw new WebhookUrlRejectedError('host is not public');
    }

    let addresses: string[];
    if (isIP(host)) {
      addresses = [host];
    } else {
      try {
        addresses = await this.resolve(host);
      } catch {
        throw new WebhookUrlRejectedError('host could not be resolved');
      }
    }

    if (addresses.length === 0 || addresses.some(isNonPublic)) {
      throw new WebhookUrlRejectedError('host is not public');
    }
  }
}

function isNonPublic(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  return family === 4 ? NON_PUBLIC_V4.check(address, 'ipv4') : NON_PUBLIC_V6.check(address, 'ipv6');
}
