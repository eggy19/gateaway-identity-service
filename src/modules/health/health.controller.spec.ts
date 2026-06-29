import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('reports an ok status for the service', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('gateway-identity-service');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
