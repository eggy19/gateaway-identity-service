import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsUUID()
  tenantId!: string;

  @IsUUID()
  branchId!: string;
}
