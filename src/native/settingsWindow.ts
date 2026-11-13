import { join } from "node:path";

import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  dialog,
  ipcMain,
  net,
} from "electron";

import { config } from "./config";
import {
  DEFAULT_SERVER_URL,
  isOfficialServer,
  normalizeServerUrl,
  withRecentServer,
} from "./serverUrl";
import { settingsPageUrl } from "./settingsPage";
import {
  getServerSource,
  getServerUrl,
  getServerWarning,
  mainWindow,
  switchServer,
} from "./window";

const CONNECTION_TEST_TIMEOUT_MS = 8000;

let settingsWindow: BrowserWindow | null = null;
let openReason: string | undefined;

type Result = { ok: boolean; message: string; cancelled?: boolean };

function isSettingsSender(event: IpcMainInvokeEvent) {
  return (
    !!settingsWindow &&
    !settingsWindow.isDestroyed() &&
    event.sender === settingsWindow.webContents
  );
}

function handleSettings<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => T,
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isSettingsSender(event)) throw new Error("Untrusted sender");
    return handler(event, ...args);
  });
}

/**
 * Check that the address answers with an HTML page. This is a hint only;
 * saving is still possible (e.g. for a server that is temporarily down).
 */
export async function testServer(input: unknown): Promise<Result> {
  const normalized = normalizeServerUrl(String(input ?? ""));
  if (!normalized.ok) return { ok: false, message: normalized.error };

  try {
    const response = await net.fetch(normalized.url, {
      signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      return { ok: false, message: `Server answered with ${response.status}.` };
    }
    if (!type.includes("text/html")) {
      return { ok: false, message: "This does not look like the Stoat app." };
    }
    return { ok: true, message: "Connection works." };
  } catch (err) {
    return {
      ok: false,
      message: `Could not connect: ${(err as Error).message}`,
    };
  }
}

async function confirmCustomServer(url: string) {
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    buttons: ["Cancel", "Use this server"],
    defaultId: 0,
    cancelId: 0,
    title: "Use a custom server?",
    message: `Connect to ${new URL(url).host}?`,
    detail:
      "Only use servers you trust. The server's web app runs inside Stoat " +
      "Desktop and can use your microphone, camera, screen sharing and " +
      "notifications when you allow it.",
  };
  const { response } = settingsWindow
    ? await dialog.showMessageBox(settingsWindow, options)
    : await dialog.showMessageBox(options);
  return response === 1;
}

/**
 * Persist the chosen server and load it, unless --force-server overrides it.
 */
export async function saveServer(input: unknown): Promise<Result> {
  const { mode, url, voiceJoinOnDoubleClick } = (input ?? {}) as {
    mode?: unknown;
    url?: unknown;
    voiceJoinOnDoubleClick?: unknown;
  };

  // behaviour options apply regardless of how the server is set
  if (typeof voiceJoinOnDoubleClick === "boolean") {
    config.voiceJoinOnDoubleClick = voiceJoinOnDoubleClick;
  }
  if (getServerSource() === "command-line") {
    return { ok: true, message: "Saved." };
  }

  let target = DEFAULT_SERVER_URL;
  if (mode === "custom") {
    const normalized = normalizeServerUrl(String(url ?? ""));
    if (!normalized.ok) return { ok: false, message: normalized.error };
    target = normalized.url;
  }

  const official = isOfficialServer(target);
  if (!official && target !== getServerUrl()) {
    if (!(await confirmCustomServer(target))) {
      return { ok: false, message: "Not changed.", cancelled: true };
    }
  }

  config.serverUrl = official ? "" : target;
  if (!official)
    config.recentServers = withRecentServer(config.recentServers, target);

  if (target !== getServerUrl()) switchServer(target);
  return { ok: true, message: "Saved." };
}

function getState() {
  return {
    serverUrl: getServerUrl(),
    savedServerUrl: config.serverUrl,
    recentServers: config.recentServers,
    defaultServerUrl: DEFAULT_SERVER_URL,
    locked: getServerSource() === "command-line",
    voiceJoinOnDoubleClick: config.voiceJoinOnDoubleClick,
    warning: getServerWarning(),
    reason: openReason,
  };
}

handleSettings("settings:get-state", () => getState());
handleSettings("settings:test-server", (_, url) => testServer(url));
handleSettings("settings:save", (_, settings) => saveServer(settings));

/**
 * Open (or focus) the native desktop settings window.
 * @param reason optional message shown at the top, e.g. why it was opened
 */
export function openSettingsWindow(reason?: string) {
  openReason = reason;
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (reason) settingsWindow.reload();
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const parent =
    mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()
      ? mainWindow
      : undefined;

  settingsWindow = new BrowserWindow({
    parent,
    width: 560,
    height: 610,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Desktop settings",
    backgroundColor: "#191919",
    autoHideMenuBar: true,
    webPreferences: {
      // relative to `.vite/build`
      preload: join(__dirname, "settingsPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  settingsWindow.setMenu(null);

  // the page is local; never navigate away or open other windows
  settingsWindow.webContents.on("will-navigate", (event) =>
    event.preventDefault(),
  );
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
    openReason = undefined;
  });

  settingsWindow.loadURL(settingsPageUrl()).catch((err) => {
    console.error("Failed to open desktop settings:", err);
  });
}
