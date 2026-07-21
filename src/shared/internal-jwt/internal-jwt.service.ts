import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Load `jose` dynamically at runtime because it's an ESM-only package.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GatewayConfig } from '../../config/configuration';
import { dynamicImport } from '../utils/dynamic-import';

export interface InternalJwtPayload {
  sub: string;
  tenantId: string;
  branchId: string;
  sessionId: string;
  requestId: string;
}

@Injectable()
export class InternalJwtService implements OnModuleInit {
  private readonly logger = new Logger(InternalJwtService.name);
  private privateKey!: CryptoKey;
  private ttlSeconds!: number;
  private joseModule: any | null = null;

  constructor(private readonly config: ConfigService) {}

  private async ensureJose() {
    if (!this.joseModule) {
      this.joseModule = await dynamicImport('jose');
    }
    return this.joseModule;
  }

  async onModuleInit(): Promise<void> {
    const { privateKeyPath, jwtTtlSeconds } = this.config.getOrThrow<GatewayConfig>('gateway');
    const absPath = resolve(process.cwd(), privateKeyPath);
    const pem = readFileSync(absPath, 'utf-8');
    const { importPKCS8 } = await this.ensureJose();
    this.privateKey = await importPKCS8(pem, 'EdDSA');
    this.ttlSeconds = jwtTtlSeconds;
    this.logger.log(`Ed25519 private key loaded from ${absPath}`);
  }

  async sign(payload: InternalJwtPayload, audience: string): Promise<string> {
    const { SignJWT } = await this.ensureJose();

    return new SignJWT({
      tenantId: payload.tenantId,
      branchId: payload.branchId,
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
