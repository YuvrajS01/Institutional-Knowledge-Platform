# Security Checklist

## Identity

- [ ] Strong authentication.
- [ ] Secure session/token handling.
- [ ] Administrator MFA supported.
- [ ] Account lock/rate limiting for abuse scenarios.

## Authorization

- [ ] RBAC implemented.
- [ ] Institution membership checked.
- [ ] Department scope checked.
- [ ] Audience scope checked.
- [ ] Server-side authorization on every protected endpoint.

## Multi-Tenancy

- [ ] Every tenant query is scoped.
- [ ] Cross-tenant tests pass.
- [ ] Background jobs retain tenant scope.
- [ ] Search is tenant-scoped.
- [ ] Vector retrieval is tenant-scoped.
- [ ] RAG is tenant-scoped.

## File Security

- [ ] MIME/type validation.
- [ ] Extension validation.
- [ ] File-size limits.
- [ ] Malware scanning.
- [ ] Safe filenames.
- [ ] Private object storage by default.
- [ ] Signed URLs for private objects.
- [ ] Original files immutable.

## AI Security

- [ ] Restricted text excluded from unauthorized context.
- [ ] Prompt injection tests.
- [ ] Source citation enforcement.
- [ ] Unsupported-answer behavior.
- [ ] External providers configurable/off by default for private deployments.
- [ ] Model endpoints authenticated/private.

## Application

- [ ] SQL injection protection.
- [ ] XSS protection.
- [ ] CSRF strategy where applicable.
- [ ] CORS restrictions.
- [ ] Rate limits.
- [ ] Secure headers.
- [ ] Secrets manager.
- [ ] Dependency vulnerability scanning.

## Operations

- [ ] Audit logging.
- [ ] Backup.
- [ ] Restore test.
- [ ] Monitoring.
- [ ] Incident runbook.
- [ ] Log retention policy.
