import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantStatus } from '../enums/tenant-status.enum';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
