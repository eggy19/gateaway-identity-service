/** Session enriched with the owning user's name/email for the admin screen. */
export class AdminSessionResponseDto {
  id!: string;
  userId!: string;
  userName!: string | null;
  userEmail!: string | null;
  ipAddress!: string | null;
  userAgent!: string | null;
  createdAt!: Date;
  expiresAt!: Date;
  current!: boolean;
}
