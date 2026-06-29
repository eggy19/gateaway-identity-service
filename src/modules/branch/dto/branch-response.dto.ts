import { BranchStatus } from '../enums/branch-status.enum';

export class BranchResponseDto {
  id!: string;
  tenantId!: string;
  name!: string;
  code!: string;
  status!: BranchStatus;
  createdAt!: Date;
  updatedAt!: Date;
}
