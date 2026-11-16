import { RoleScope } from '../enums/role-scope.enum';
import { RoleStatus } from '../enums/role-status.enum';

export class RoleResponseDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string | null;
  scope!: RoleScope;
  isSystem!: boolean;
  status!: RoleStatus;
}

export class RoleDetailResponseDto extends RoleResponseDto {
  permissions!: string[];
}

export class PermissionResponseDto {
  code!: string;
  service!: string;
  resource!: string;
  action!: string;
  description!: string;
}
