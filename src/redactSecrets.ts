const SECRET_KEY_RE =
  /token|secret|password|api[_-]?key|authorization|cookie|jwt|bearer|private[_-]?key|signature/i;

export function redactSecrets(input: Record<string, unknown>): Record<string, unknown> {
  return redactObject(input, 0);
}

function redactObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= 4) {
    return obj;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = redactObject(value as Record<string, unknown>, depth + 1);
      continue;
    }

    if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? redactObject(item as Record<string, unknown>, depth + 1)
          : item
      );
      continue;
    }

    out[key] = value;
  }

  return out;
}
