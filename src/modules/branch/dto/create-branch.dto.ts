import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { BranchStatus } from '../enums/branch-status.enum';

export class CreateBranchDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;
}
