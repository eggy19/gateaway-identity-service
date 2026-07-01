import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';

// Mock jose before any import resolves it — avoids ESM-in-Jest issues (same
// pattern used for better-auth). Production code calls jose at runtime where
// Node 22 loads ESM natively; tests verify the call contract instead.
const mockSign = jest.fn().mockResolvedValue('signed.jwt.token');
const mockChain = {
  setProtectedHeader: jest.fn().mockReturnThis(),
  setSubject: jest.fn().mockReturnThis(),
  setIssuer: jest.fn().mockReturnThis(),
  setAudience: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  sign: mockSign,
};
const MockSignJWT = jest.fn().mockImplementation(() => mockChain);
const mockImportPKCS8 = jest.fn().mockResolvedValue({ type: 'private' } as unknown as CryptoKey);

jest.mock('jose', () => ({
  SignJWT: MockSignJWT,
  importPKCS8: mockImportPKCS8,
}));

jest.mock('node:fs', () => ({
  readFileSync: jest.fn().mockReturnValue('-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----'),
}));

import { InternalJwtService } from './internal-jwt.service';

describe('InternalJwtService', () => {
  let service: InternalJwtService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue({
      privateKeyPath: './certs/private.pem',
      jwtTtlSeconds: 300,
    }),
  } as unknown as ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockChain.setProtectedHeader.mockReturnThis();
    mockChain.setSubject.mockReturnThis();
    mockChain.setIssuer.mockReturnThis();
    mockChain.setAudience.mockReturnThis();
    mockChain.setIssuedAt.mockReturnThis();
    mockChain.setExpirationTime.mockReturnThis();
    mockSign.mockResolvedValue('signed.jwt.token');

    service = new InternalJwtService(config);
    await service.onModuleInit();
  });

  it('loads the private key from the configured path on init', () => {
    expect(readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/certs[/\\]private\.pem/),
      'utf-8',
    );
    expect(mockImportPKCS8).toHaveBeenCalledWith(
      expect.stringContaining('BEGIN PRIVATE KEY'),
      'EdDSA',
    );
  });

  it('sign() calls SignJWT with the correct claims and returns a token', async () => {
    const payload = {
      sub: 'user-uuid-1',
      tenantId: 'tenant-uuid-1',
      branchId: 'branch-uuid-1',
      sessionId: 'session-uuid-1',
      requestId: 'req-uuid-1',
    };

    const token = await service.sign(payload, 'inventory-service');

    expect(MockSignJWT).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      branchId: 'branch-uuid-1',
      sessionId: 'session-uuid-1',
      requestId: 'req-uuid-1',
    });
    expect(mockChain.setSubject).toHaveBeenCalledWith('user-uuid-1');
    expect(mockChain.setIssuer).toHaveBeenCalledWith('gateway-identity-service');
    expect(mockChain.setAudience).toHaveBeenCalledWith('inventory-service');
    expect(mockChain.setExpirationTime).toHaveBeenCalledWith('300s');
    expect(token).toBe('signed.jwt.token');
  });

  it('sign() uses a different audience per downstream service', async () => {
    const payload = {
      sub: 'u1',
      tenantId: 't1',
      branchId: 'b1',
      sessionId: 's1',
      requestId: 'r1',
    };

    await service.sign(payload, 'inventory-service');
    expect(mockChain.setAudience).toHaveBeenLastCalledWith('inventory-service');

    await service.sign(payload, 'billing-service');
    expect(mockChain.setAudience).toHaveBeenLastCalledWith('billing-service');
  });
});
