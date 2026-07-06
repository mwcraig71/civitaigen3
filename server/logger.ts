/**
 * Minimal leveled logger with secret/PII redaction. No external deps.
 *
 * Usage: import { logger } from "./logger";
 *   logger.info("generation started", { userId });
 *   logger.error("stripe webhook failed", err);
 *
 * LOG_LEVEL env var: error | warn | info | debug
 * Defaults: production -> info, otherwise -> debug.
 */

type Level = "error" | "warn" | "info" | "debug";

const LEVELS: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

const configured = (process.env.LOG_LEVEL || "").toLowerCase() as Level;
const threshold: number =
  configured in LEVELS
    ? LEVELS[configured]
    : process.env.NODE_ENV === "production"
      ? LEVELS.info
      : LEVELS.debug;

// Redact obvious secrets: bearer tokens, api keys, long hex/base64 blobs
// following key-like names, and password fields.
const REDACT_PATTERNS: RegExp[] = [
  /(authorization"?\s*[:=]\s*"?)(bearer\s+)?[\w\-.~+/]+=*/gi,
  /((?:api[_-]?key|apikey|token|secret|password|passwd|pwd|session[_-]?secret|encryption[_-]?key)"?\s*[:=]\s*"?)[^"\s,}]+/gi,
  /\b(sk|pk)_(live|test)_[A-Za-z0-9]{8,}\b/g, // Stripe keys
];

function redact(text: string): string {
  let out = text;
  for (const re of REDACT_PATTERNS) {
    out = out.replace(re, (_m, prefix) => `${typeof prefix === "string" ? prefix : ""}[REDACTED]`);
  }
  return out;
}

function serialize(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function write(level: Level, args: unknown[]): void {
  if (LEVELS[level] > threshold) return;
  const line = redact(args.map(serialize).join(" "));
  const out = `${new Date().toISOString()} [${level.toUpperCase()}] ${line}`;
  if (level === "error") process.stderr.write(out + "\n");
  else process.stdout.write(out + "\n");
}

export const logger = {
  error: (...args: unknown[]) => write("error", args),
  warn: (...args: unknown[]) => write("warn", args),
  info: (...args: unknown[]) => write("info", args),
  debug: (...args: unknown[]) => write("debug", args),
};
