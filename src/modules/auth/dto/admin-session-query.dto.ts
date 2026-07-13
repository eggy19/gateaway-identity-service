import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/dto/pagination-query.dto';
import { IsUuidLike } from '../../../shared/validators/is-uuid-like.decorator';

export class AdminSessionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUuidLike()
  userId?: string;

  /** 'true' (default) lists only unexpired sessions; parsed in the service. */
  @IsOptional()
  @IsIn(['true', 'false'])
  activeOnly?: string;
}
