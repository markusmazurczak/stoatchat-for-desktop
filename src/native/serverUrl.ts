/** The official Stoat web app */
export const DEFAULT_SERVER_URL = "https://stoat.chat/app";

const MAX_URL_LENGTH = 2048;
const MAX_RECENT_SERVERS = 5;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `url` is set when valid, `error` otherwise (no union: strictNullChecks is off) */
export type ServerUrlResult = { ok: boolean; url: string; error: string };

const invalid = (error: string): ServerUrlResult => ({
  ok: false,
  url: "",
  error,
});

/**
 * Validate and normalise a server URL entered by the user.
 * - adds `https://` when no scheme is given
 * - only https (http only for localhost development)
 * - no credentials, no fragment, bounded length
 */
export function normalizeServerUrl(input: string): ServerUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return invalid("Please enter a server address.");
  if (trimmed.length > MAX_URL_LENGTH) {
    return invalid("The address is too long.");
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return invalid("This is not a valid address.");
  }

  const isLocal = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    return invalid(
      "Only https:// addresses are allowed (http:// only for localhost).",
    );
  }
  if (url.username || url.password) {
    return invalid("The address must not contain credentials.");
  }
  if (!url.hostname) return invalid("The address has no host.");

  url.hash = "";
  return { ok: true, url: url.toString(), error: "" };
}

export type ResolvedServer = {
  url: string;
  source: "command-line" | "settings" | "default";
  /** set when a configured value was invalid and ignored */
  warning?: string;
};

/**
 * Pick the server to load: `--force-server` > saved setting > official app.
 * Invalid values are skipped with a warning instead of opening a blank window.
 */
export function resolveServerUrl(
  cliValue: string | undefined,
  configValue: string | undefined,
): ResolvedServer {
  const warnings: string[] = [];

  if (cliValue) {
    const cli = normalizeServerUrl(cliValue);
    if (cli.ok) return { url: cli.url, source: "command-line" };
    warnings.push(`--force-server ignored: ${cli.error}`);
  }

  if (configValue) {
    const saved = normalizeServerUrl(configValue);
    if (saved.ok) {
      return {
        url: saved.url,
        source: "settings",
        warning: warnings[0],
      };
    }
    warnings.push(`Saved server ignored: ${saved.error}`);
  }

  return {
    url: DEFAULT_SERVER_URL,
    source: "default",
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
}

export function isOfficialServer(url: string) {
  try {
    return new URL(url).origin === new URL(DEFAULT_SERVER_URL).origin;
  } catch {
    return false;
  }
}

/** Most recently used first, without duplicates, bounded */
export function withRecentServer(recent: readonly string[], url: string) {
  return [url, ...recent.filter((entry) => entry !== url)].slice(
    0,
    MAX_RECENT_SERVERS,
  );
}
