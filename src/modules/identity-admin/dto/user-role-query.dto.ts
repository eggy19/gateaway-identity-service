import { IsIn, IsOptional } from 'class-validator';

export class UserRoleQueryDto {
  /** 'false' (default) lists only live assignments; 'true' adds revoked ones. Parsed in the controller. */
  @IsOptional()
  @IsIn(['true', 'false'])
  includeRevoked?: string;
}
