import type {
  IpcMainEvent,
  IpcMainInvokeEvent,
  PermissionCheckHandlerHandlerDetails,
  Session,
  WebContents,
} from "electron";
import { ipcMain } from "electron";

type AnyIpcEvent = IpcMainEvent | IpcMainInvokeEvent;

/** Fields of Electron's permission request details that are used here */
type PermissionRequestDetails = {
  requestingUrl?: string;
  externalURL?: string;
};

/**
 * Permissions the app needs (voice/video, screen share, notifications,
 * clipboard, fullscreen). Everything else is denied, and nothing is granted
 * to other origins (iframes, embeds, pages reached by redirects).
 */
const ALLOWED_PERMISSIONS = new Set<string>([
  "media",
  "display-capture",
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
  "speaker-selection",
]);

/**
 * Trust is per origin (scheme + host + port), like everywhere on the web:
 * every page on the configured server's origin is trusted, not only the
 * app's path. Only use servers that host nothing but the Stoat web app.
 */
export function isTrustedUrl(url: string | undefined, appOrigin: string) {
  if (!url) return false;
  try {
    return new URL(url).origin === appOrigin;
  } catch {
    return false;
  }
}

/**
 * Only the top-level frame of the app origin may talk to the main process.
 */
export function isTrustedSender(event: AnyIpcEvent, appOrigin: string) {
  const frame = event.senderFrame;
  return !!frame && frame.parent === null && isTrustedUrl(frame.url, appOrigin);
}

function rejectSender(channel: string, event: AnyIpcEvent) {
  console.warn(
    `Ignored IPC "${channel}" from untrusted frame:`,
    event.senderFrame?.url,
  );
}

/**
 * `ipcMain.on` that ignores messages from untrusted frames
 */
export function onTrusted(
  channel: string,
  getAppOrigin: () => string,
  listener: (event: IpcMainEvent, ...args: unknown[]) => void,
) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event, getAppOrigin())) {
      rejectSender(channel, event);
      if (event.returnValue === undefined) event.returnValue = null;
      return;
    }
    listener(event, ...args);
  });
}

/**
 * `ipcMain.handle` that rejects invocations from untrusted frames
 */
export function handleTrusted(
  channel: string,
  getAppOrigin: () => string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event, getAppOrigin())) {
      rejectSender(channel, event);
      throw new Error("Untrusted sender");
    }
    return handler(event, ...args);
  });
}

export function isPermissionAllowed(
  permission: string,
  requestingUrl: string | undefined,
  appOrigin: string,
  details?: PermissionRequestDetails,
) {
  // embedded media (e.g. video embeds in messages) may go fullscreen
  if (permission === "fullscreen") return true;

  if (!isTrustedUrl(requestingUrl, appOrigin)) return false;

  // allow mailto: links opened by the app; other external protocols are handled
  // explicitly by the window open handler
  if (permission === "openExternal") {
    return /^mailto:/i.test(details?.externalURL ?? "");
  }

  return ALLOWED_PERMISSIONS.has(permission);
}

/**
 * Restrict permission requests and checks to the app origin.
 * By default Electron grants every permission to every origin.
 */
export function installPermissionHandlers(
  target: Session,
  getAppOrigin: () => string,
) {
  target.setPermissionRequestHandler(
    (
      _contents: WebContents,
      permission,
      callback,
      details: PermissionRequestDetails,
    ) => {
      callback(
        isPermissionAllowed(
          permission,
          details.requestingUrl,
          getAppOrigin(),
          details,
        ),
      );
    },
  );

  target.setPermissionCheckHandler(
    (
      _contents,
      permission,
      requestingOrigin,
      details: PermissionCheckHandlerHandlerDetails,
    ) =>
      isPermissionAllowed(
        permission,
        details.requestingUrl ?? requestingOrigin,
        getAppOrigin(),
      ),
  );
}

const BOOLEAN_KEYS = [
  "firstLaunch",
  "customFrame",
  "minimiseToTray",
  "startMinimisedToTray",
  "spellchecker",
  "hardwareAcceleration",
  "discordRpc",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeWindowState(
  value: unknown,
): DesktopConfig["windowState"] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const state = value as Record<string, unknown>;
  const numbers = ["x", "y", "width", "height"].every((key) =>
    isFiniteNumber(state[key]),
  );
  if (!numbers || typeof state.isMaximised !== "boolean") return undefined;

  return {
    x: state.x as number,
    y: state.y as number,
    width: state.width as number,
    height: state.height as number,
    isMaximised: state.isMaximised,
  };
}

/**
 * Keep only known configuration keys with the expected types.
 * The renderer is not trusted to send well-formed data.
 */
export function sanitizeConfigUpdate(input: unknown): Partial<DesktopConfig> {
  if (typeof input !== "object" || input === null) return {};
  const raw = input as Record<string, unknown>;
  const result: Partial<DesktopConfig> = {};

  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === "boolean") result[key] = raw[key] as boolean;
  }

  const windowState = sanitizeWindowState(raw.windowState);
  if (windowState) result.windowState = windowState;

  return result;
}
