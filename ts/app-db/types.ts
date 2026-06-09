export type UserRole = "user" | "admin";
export type UserStatus = "pending" | "active" | "disabled";

export interface UserAccess {
  userId: string;
  role: UserRole;
  status: UserStatus;
  ruleLimit: number;
  firstLoginAt: string;
  lastLoginAt: string;
  statusChangedAt: string;
  statusChangedBy?: string;
}
