const CONTROL_CHARS_RE = /\p{C}/u;
const SERVICE_REFERENCE_RE = /^(?!.*(?:github_pat|gh[opsu]_|glpat|glrt|glcb|glso|sk_|xox|akia|eyj|sv=|\b(?:api[- ]?key|access[- ]?token|bearer|password|secret|token)\b))(?!.*(?:^|[ -])[\p{L}\p{N}]{24,}(?:$|[ -]))(?!.*(?:\b[\p{L}\p{N}]{12,}-){1,}[\p{L}\p{N}]{12,}\b)[\p{L}\p{N}][\p{L}\p{N} ()-]{0,78}$/iu;

export function normalizeServiceReference(value) {
  if (typeof value !== 'string') return null;
  const reference = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return reference.length >= 2
    && reference.length <= 80
    && !CONTROL_CHARS_RE.test(reference)
    && SERVICE_REFERENCE_RE.test(reference)
    ? reference
    : null;
}
