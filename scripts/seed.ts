/**
 * Seeds the first tenant (+ default branch) and an admin user, breaking the
 * bootstrap cycle (creating a tenant/user normally requires an authenticated
 * user). Exercises the real TenantService / UserService flows.
 *
 *   npx ts-node -T scripts/seed.ts
 *
 * Configurable via SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars.
 */
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BranchService } from '../src/modules/branch/services/branch.service';
import { TenantService } from '../src/modules/tenant/services/tenant.service';
import { UserService } from '../src/modules/user/services/user.service';

loadEnv();

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const TENANT_CODE = 'CLINIC-001';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const tenantService = app.get(TenantService);
    const branchService = app.get(BranchService);
    const userService = app.get(UserService);

    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@clinic.test';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345!';

    if (await userService.findByEmail(adminEmail)) {
      // eslint-disable-next-line no-console
      console.log(`Admin "${adminEmail}" already exists — nothing to seed.`);
      return;
    }

    const existingTenant = (await tenantService.findAll()).find((t) => t.code === TENANT_CODE);
    const tenant =
      existingTenant ??
      (await tenantService.create({ name: 'Demo Clinic', code: TENANT_CODE }, SYSTEM_ACTOR));

    const branch = (await branchService.findByTenant(tenant.id))[0];

    const admin = await userService.create(
      {
        email: adminEmail,
        password: adminPassword,
        name: 'Administrator',
        tenantId: tenant.id,
        branchId: branch.id,
      },
      SYSTEM_ACTOR,
    );

    // eslint-disable-next-line no-console
    console.log('Seed complete:');
    // eslint-disable-next-line no-console
    console.log(`  tenant : ${tenant.id} (${tenant.code})`);
    // eslint-disable-next-line no-console
    console.log(`  branch : ${branch.id} (${branch.code})`);
    // eslint-disable-next-line no-console
    console.log(`  admin  : ${admin.id} <${adminEmail}> / password: ${adminPassword}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
