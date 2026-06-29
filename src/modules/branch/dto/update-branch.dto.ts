import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BranchStatus } from '../enums/branch-status.enum';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;
}
