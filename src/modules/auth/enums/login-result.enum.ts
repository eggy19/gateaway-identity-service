export enum LoginResult {
  Success = 'success',
  InvalidPassword = 'invalid_password',
  AccountLocked = 'account_locked',
  UserDisabled = 'user_disabled',
  UserNotFound = 'user_not_found',
  SessionExpired = 'session_expired',
}
