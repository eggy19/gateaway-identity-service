import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto';
import { IsUuidLike } from '../../../shared/validators/is-uuid-like.decorator';
import { LoginResult } from '../enums/login-result.enum';

export class LoginHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUuidLike()
  userId?: string;

  @IsOptional()
  @IsUuidLike()
  tenantId?: string;

  @IsOptional()
  @IsUuidLike()
  branchId?: string;

  @IsOptional()
  @IsEnum(LoginResult)
  loginResult?: LoginResult;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
