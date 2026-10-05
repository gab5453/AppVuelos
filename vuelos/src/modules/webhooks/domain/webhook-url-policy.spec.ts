import { WebhookUrlPolicy, WebhookUrlRejectedError, type HostResolver } from './webhook-url-policy.js';

const resolvesTo =
  (...addresses: string[]): HostResolver =>
  async () =>
    addresses;

describe('WebhookUrlPolicy', () => {
  it('fuera de producción no restringe (permite probar con localhost)', async () => {
    await expect(new WebhookUrlPolicy(false).assertAllowed('http://localhost:4000/hooks')).resolves.toBeUndefined();
  });

  describe('en modo estricto (producción)', () => {
    const policy = new WebhookUrlPolicy(true, resolvesTo('93.184.215.14'));

    it('acepta https con host público', async () => {
      await expect(policy.assertAllowed('https://partner.example.com/hooks')).resolves.toBeUndefined();
    });

    it.each(['https://93.184.215.14/hooks', 'https://[2606:2800:21f:cb07:6820:80da:af6b:8b2c]/hooks'])(
      'acepta IPs públicas literales: %s',
      async (url) => {
        await expect(policy.assertAllowed(url)).resolves.toBeUndefined();
      },
    );

    it('exige https', async () => {
      await expect(policy.assertAllowed('http://partner.example.com/hooks')).rejects.toThrow('must use https');
    });

    it('rechaza credenciales embebidas en la URL', async () => {
      await expect(policy.assertAllowed('https://user:pass@partner.example.com/')).rejects.toThrow(WebhookUrlRejectedError);
    });

    it.each([
      'https://localhost/hooks',
      'https://api.localhost/hooks',
      'https://db.internal/hooks',
      'https://127.0.0.1/hooks',
      'https://10.1.2.3/hooks',
      'https://172.20.0.1/hooks',
      'https://192.168.1.10/hooks',
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/hooks',
      'https://[fd00::1]/hooks',
      'https://[::ffff:10.0.0.1]/hooks',
    ])('rechaza destinos no públicos: %s', async (url) => {
      await expect(policy.assertAllowed(url)).rejects.toThrow(WebhookUrlRejectedError);
    });

    it('rechaza hostnames que resuelven a IPs privadas', async () => {
      const rebinding = new WebhookUrlPolicy(true, resolvesTo('93.184.215.14', '10.0.0.5'));
      await expect(rebinding.assertAllowed('https://evil.example.com/')).rejects.toThrow('host is not public');
    });

    it('rechaza hostnames que no resuelven', async () => {
      const failing = new WebhookUrlPolicy(true, async () => {
        throw new Error('ENOTFOUND');
      });
      await expect(failing.assertAllowed('https://nope.example.com/')).rejects.toThrow('host could not be resolved');
    });
  });
});
