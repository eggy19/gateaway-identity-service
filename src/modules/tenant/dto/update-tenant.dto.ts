import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantStatus } from '../enums/tenant-status.enum';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
