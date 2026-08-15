import type { LoginResponse, MeResponse, RefreshResponse, Role } from '@ikp/shared';

import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { MembershipsRepository } from './memberships.repository.js';
import { verifyPassword } from './password.js';
import { RefreshTokenRepository } from './refresh-token.repository.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  type TokenConfig,
} from './tokens.js';
import { UsersRepository } from './users.repository.js';

const INVALID_CREDENTIALS = 'Invalid email or password.';
const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token.';

export interface AuthServiceDeps {
  pool: DbPool;
  tokenConfig: TokenConfig;
  now?: () => Date;
}

export class AuthService {
  private readonly users: UsersRepository;
  private readonly memberships: MembershipsRepository;
  private readonly refreshTokens: RefreshTokenRepository;
  private readonly now: () => Date;

  constructor(private readonly deps: AuthServiceDeps) {
    this.users = new UsersRepository(deps.pool);
    this.memberships = new MembershipsRepository(deps.pool);
    this.refreshTokens = new RefreshTokenRepository(deps.pool);
    this.now = deps.now ?? (() => new Date());
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'ACTIVE') {
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    const accessToken = await signAccessToken(user.id, this.deps.tokenConfig);
    const refreshToken = generateRefreshToken();
    await this.refreshTokens.create(
      user.id,
      hashRefreshToken(refreshToken),
      refreshTokenExpiry(this.deps.tokenConfig.refreshTtlDays, this.now()),
    );

    return {
      user: { id: user.id, name: user.name, email: user.email },
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: this.deps.tokenConfig.accessTtlMinutes * 60,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!stored) {
      throw AppError.unauthorized(INVALID_REFRESH_TOKEN);
    }
    if (stored.revoked_at !== null || stored.expires_at.getTime() < this.now().getTime()) {
      throw AppError.unauthorized(INVALID_REFRESH_TOKEN);
    }

    await this.refreshTokens.revoke(stored.id);

    const accessToken = await signAccessToken(stored.user_id, this.deps.tokenConfig);
    const nextRefreshToken = generateRefreshToken();
    await this.refreshTokens.create(
      stored.user_id,
      hashRefreshToken(nextRefreshToken),
      refreshTokenExpiry(this.deps.tokenConfig.refreshTtlDays, this.now()),
    );

    return {
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      expires_in: this.deps.tokenConfig.accessTtlMinutes * 60,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (stored && stored.revoked_at === null) {
      await this.refreshTokens.revoke(stored.id);
    }
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw AppError.unauthorized('User no longer exists.');
    }
    const memberships = await this.memberships.findMemberships(userId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      memberships: memberships.map((m) => ({
        institution_id: m.institution_id,
        institution_name: m.institution_name,
        role: m.role as Role,
        department: m.department,
        course: m.course,
        semester: m.semester,
      })),
    };
  }
}
