import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { RequestLoggerMiddleware } from './request-logger.middleware';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

function run(headers: Record<string, string>, url = '/api/v1/inventory/x?search=Paracetamol') {
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader: jest.fn(),
  });
  const req = { method: 'GET', originalUrl: url, headers } as never as {
    requestId?: string;
    headers: Record<string, string>;
  };
  new RequestLoggerMiddleware().use(req as never, res as never, jest.fn());
  res.emit('finish');
  return { req, res };
}

describe('RequestLoggerMiddleware', () => {
  let logSpy: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('BR-M1-03: logs path without query string', () => {
    run({});
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0];
    expect(line).toContain('/api/v1/inventory/x ');
    expect(line).not.toContain('Paracetamol');
    expect(line).not.toContain('?');
  });

  it('BR-M1-05: keeps a valid UUID X-Request-Id', () => {
    const { req, res } = run({ 'x-request-id': UUID });
    expect(req.requestId).toBe(UUID);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', UUID);
  });

  it('BR-M1-05: replaces an invalid X-Request-Id with a new UUID (AC-M1-03)', () => {
    const { req, res } = run({ 'x-request-id': 'abc\nINJECT' });
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.requestId).not.toContain('INJECT');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(logSpy.mock.calls[0][0]).not.toContain('INJECT');
  });

  it.each([
    'not-a-uuid',
    '',
    '550e8400-e29b-41d4-a716-44665544000',
    '550e8400e29b41d4a716446655440000',
    `${UUID}\r\nX-Evil: 1`,
  ])(
    'AC-M1-03: non-UUID X-Request-Id %j replaced by new UUID in response header and log',
    (bad) => {
      const { req, res } = run({ 'x-request-id': bad });
      expect(req.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(req.requestId).not.toBe(bad);
      expect(res.setHeader).toHaveBeenCalledTimes(1);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
      expect(logSpy.mock.calls[0][0]).toContain(`[${req.requestId}]`);
    },
  );

  it('array X-Request-Id: first element decides', () => {
    const a = run({ 'x-request-id': [UUID, 'zzz'] as never });
    expect(a.req.requestId).toBe(UUID);
    const b = run({ 'x-request-id': ['zzz', UUID] as never });
    expect(b.req.requestId).not.toBe(UUID);
  });

  it('BR-M1-03: log has no cookie/authorization/body/query/fragment', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/auth/login?token=QUERYSECRET#FRAGSECRET',
      headers: { cookie: 'sid=COOKIESECRET', authorization: 'Bearer AUTHSECRET' },
      body: { password: 'BODYSECRET' },
    };
    const res = Object.assign(new EventEmitter(), { statusCode: 401, setHeader: jest.fn() });
    new RequestLoggerMiddleware().use(req as never, res as never, jest.fn());
    res.emit('finish');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0][0]);
    expect(line).toMatch(/^POST \/api\/v1\/auth\/login 401 \d+ms \[[0-9a-f-]{36}\]$/);
    for (const bad of ['QUERYSECRET', 'FRAGSECRET', 'COOKIESECRET', 'AUTHSECRET', 'BODYSECRET']) {
      expect(line).not.toContain(bad);
    }
  });

  it('calls next() and logs only on finish', () => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200, setHeader: jest.fn() });
    const next = jest.fn();
    new RequestLoggerMiddleware().use(
      { method: 'GET', originalUrl: '/x', headers: {} } as never,
      res as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
