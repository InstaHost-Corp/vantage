import { readFileSync } from 'node:fs';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

const boolEnv = (value, fallback = false) =>
  (value === undefined || value === '' ? fallback : TRUTHY.has(String(value).toLowerCase()));

function sessionSecret(env) {
  const direct = env.VANTAGE_SESSION_SECRET;
  const path = env.VANTAGE_SESSION_SECRET_FILE;
  if (direct && path) return { error: 'set only one of VANTAGE_SESSION_SECRET or VANTAGE_SESSION_SECRET_FILE' };
  if (path) {
    try {
      return { value: readFileSync(path, 'utf8').trim() };
    } catch {
      return { error: 'VANTAGE_SESSION_SECRET_FILE cannot be read' };
    }
  }
  return { value: direct };
}

export function isProduction(env = process.env) {
  return env.VANTAGE_ENV === 'production';
}

// This module deliberately has no database imports. It is evaluated before
// opening SQLite so an invalid production environment cannot migrate data.
export function validateRuntimeConfig(env = process.env) {
  const errors = [];
  const mode = env.VANTAGE_ENV;
  const production = mode === 'production';
  const nodeProduction = env.NODE_ENV === 'production';

  if (mode && mode !== 'production' && mode !== 'demo') {
    errors.push('VANTAGE_ENV must be either production or demo');
  }
  if (nodeProduction && !production && !(mode === 'demo' && boolEnv(env.VANTAGE_DEMO_MODE))) {
    errors.push('production deployments require VANTAGE_ENV=production; demos must explicitly set VANTAGE_ENV=demo and VANTAGE_DEMO_MODE=1');
  }
  if (!production) return { ok: errors.length === 0, errors };

  if (boolEnv(env.VANTAGE_PUBLIC_DEMO)) {
    errors.push('VANTAGE_PUBLIC_DEMO must not be enabled in production');
  }
  if (boolEnv(env.VANTAGE_ALLOW_DEMO_RESET)) {
    errors.push('VANTAGE_ALLOW_DEMO_RESET must not be enabled in production');
  }
  const secret = sessionSecret(env);
  if (secret.error) errors.push(secret.error);
  else if (!secret.value || secret.value.length < 32) {
    errors.push('VANTAGE_SESSION_SECRET must be a random string of at least 32 characters in production');
  }
  return { ok: errors.length === 0, errors, sessionSecret: secret.value };
}
