import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importPKCS8, SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GatewayConfig } from '../../config/configuration';

export interface InternalJwtPayload {
  sub: string;
  /** Display name; personal data, never log it (BR-D1B-05). Truncated to {@link JWT_NAME_MAX_LENGTH}. */
  name: string;
  tenantId: string;
  branchId: string;
  roles: string[];
  /** Already filtered to the target service prefix by the caller (BR-D1B-05/12). */
  permissions: string[];
  sessionId: string;
  requestId: string;
}

export const JWT_NAME_MAX_LENGTH = 150;

/** Trim, then keep at most 150 characters (code points, not bytes). */
export function normalizeJwtName(name: string | null | undefined): string {
  return Array.from((name ?? '').trim())
    .slice(0, JWT_NAME_MAX_LENGTH)
    .join('');
}

@Injectable()
export class InternalJwtService implements OnModuleInit {
  private readonly logger = new Logger(InternalJwtService.name);
  private privateKey!: CryptoKey;
  private ttlSeconds!: number;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const { privateKeyPath, jwtTtlSeconds } = this.config.getOrThrow<GatewayConfig>('gateway');
    const absPath = resolve(process.cwd(), privateKeyPath);
    const pem = readFileSync(absPath, 'utf-8');
    this.privateKey = await importPKCS8(pem, 'EdDSA');
    this.ttlSeconds = jwtTtlSeconds;
    this.logger.log(`Ed25519 private key loaded from ${absPath}`);
  }

  async sign(payload: InternalJwtPayload, audience: string): Promise<string> {
    return new SignJWT({
      name: normalizeJwtName(payload.name),
      tenantId: payload.tenantId,
      branchId: payload.branchId,
      roles: payload.roles,
      permissions: payload.permissions,
      sessionId: payload.sessionId,
      requestId: payload.requestId,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'gateway-key-v1' })
      .setSubject(payload.sub)
      .setIssuer('gateway-identity-service')
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.privateKey);
  }
}
