import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { BLOCKED_REQUEST_HEADERS, GatewayService } from './gateway.service';

const user = { id: 'user-1' } as never;
const session = { id: 'sess-1' } as never;

function setup(
  response: { status: number; data: unknown } | Error = {
    status: 200,
    data: { secret: 'BODY-DATA' },
  },
) {
  const request = jest.fn<Promise<unknown>, [{ url: string; headers: Record<string, string> }]>();
  if (response instanceof Error) request.mockRejectedValue(response);
  else request.mockResolvedValue(response);
  const sign = jest.fn().mockResolvedValue('jwt-token');
  const findPrimary = jest.fn().mockResolvedValue({ branchId: 'b1', branch: { tenantId: 't1' } });
  const config = {
    getOrThrow: () => ({ services: { inventory: 'http://inv:3001' } }),
  };
  const service = new GatewayService(
    { axiosRef: { request } } as never,
    { sign } as never,
    { findPrimaryByUserId: findPrimary } as never,
    config as never,
  );
  return { service, request, sign, findPrimary };
}

const makeReq = (url: string, headers: Record<string, string> = {}, method = 'GET') =>
  ({ method, originalUrl: url, url, headers, body: undefined, requestId: 'rid-1' }) as never;

describe('GatewayService', () => {
  let warn: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;
  let debug: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;
  let error: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;
  let log: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  describe('M1 logging', () => {
    it('BR-M1-01/02/03/06: one line, no body, no query, no headers', async () => {
      const { service } = setup();
      await service.forward(
        makeReq('/api/v1/inventory/inventory/stock-summary?search=Paracetamol', {
          authorization: 'Bearer SECRET',
          cookie: 'sid=SECRET',
        }),
        user,
        session,
        'inventory',
      );
      const all = [...debug.mock.calls, ...log.mock.calls, ...warn.mock.calls, ...error.mock.calls];
      expect(all).toHaveLength(1);
      const line = all[0][0];
      expect(line).toContain('service=inventory');
      expect(line).toContain('method=GET');
      expect(line).toContain('path=/api/v1/inventory/inventory/stock-summary ');
      expect(line).toContain('status=200');
      expect(line).toContain('durationMs=');
      expect(line).toContain('requestId=rid-1');
      expect(line).toContain('userId=user-1');
      expect(line).toContain('tenantId=t1');
      for (const bad of ['Paracetamol', 'BODY-DATA', 'SECRET', 'jwt-token', '?']) {
        expect(line).not.toContain(bad);
      }
    });

    it('BR-M1-04: 2xx/4xx logged at debug', async () => {
      const { service } = setup({ status: 404, data: {} });
      await service.forward(makeReq('/api/v1/inventory/x'), user, session, 'inventory');
      expect(debug).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it('BR-M1-04: downstream 5xx logged at warn', async () => {
      const { service } = setup({ status: 500, data: { msg: 'BODY-DATA' } });
      await service.forward(makeReq('/api/v1/inventory/x'), user, session, 'inventory');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).not.toContain('BODY-DATA');
    });

    it('BR-M1-04: downstream unreachable -> 503 and error log', async () => {
      const axiosErr = Object.assign(new Error('ECONNREFUSED'), { isAxiosError: true });
      const { service } = setup(axiosErr);
      await expect(
        service.forward(makeReq('/api/v1/inventory/x'), user, session, 'inventory'),
      ).rejects.toMatchObject({ status: 503 });
      expect(error).toHaveBeenCalledTimes(1);
    });
  });

  describe('M2 path rejection', () => {
    it.each([
      '/api/v1/inventory/internal/inventory/stock/check?item_id=1',
      '/api/v1/inventory/Internal/x',
      '/api/v1/inventory/%69nternal/x',
      '/api/v1/inventory/master/internal',
      '/api/v1/inventory/master%2Finternal/x',
    ])('BR-M2-03: %s -> 404, not forwarded, no JWT, warn', async (url) => {
      const { service, request, sign, findPrimary } = setup();
      await expect(
        service.forward(makeReq(url), user, session, 'inventory'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(request).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(findPrimary).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).not.toContain('item_id');
    });

    it.each([
      '/api/v1/inventory/master/items/../../internal/inventory/stock/check',
      '/api/v1/inventory/master/./items',
      '/api/v1/inventory/master/%2e%2e/x',
      '/api/v1/inventory/master/%2E/x',
      '/api/v1/inventory/master/%ZZ/x',
    ])('BR-M2-02: %s -> 400, not forwarded', async (url) => {
      const { service, request, sign } = setup();
      await expect(
        service.forward(makeReq(url), user, session, 'inventory'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(request).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });

    it.each([
      '/api/v1/inventory/master%5Cinternal/x',
      '/api/v1/inventory/master%5cinternal/x',
      '/api/v1/inventory/master\\internal/x',
      '/api/v1/inventory/%2Finternal/x',
      '/api/v1/inventory/master%2finternal',
      '/api/v1/inventory/master%2FINTERNAL/x',
    ])('Zoro: %s -> 404 (backslash / %2F producing internal segment)', async (url) => {
      const { service, request, sign } = setup();
      await expect(
        service.forward(makeReq(url), user, session, 'inventory'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(request).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });

    it('Zoro: double-encoded %2569nternal is decoded once only -> forwarded, not 404', async () => {
      const { service, request } = setup();
      const res = await service.forward(
        makeReq('/api/v1/inventory/%2569nternal/x'),
        user,
        session,
        'inventory',
      );
      expect(res.status).toBe(200);
      expect(request.mock.calls[0][0].url).toBe('http://inv:3001/inventory/%2569nternal/x');
    });

    it.each([
      '/api/v1/inventory/master%5C..%5Cx',
      '/api/v1/inventory/master/..%2Fx',
      '/api/v1/inventory/master/%2e%2E%5Cx',
      '/api/v1/inventory/master/%E0%A4%A/x',
    ])('BR-M2-02: %s -> 400', async (url) => {
      const { service, request } = setup();
      await expect(
        service.forward(makeReq(url), user, session, 'inventory'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(request).not.toHaveBeenCalled();
    });

    it('BR-M2-03: internal only in query string is not blocked', async () => {
      const { service, request } = setup();
      await service.forward(
        makeReq('/api/v1/inventory/master/items?q=internal'),
        user,
        session,
        'inventory',
      );
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('AC-M2-06: normal path is forwarded unchanged (query kept for downstream)', async () => {
      const { service, request } = setup();
      const res = await service.forward(
        makeReq('/api/v1/inventory/master/items?page=1'),
        user,
        session,
        'inventory',
      );
      expect(res.status).toBe(200);
      expect(request.mock.calls[0][0].url).toBe('http://inv:3001/inventory/master/items?page=1');
    });
  });

  describe('G3 header denylist', () => {
    it('BR-M2-04/05: strips denied headers, overrides x-user-context, keeps others', async () => {
      const { service, request } = setup();
      await service.forward(
        makeReq(
          '/api/v1/inventory/master/categories',
          {
            Authorization: 'Bearer xyz',
            'Proxy-Authorization': 'x',
            Cookie: 'a=b',
            Host: 'evil',
            'X-Tenant-Id': 't-evil',
            'X-Branch-Id': 'b-evil',
            'X-User-Id': 'u-evil',
            'X-User-Context': 'palsu',
            Connection: 'keep-alive',
            'Keep-Alive': 'timeout=5',
            'Transfer-Encoding': 'chunked',
            Upgrade: 'websocket',
            TE: 'trailers',
            Trailer: 'x',
            'Content-Length': '999',
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': 'k1',
          },
          'POST',
        ),
        user,
        session,
        'inventory',
      );
      const sent = request.mock.calls[0][0].headers;
      const keys = Object.keys(sent).map((k) => k.toLowerCase());
      for (const denied of [
        'authorization',
        'proxy-authorization',
        'cookie',
        'host',
        'x-tenant-id',
        'x-branch-id',
        'x-user-id',
        'connection',
        'keep-alive',
        'transfer-encoding',
        'upgrade',
        'te',
        'trailer',
        'content-length',
      ]) {
        expect(keys).not.toContain(denied);
      }
      expect(sent['x-user-context']).toBe('jwt-token');
      expect(sent['x-request-id']).toBe('rid-1');
      expect(sent['Content-Type']).toBe('application/json');
      expect(sent['Accept']).toBe('application/json');
      expect(sent['Idempotency-Key']).toBe('k1');
    });

    it('KP-29: content-encoding and proxy-connection are stripped', async () => {
      const { service, request } = setup();
      await service.forward(
        makeReq(
          '/api/v1/inventory/master/categories',
          {
            'Content-Encoding': 'gzip',
            'Proxy-Connection': 'keep-alive',
            Accept: 'application/json',
          },
          'POST',
        ),
        user,
        session,
        'inventory',
      );
      const keys = Object.keys(request.mock.calls[0][0].headers).map((k) => k.toLowerCase());
      expect(keys).not.toContain('content-encoding');
      expect(keys).not.toContain('proxy-connection');
      expect(keys).toContain('accept');
    });

    it('KP-29: locks the full denylist so it cannot shrink unnoticed (BR-M2-04)', () => {
      expect([...BLOCKED_REQUEST_HEADERS].sort()).toEqual(
        [
          'authorization',
          'connection',
          'content-encoding',
          'content-length',
          'cookie',
          'host',
          'keep-alive',
          'proxy-authorization',
          'proxy-connection',
          'te',
          'trailer',
          'transfer-encoding',
          'upgrade',
          'x-branch-id',
          'x-tenant-id',
          'x-user-context',
          'x-user-id',
        ].sort(),
      );
    });

    it.each(['PUT', 'PATCH', 'DELETE', 'POST', 'GET'])(
      'Zoro: denylist (mixed-case names) stripped for %s',
      async (method) => {
        const { service, request } = setup();
        await service.forward(
          makeReq(
            '/api/v1/inventory/master/categories/1',
            {
              AUTHORIZATION: 'Bearer xyz',
              cOoKiE: 'a=b',
              hOsT: 'evil',
              'x-TENANT-id': 't-evil',
              'X-BRANCH-ID': 'b-evil',
              'x-user-ID': 'u-evil',
              'X-USER-CONTEXT': 'palsu',
              'CONTENT-LENGTH': '1',
              'Transfer-ENCODING': 'chunked',
              'Content-Type': 'application/json',
            },
            method,
          ),
          user,
          session,
          'inventory',
        );
        const cfg = request.mock.calls[0][0] as unknown as {
          method: string;
          headers: Record<string, string>;
        };
        expect(cfg.method).toBe(method);
        const keys = Object.keys(cfg.headers);
        for (const denied of [
          'authorization',
          'cookie',
          'host',
          'x-tenant-id',
          'x-branch-id',
          'x-user-id',
          'content-length',
          'transfer-encoding',
        ]) {
          expect(keys.map((k) => k.toLowerCase())).not.toContain(denied);
        }
        expect(keys.filter((k) => k.toLowerCase() === 'x-user-context')).toEqual([
          'x-user-context',
        ]);
        expect(cfg.headers['x-user-context']).toBe('jwt-token');
        expect(Object.values(cfg.headers)).not.toContain('palsu');
        expect(cfg.headers['Content-Type']).toBe('application/json');
      },
    );

    it('AC-M2-05: body forwarded is req.body; client content-length not forwarded', async () => {
      const { service, request } = setup();
      const body = { name: 'Paracetamol', qty: 3 };
      const req = {
        method: 'POST',
        originalUrl: '/api/v1/inventory/master/items',
        url: '/api/v1/inventory/master/items',
        headers: { 'content-length': '5', 'content-type': 'application/json' },
        body,
        requestId: 'rid-1',
      } as never;
      await service.forward(req, user, session, 'inventory');
      const cfg = request.mock.calls[0][0] as unknown as {
        data: unknown;
        headers: Record<string, string>;
      };
      expect(cfg.data).toBe(body);
      expect(Object.keys(cfg.headers).map((k) => k.toLowerCase())).not.toContain('content-length');
    });

    it('array-valued headers are joined; denylist still wins', async () => {
      const { service, request } = setup();
      const req = {
        method: 'GET',
        originalUrl: '/api/v1/inventory/x',
        url: '/api/v1/inventory/x',
        headers: { 'x-custom': ['a', 'b'], cookie: ['a=1', 'b=2'] },
        body: undefined,
        requestId: 'rid-1',
      } as never;
      await service.forward(req, user, session, 'inventory');
      const h = request.mock.calls[0][0].headers;
      expect(h['x-custom']).toBe('a, b');
      expect(h['cookie']).toBeUndefined();
    });
  });

  describe('M1 extra log leakage', () => {
    it('log lines contain no body/query/cookie/authorization (200, 5xx, 503, blocked)', async () => {
      const leak = ['BODYSECRET', 'QUERYSECRET', 'COOKIESECRET', 'AUTHSECRET', 'jwt-token'];
      const headers = { cookie: 'sid=COOKIESECRET', authorization: 'Bearer AUTHSECRET' };
      const mk = (url = '/api/v1/inventory/master/items?q=QUERYSECRET') =>
        ({
          method: 'POST',
          originalUrl: url,
          url,
          headers,
          body: { x: 'BODYSECRET' },
          requestId: 'rid-1',
        }) as never;

      await setup({ status: 200, data: {} }).service.forward(mk(), user, session, 'inventory');
      await setup({ status: 502, data: 'BODYSECRET' }).service.forward(
        mk(),
        user,
        session,
        'inventory',
      );
      const axiosErr = Object.assign(new Error('connect QUERYSECRET AUTHSECRET'), {
        isAxiosError: true,
      });
      await expect(
        setup(axiosErr).service.forward(mk(), user, session, 'inventory'),
      ).rejects.toMatchObject({ status: 503 });
      await expect(
        setup().service.forward(
          mk('/api/v1/inventory/internal/x?q=QUERYSECRET'),
          user,
          session,
          'inventory',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      const all = [...debug.mock.calls, ...log.mock.calls, ...warn.mock.calls, ...error.mock.calls];
      expect(all).toHaveLength(4);
      for (const call of all) {
        const text = call.map(String).join(' ');
        for (const bad of leak) expect(text).not.toContain(bad);
      }
    });

    it('503 message does not leak axios error detail', async () => {
      const axiosErr = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:3001'), {
        isAxiosError: true,
      });
      const { service } = setup(axiosErr);
      await expect(
        service.forward(makeReq('/api/v1/inventory/x'), user, session, 'inventory'),
      ).rejects.toThrow(/^Downstream service 'inventory' is unavailable$/);
    });

    it('non-axios error is rethrown, not converted to 503', async () => {
      const { service } = setup(new TypeError('boom'));
      await expect(
        service.forward(makeReq('/api/v1/inventory/x'), user, session, 'inventory'),
      ).rejects.toBeInstanceOf(TypeError);
    });
  });
});
