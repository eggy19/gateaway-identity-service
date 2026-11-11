import { UserResponseDto } from '../../user/dto/user-response.dto';
import type { ActiveContextInfo, UserBranchInfo } from '../../role/services/active-context.service';

/** Response `data` of `POST /auth/login` and `GET /auth/me` (BR-FE-01, spec §8.6). */
export class AuthUserResponseDto extends UserResponseDto {
  context!: ActiveContextInfo | null;
  roles!: string[];
  permissions!: string[];
  branches!: UserBranchInfo[];
}
