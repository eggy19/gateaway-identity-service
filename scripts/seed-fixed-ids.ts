/**
 * Seeds a tenant + branch with fixed UUIDs, plus an admin user assigned to
 * that branch. Useful for local development when downstream services expect
 * specific tenant/branch IDs.
 *
 *   npx ts-node -T scripts/seed-fixed-ids.ts
 *
 * Configurable via env vars:
 *   SEED_ADMIN_EMAIL    (default: admin@clinic.test)
 *   SEED_ADMIN_PASSWORD (default: Admin12345!)
 */
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TenantEntity } from '../src/modules/tenant/entities/tenant.entity';
import { TenantStatus } from '../src/modules/tenant/enums/tenant-status.enum';
import { BranchEntity } from '../src/modules/branch/entities/branch.entity';
import { BranchStatus } from '../src/modules/branch/enums/branch-status.enum';
import { UserService } from '../src/modules/user/services/user.service';

loadEnv();

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';
const TENANT_ID    = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRANCH_ID    = 'bbbbbbbb-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource  = app.get(DataSource);
    const userService = app.get(UserService);

    const adminEmail    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@clinic.test';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin12345!';

    await dataSource.transaction(async (manager) => {
      // ── Tenant ──────────────────────────────────────────────────────────
      const existingTenant = await manager.findOne(TenantEntity, {
        where: { id: TENANT_ID },
      });

      if (!existingTenant) {
        await manager.save(TenantEntity, {
          id:        TENANT_ID,
          name:      'Demo Clinic',
          code:      'CLINIC-FIXED-001',
          status:    TenantStatus.Active,
          createdBy: SYSTEM_ACTOR,
          updatedBy: SYSTEM_ACTOR,
        });
        console.log(`  tenant created : ${TENANT_ID}`);
      } else {
        console.log(`  tenant exists  : ${TENANT_ID}`);
      }

      // ── Branch ───────────────────────────────────────────────────────────
      const existingBranch = await manager.findOne(BranchEntity, {
        where: { id: BRANCH_ID },
      });

      if (!existingBranch) {
        await manager.save(BranchEntity, {
          id:        BRANCH_ID,
          tenantId:  TENANT_ID,
          name:      'Main Branch',
          code:      'MAIN',
          status:    BranchStatus.Active,
          createdBy: SYSTEM_ACTOR,
          updatedBy: SYSTEM_ACTOR,
        });
        console.log(`  branch created : ${BRANCH_ID}`);
      } else {
        console.log(`  branch exists  : ${BRANCH_ID}`);
      }
    });

    // ── Admin user ────────────────────────────────────────────────────────
    const existing = await userService.findByEmail(adminEmail);
    if (!existing) {
      const admin = await userService.create(
        {
          email:    adminEmail,
          password: adminPassword,
          name:     'Administrator',
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
        },
        SYSTEM_ACTOR,
      );
      console.log(`  admin created  : ${admin.id} <${adminEmail}>`);
    } else {
      console.log(`  admin exists   : ${existing.id} <${adminEmail}>`);
    }

    console.log('\nSeed fixed-ids complete:');
    console.log(`  tenant : ${TENANT_ID}`);
    console.log(`  branch : ${BRANCH_ID}`);
    console.log(`  email  : ${adminEmail}  password: ${adminPassword}`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
