import { IsOptional } from 'class-validator';
import { IsUuidLike } from '../../../shared/validators/is-uuid-like.decorator';

/**
 * Body of `POST /users/:id/roles`. Only these two fields are accepted; the tenant is always
 * derived from the branch (BR-D1D-11, `forbidNonWhitelisted`). A missing/null `branchId` is valid
 * input here: whether it is allowed depends on the role scope (422, BR-D1A-06).
 */
export class AssignUserRoleDto {
  @IsUuidLike()
  roleId!: string;

  @IsOptional()
  @IsUuidLike()
  branchId?: string | null;
}
