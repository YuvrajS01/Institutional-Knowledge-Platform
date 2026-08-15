import type { Role } from './domain.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface MembershipView {
  institution_id: string;
  institution_name: string;
  role: Role;
  department: string | null;
  course: string | null;
  semester: number | null;
}

export interface MeResponse {
  id: string;
  name: string;
  email: string;
  memberships: MembershipView[];
}

export interface LoginResponse {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
