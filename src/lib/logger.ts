// Structured JSON logger. Callers must never pass secrets; sensitive keys are redacted defensively.
const REDACT = /pass(word)?|token|secret|authorization|cookie|service_role|api[_-]?key|upload_?url/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : sanitize(v, depth + 1)]),
    );
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(sanitize(fields) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const logger = {
  debug: (e: string, f?: Record<string, unknown>) => emit("debug", e, f),
  info: (e: string, f?: Record<string, unknown>) => emit("info", e, f),
  warn: (e: string, f?: Record<string, unknown>) => emit("warn", e, f),
  error: (e: string, f?: Record<string, unknown>) => emit("error", e, f),
};
