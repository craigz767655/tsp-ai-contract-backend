// Minimal structured logger. Never logs request/response bodies for sensitive
// (AI / contract / file) routes — those can contain confidential contract text.
export function log(message: string, source = "api") {
  const ts = new Date().toISOString();
  console.log(`${ts} [${source}] ${message}`);
}

export function logError(message: string, err: unknown, source = "api") {
  const detail = err instanceof Error ? `${err.message}` : String(err);
  console.error(`${new Date().toISOString()} [${source}] ERROR ${message}: ${detail}`);
}
