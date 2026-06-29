import { TenantStatus } from '../enums/tenant-status.enum';

export class TenantResponseDto {
  id!: string;
  name!: string;
  code!: string;
  status!: TenantStatus;
  createdAt!: Date;
  updatedAt!: Date;
}
