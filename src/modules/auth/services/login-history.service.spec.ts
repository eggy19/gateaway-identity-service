import { BranchService } from '../../branch/services/branch.service';
import { TenantService } from '../../tenant/services/tenant.service';
import { UserService } from '../../user/services/user.service';
import { LoginHistoryEntity } from '../entities/login-history.entity';
import { LoginResult } from '../enums/login-result.enum';
import { LoginHistoryQueryDto } from '../dto/login-history-query.dto';
import { LoginHistoryRepository } from '../repositories/login-history.repository';
import { LoginHistoryService } from './login-history.service';

describe('LoginHistoryService', () => {
  let repository: jest.Mocked<Pick<LoginHistoryRepository, 'search'>>;
  let userService: jest.Mocked<Pick<UserService, 'findByIds'>>;
  let tenantService: jest.Mocked<Pick<TenantService, 'findAll'>>;
  let branchService: jest.Mocked<Pick<BranchService, 'findAll'>>;
  let service: LoginHistoryService;

  const buildEntry = (overrides: Partial<LoginHistoryEntity> = {}): LoginHistoryEntity =>
    ({
      id: 'history-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      ipAddress: '10.0.0.1',
      userAgent: 'agent',
      loginResult: LoginResult.Success,
      failureReason: null,
      createdAt: new Date(),
      ...overrides,
    }) as LoginHistoryEntity;

  beforeEach(() => {
    repository = { search: jest.fn().mockResolvedValue([[], 0]) };
    userService = { findByIds: jest.fn().mockResolvedValue([]) };
    tenantService = { findAll: jest.fn().mockResolvedValue([]) };
    branchService = { findAll: jest.fn().mockResolvedValue([]) };
    service = new LoginHistoryService(
      repository as unknown as LoginHistoryRepository,
      userService as unknown as UserService,
      tenantService as unknown as TenantService,
      branchService as unknown as BranchService,
    );
  });

  it('enriches rows with user, tenant and branch names', async () => {
    repository.search.mockResolvedValue([[buildEntry()], 1]);
    userService.findByIds.mockResolvedValue([
      { id: 'user-1', name: 'Alice', email: 'a@b.com' } as never,
    ]);
    tenantService.findAll.mockResolvedValue([{ id: 'tenant-1', name: 'Klinik A' } as never]);
    branchService.findAll.mockResolvedValue([{ id: 'branch-1', name: 'Cabang Utama' } as never]);

    const result = await service.search(new LoginHistoryQueryDto());

    expect(result.items[0]).toMatchObject({
      userName: 'Alice',
      tenantName: 'Klinik A',
      branchName: 'Cabang Utama',
      loginResult: LoginResult.Success,
    });
    expect(result.meta.total).toBe(1);
  });

  it('leaves names null for attempts without a resolved user', async () => {
    repository.search.mockResolvedValue([
      [buildEntry({ userId: null, tenantId: null, branchId: null })],
      1,
    ]);

    const result = await service.search(new LoginHistoryQueryDto());

    expect(userService.findByIds).toHaveBeenCalledWith([]);
    expect(result.items[0]).toMatchObject({ userName: null, tenantName: null, branchName: null });
  });

  it('treats a date-only dateTo as inclusive end of day', async () => {
    const query = Object.assign(new LoginHistoryQueryDto(), {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-07',
      loginResult: LoginResult.InvalidPassword,
    });

    await service.search(query);

    const [filters, page, limit] = repository.search.mock.calls[0];
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(filters.loginResult).toBe(LoginResult.InvalidPassword);
    expect(filters.dateFrom).toEqual(new Date('2026-07-01'));
    expect(filters.dateTo?.getHours()).toBe(23);
    expect(filters.dateTo?.getMinutes()).toBe(59);
  });
});
