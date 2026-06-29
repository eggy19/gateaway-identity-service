import { UserStatus } from '../enums/user-status.enum';

export class UserResponseDto {
  id!: string;
  name!: string;
  email!: string;
  emailVerified!: boolean;
  status!: UserStatus;
  branchIds?: string[];
  createdAt!: Date;
  updatedAt!: Date;
}
