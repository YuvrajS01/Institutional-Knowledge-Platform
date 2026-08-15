'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiRequest } from '../../lib/api';
import { setSession } from '../../lib/auth';

interface LoginResponse {
  user: { id: string; name: string; email: string };
  access_token: string;
  refresh_token: string;
}

interface MeResponse {
  id: string;
  name: string;
  email: string;
  memberships: { institution_id: string; institution_name: string; role: string }[];
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const login = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const me = await apiRequest<MeResponse>('/auth/me', {
        token: login.access_token,
      });
      const membership = me.memberships[0];
      if (!membership) {
        setError('Your account is not a member of any institution yet.');
        return;
      }
      setSession({
        accessToken: login.access_token,
        refreshToken: login.refresh_token,
        institutionId: membership.institution_id,
      });
      router.push('/admin');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-main">
      <h1>Sign in</h1>
      <p className="muted">Institutional Knowledge Platform</p>

      <form className="card form" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
