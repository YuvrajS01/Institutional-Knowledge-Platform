'use client';

import { hasCapability, type Role } from '@ikp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiRequest } from '../../lib/api';
import { clearSession, getSession } from '../../lib/auth';

interface Institution {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  settings: Record<string, unknown>;
}

interface Department {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface MeResponse {
  id: string;
  name: string;
  email: string;
  memberships: { institution_id: string; role: Role }[];
}

type LoadState = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

export default function AdminPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [userName, setUserName] = useState('');

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [institutionTimezone, setInstitutionTimezone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    const [me, current, list] = await Promise.all([
      apiRequest<MeResponse>('/auth/me', { token: session.accessToken }),
      apiRequest<Institution>('/institutions/current', {
        token: session.accessToken,
        institutionId: session.institutionId,
      }),
      apiRequest<Department[]>('/departments?page=1&limit=100', {
        token: session.accessToken,
        institutionId: session.institutionId,
      }),
    ]);
    const membership = me.memberships.find((m) => m.institution_id === session.institutionId);
    setUserName(me.name);
    setCanManage(membership ? hasCapability(membership.role, 'departments.manage') : false);
    setInstitution(current);
    setInstitutionName(current.name);
    setInstitutionTimezone(current.timezone);
    setDepartments(list);
    setState({ phase: 'ready' });
  }

  useEffect(() => {
    refresh().catch((error) => {
      if (error instanceof ApiError && error.statusCode === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Failed to load admin data.',
      });
    });
  }, [router]);

  async function createDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const session = getSession();
    if (!session) return;
    try {
      await apiRequest('/departments', {
        method: 'POST',
        token: session.accessToken,
        institutionId: session.institutionId,
        body: { name: newName, code: newCode },
      });
      setNewName('');
      setNewCode('');
      await refresh();
      setNotice('Department created.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Creation failed.');
    }
  }

  async function deactivateDepartment(department: Department) {
    setFormError(null);
    setNotice(null);
    const session = getSession();
    if (!session) return;
    try {
      await apiRequest(`/departments/${department.id}`, {
        method: 'DELETE',
        token: session.accessToken,
        institutionId: session.institutionId,
      });
      await refresh();
      setNotice(`Department "${department.name}" deactivated.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Deactivation failed.');
    }
  }

  async function reactivateDepartment(department: Department) {
    setFormError(null);
    setNotice(null);
    const session = getSession();
    if (!session) return;
    try {
      await apiRequest(`/departments/${department.id}`, {
        method: 'PATCH',
        token: session.accessToken,
        institutionId: session.institutionId,
        body: { status: 'ACTIVE' },
      });
      await refresh();
      setNotice(`Department "${department.name}" reactivated.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Reactivation failed.');
    }
  }

  async function saveInstitution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    const session = getSession();
    if (!session) return;
    try {
      await apiRequest('/institutions/current', {
        method: 'PATCH',
        token: session.accessToken,
        institutionId: session.institutionId,
        body: { name: institutionName, timezone: institutionTimezone },
      });
      await refresh();
      setNotice('Institution settings saved.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Save failed.');
    }
  }

  function signOut() {
    clearSession();
    router.push('/login');
  }

  if (state.phase === 'loading') {
    return (
      <main className="auth-main">
        <p>Loading admin panel…</p>
      </main>
    );
  }

  if (state.phase === 'error') {
    return (
      <main className="auth-main">
        <p className="error" role="alert">
          {state.message}
        </p>
        <Link href="/login">Back to sign in</Link>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <header className="admin-header">
        <div>
          <h1>Admin</h1>
          <p className="muted">Signed in as {userName}</p>
        </div>
        <button type="button" className="secondary" onClick={signOut}>
          Sign out
        </button>
      </header>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {formError && (
        <p className="error" role="alert">
          {formError}
        </p>
      )}

      {institution && (
        <section className="card">
          <h2>Institution</h2>
          <p className="muted">
            {institution.slug} · {institution.name}
          </p>
          <form className="form" onSubmit={saveInstitution}>
            <label htmlFor="institution-name">Name</label>
            <input
              id="institution-name"
              value={institutionName}
              disabled={!canManage}
              onChange={(event) => setInstitutionName(event.target.value)}
            />
            <label htmlFor="institution-timezone">Timezone</label>
            <input
              id="institution-timezone"
              value={institutionTimezone}
              disabled={!canManage}
              onChange={(event) => setInstitutionTimezone(event.target.value)}
            />
            {canManage && <button type="submit">Save institution settings</button>}
          </form>
        </section>
      )}

      <section className="card">
        <h2>Departments</h2>
        {departments.length === 0 ? (
          <p className="muted">No departments yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.id}>
                  <td>{department.name}</td>
                  <td>{department.code}</td>
                  <td>
                    <span className={`badge ${department.status.toLowerCase()}`}>
                      {department.status}
                    </span>
                  </td>
                  {canManage && department.status === 'ACTIVE' && (
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void deactivateDepartment(department)}
                      >
                        Deactivate
                      </button>
                    </td>
                  )}
                  {canManage && department.status !== 'ACTIVE' && (
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void reactivateDepartment(department)}
                      >
                        Activate
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canManage && (
          <form className="form inline" onSubmit={createDepartment}>
            <input
              placeholder="Department name"
              aria-label="Department name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
            />
            <input
              placeholder="Code (e.g. CSE)"
              aria-label="Department code"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              required
            />
            <button type="submit">Add department</button>
          </form>
        )}
      </section>
    </main>
  );
}
