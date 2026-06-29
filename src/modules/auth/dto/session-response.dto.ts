export class SessionResponseDto {
  id!: string;
  userId!: string;
  expiresAt!: Date;
  ipAddress!: string | null;
  userAgent!: string | null;
  createdAt!: Date;
  current!: boolean;
}
