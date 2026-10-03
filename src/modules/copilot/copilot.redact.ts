/**
 * Secret redaction (06 "redact secrets"; 07 AI Security). Applied to every piece of retrieved text
 * before it reaches a model, and to every answer before it is stored or shown. Pattern-based:
 * it reduces accidental leakage of credentials pasted into notes; it is not a guarantee (ADR 0048).
 */
const PATTERNS: [RegExp, string][] = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[REDACTED PRIVATE KEY]",
  ],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, "Bearer [REDACTED]"],
  [
    /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|token)\s*[:=]\s*["']?[^\s"',;]+/gi,
    "$1=[REDACTED]",
  ],
  [
    /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@/gi,
    "$1://[REDACTED]@",
  ],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v)]),
    ) as T;
  }
  return value;
}
