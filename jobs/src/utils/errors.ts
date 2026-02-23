/**
 * Extract comprehensive error details including the full cause chain.
 * Fetch errors in Node wrap the real error (ECONNREFUSED, DNS, TLS, etc.)
 * in `cause`, so we need to unwrap it to get anything useful.
 */
export function extractError(err: unknown): {
  message: string;
  type: string;
  stack: string | undefined;
  cause: string | undefined;
  fullMessage: string;
} {
  if (!(err instanceof Error)) {
    const msg = String(err);
    return { message: msg, type: typeof err, stack: undefined, cause: undefined, fullMessage: msg };
  }

  const causeChain = unwrapCauses(err);
  const causeStr = causeChain.length > 0 ? causeChain.join(" → ") : undefined;

  // fullMessage: "fetch failed → connect ECONNREFUSED 127.0.0.1:443"
  const fullMessage = causeStr ? `${err.message} → ${causeStr}` : err.message;

  return {
    message: err.message,
    type: err.constructor.name,
    stack: err.stack,
    cause: causeStr,
    fullMessage,
  };
}

function unwrapCauses(err: Error): string[] {
  const parts: string[] = [];
  let current: unknown = err.cause;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(`[${current.constructor.name}] ${current.message}`);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }

  return parts;
}
