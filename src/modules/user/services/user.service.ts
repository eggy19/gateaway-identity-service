import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BranchService } from '../../branch/services/branch.service';
import { TenantService } from '../../tenant/services/tenant.service';
import type { AuthInstance } from '../../../shared/auth/better-auth';
import { AUTH_INSTANCE } from '../../../shared/auth/auth.tokens';
import { UserEntity } from '../../../shared/auth/entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UserRepository } from '../repositories/user.repository';
import { UserSecurityRepository } from '../repositories/user-security.repository';
import { UserBranchRepository } from '../repositories/user-branch.repository';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @Inject(AUTH_INSTANCE) private readonly auth: AuthInstance,
    private readonly userRepository: UserRepository,
    private readonly userSecurityRepository: UserSecurityRepository,
    private readonly userBranchRepository: UserBranchRepository,
    private readonly tenantService: TenantService,
    private readonly branchService: BranchService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create User flow (Business Flow §6): validate tenant + branch, dedupe email,
   * create the Better Auth user, then create user_security and assign the branch.
   *
   * The Better Auth user is created through Better Auth's own connection (it
   * cannot share the TypeORM transaction), so the custom-table writes run in a
   * transaction with best-effort compensation if they fail.
   */
  async create(dto: CreateUserDto, actorId: string): Promise<UserEntity> {
    const tenant = await this.tenantService.findActiveByIdOrThrow(dto.tenantId);
    const branch = await this.branchService.findActiveByIdOrThrow(dto.branchId);
    if (branch.tenantId !== tenant.id) {
      throw new BadRequestException('Branch does not belong to the specified tenant');
    }

    if (await this.userRepository.existsByEmail(dto.email)) {
      throw new ConflictException(`Email "${dto.email}" is already registered`);
    }

    const signUp = await this.auth.api.signUpEmail({
      body: { email: dto.email, password: dto.password, name: dto.name },
    });
    const userId = signUp.user.id;

    try {
      await this.dataSource.transaction(async (manager) => {
        await this.userSecurityRepository.save(
          this.userSecurityRepository.create({
            userId,
            createdBy: actorId,
            updatedBy: actorId,
          }),
          manager,
        );
        await this.userBranchRepository.save(
          this.userBranchRepository.create({
            userId,
            branchId: dto.branchId,
            isPrimary: true,
            createdBy: actorId,
            updatedBy: actorId,
          }),
          manager,
        );
      });
    } catch (error) {
      await this.rollbackAuthUser(userId);
      throw error;
    }

    return this.findByIdOrThrow(userId);
  }

  async updateProfile(id: string, dto: UpdateUserDto): Promise<UserEntity> {
    await this.findByIdOrThrow(id);
    await this.userRepository.updateProfile(id, { name: dto.name });
    return this.findByIdOrThrow(id);
  }

  /** Activate / deactivate a user (PATCH /users/:id/status). */
  async updateStatus(id: string, dto: UpdateUserStatusDto): Promise<UserEntity> {
    await this.findByIdOrThrow(id);
    await this.userRepository.updateProfile(id, { status: dto.status });
    return this.findByIdOrThrow(id);
  }

  findAll(): Promise<UserEntity[]> {
    return this.userRepository.findAll();
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findByEmail(email);
  }

  /** Resolves the user's primary (or first) branch and its tenant, for login context. */
  async getPrimaryBranchContext(
    userId: string,
  ): Promise<{ tenantId: string; branchId: string } | null> {
    const assignments = await this.userBranchRepository.findByUser(userId);
    const primary = assignments.find((assignment) => assignment.isPrimary) ?? assignments[0];
    if (!primary) {
      return null;
    }
    const branch = await this.branchService.findByIdOrThrow(primary.branchId);
    return { tenantId: branch.tenantId, branchId: branch.id };
  }

  async findByIdOrThrow(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async findBranchIds(userId: string): Promise<string[]> {
    const assignments = await this.userBranchRepository.findByUser(userId);
    return assignments.map((assignment) => assignment.branchId);
  }

  /** Best-effort removal of an orphaned Better Auth user (cascades account/session). */
  private async rollbackAuthUser(userId: string): Promise<void> {
    try {
      await this.dataSource.query('DELETE FROM "user" WHERE id = $1', [userId]);
    } catch (error) {
      this.logger.error(
        `Failed to roll back auth user ${userId} after a failed creation`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
