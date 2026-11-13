import { join } from "node:path";

import {
  BrowserWindow,
  Menu,
  app,
  clipboard,
  desktopCapturer,
  ipcMain,
  nativeImage,
  session,
  shell,
} from "electron";

import windowIconAsset from "../../assets/desktop/icon.png?asset";

import { config } from "./config";
import { buildContextMenuTemplate } from "./contextMenu";
import {
  installPermissionHandlers,
  isTrustedSender,
  onTrusted,
} from "./security";
import { type ResolvedServer, resolveServerUrl } from "./serverUrl";
import { openSettingsWindow } from "./settingsWindow";
import { updateTrayMenu } from "./tray";
import { startVirtualMic } from "./virtualMic";

// answers a still pending screen picker request with "cancelled"
let cancelPendingScreenPicker: (() => void) | null = null;

const SOURCE_ICON_SIZE = 256;

// resize() returns a new image; keep the data URLs sent to the page small
function scaleSourceIcon(icon?: Electron.NativeImage) {
  if (!icon || icon.isEmpty()) return undefined;

  return icon.getAspectRatio() > 1
    ? icon.resize({ width: SOURCE_ICON_SIZE })
    : icon.resize({ height: SOURCE_ICON_SIZE });
}

// global reference to main window
export let mainWindow: BrowserWindow;

// currently in-use server: --force-server > saved setting > official app
let server: ResolvedServer | undefined;

function currentServer() {
  if (!server) {
    server = resolveServerUrl(
      app.commandLine.hasSwitch("force-server")
        ? app.commandLine.getSwitchValue("force-server")
        : undefined,
      config.serverUrl,
    );
    if (server.warning) console.warn(server.warning);
  }
  return server;
}

/** URL of the web app currently loaded in the main window */
export function getServerUrl() {
  return currentServer().url;
}

/** Where the current server came from (command line, settings or default) */
export function getServerSource() {
  return currentServer().source;
}

/** Warning about an ignored invalid server setting, if any */
export function getServerWarning() {
  return currentServer().warning;
}

/** Origin of the loaded app; the only origin trusted with IPC and permissions */
export function getAppOrigin() {
  return new URL(getServerUrl()).origin;
}

/**
 * Load another server in the main window. The caller validates and persists
 * the URL; logins stay separate per server because storage is per origin.
 */
export function switchServer(url: string) {
  server = { url, source: "settings" };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(url).catch((err) => {
      console.error("Failed to load server:", err);
    });
  }
}

// internal window state
let shouldQuit = false;

// load the window icon
const windowIcon = nativeImage.createFromDataURL(windowIconAsset);

// windowIcon.setTemplateImage(true);

/**
 * Create the main application window
 */
export function createMainWindow() {
  // (CLI arg --hidden or config)
  const startHidden =
    app.commandLine.hasSwitch("hidden") || config.startMinimisedToTray;
  const isMacOS = process.platform === "darwin";

  // create the window
  mainWindow = new BrowserWindow({
    minWidth: 300,
    minHeight: 300,
    width: 1280,
    height: 720,
    backgroundColor: "#191919",
    frame: isMacOS ? true : !config.customFrame,
    titleBarStyle: isMacOS ? "hidden" : "default",
    trafficLightPosition: isMacOS ? { x: 8, y: 8 } : undefined,
    icon: windowIcon,
    show: !startHidden,
    webPreferences: {
      // relative to `.vite/build`
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: config.spellchecker,
    },
  });

  // apply the persisted spellchecker setting (previously only applied when toggled)
  mainWindow.webContents.session.setSpellCheckerEnabled(config.spellchecker);

  // hide the options
  mainWindow.setMenu(null);

  // restore last position if it was moved previously
  if (config.windowState.x > 0 || config.windowState.y > 0) {
    mainWindow.setPosition(
      config.windowState.x ?? 0,
      config.windowState.y ?? 0,
    );
  }

  // restore last size if it was resized previously
  if (config.windowState.width > 0 && config.windowState.height > 0) {
    mainWindow.setSize(
      config.windowState.width ?? 1280,
      config.windowState.height ?? 720,
    );
  }

  // maximise the window if it was maximised before
  if (config.windowState.isMaximised && !startHidden) {
    mainWindow.maximize();
  }

  // load the entrypoint
  mainWindow
    .loadURL(getServerUrl())
    .then(() => mainWindow.webContents.reload())
    // did-fail-load opens the desktop settings with the reason
    .catch((err) => console.error("Failed to load the app:", err));

  // minimise window to tray
  mainWindow.on("close", (event) => {
    if (!shouldQuit && config.minimiseToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // update tray menu when window is shown/hidden
  mainWindow.on("show", updateTrayMenu);
  mainWindow.on("hide", updateTrayMenu);

  // keep track of window state
  function generateState() {
    config.windowState = {
      x: mainWindow.getPosition()[0],
      y: mainWindow.getPosition()[1],
      width: mainWindow.getSize()[0],
      height: mainWindow.getSize()[1],
      isMaximised: mainWindow.isMaximized(),
    };
  }

  mainWindow.on("maximize", generateState);
  mainWindow.on("unmaximize", generateState);
  mainWindow.on("moved", generateState);
  mainWindow.on("resized", generateState);

  // rebind zoom controls to be more sensible
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control && (input.key === "=" || input.key === "+")) {
      // zoom in (+)
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(
        mainWindow.webContents.getZoomLevel() + 1,
      );
    } else if (input.control && input.key === "-") {
      // zoom out (-)
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(
        mainWindow.webContents.getZoomLevel() - 1,
      );
    } else if (input.control && input.key === "0") {
      // reset zoom to default.
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
    } else if (
      input.key === "F5" ||
      ((input.control || input.meta) && input.key.toLowerCase() === "r")
    ) {
      event.preventDefault();
      mainWindow.webContents.reload();
    }
  });

  // Ctrl/Cmd+Shift+, opens the desktop settings (e.g. to change the server)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const modifier = process.platform === "darwin" ? input.meta : input.control;
    if (
      input.type === "keyDown" &&
      modifier &&
      input.shift &&
      input.code === "Comma"
    ) {
      event.preventDefault();
      openSettingsWindow();
    }
  });

  // if the server cannot be loaded, offer to change it instead of a blank window
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 (ERR_ABORTED) happens on regular navigations/reloads
      if (!isMainFrame || errorCode === -3) return;
      openSettingsWindow(
        `Could not load ${validatedURL} (${errorDescription}). Check the server address or your connection.`,
      );
    },
  );

  // send the config
  mainWindow.webContents.on("did-finish-load", () => config.sync());

  // context menu: spelling, edit actions, links and images
  mainWindow.webContents.on("context-menu", (_, params) => {
    const contents = mainWindow.webContents;
    const template = buildContextMenuTemplate(params, {
      replaceMisspelling: (suggestion) =>
        contents.replaceMisspelling(suggestion),
      addToDictionary: (word) =>
        contents.session.addWordToSpellCheckerDictionary(word),
      toggleSpellcheck: () => {
        config.spellchecker = !config.spellchecker;
      },
      copyText: (text) => clipboard.writeText(text),
      openExternal: (url) => shell.openExternal(url),
      copyImageAt: (x, y) => contents.copyImageAt(x, y),
      downloadUrl: (url) => contents.downloadURL(url),
    });

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup();
    }
  });

  // Create display media request handler
  // only the app origin gets permissions (Electron grants all by default)
  installPermissionHandlers(session.defaultSession, () => getAppOrigin());

  session.defaultSession.setDisplayMediaRequestHandler(
    (request, originalCallback) => {
      const callback = async (streams: Electron.Streams) => {
        try {
          if (streams.video) await startVirtualMic();
        } catch (e) {
          console.error("Virtual mic setup error", e);
        } finally {
          originalCallback(streams);
        }
      };
      desktopCapturer
        .getSources({ types: ["screen", "window"], fetchWindowIcons: true })
        .then((sources) => {
          // Shortcut for linux wayland.
          if (sources.length == 1) {
            request.audioRequested
              ? callback({
                  video: sources[0],
                  audio: "loopback",
                })
              : callback({
                  video: sources[0],
                });
            return;
          }
          // only one picker can be pending; answer the previous request first
          cancelPendingScreenPicker?.();
          const onPick = (
            event: Electron.IpcMainEvent,
            idx: number,
            audio: boolean,
          ) => {
            cancelPendingScreenPicker = null;
            if (!isTrustedSender(event, getAppOrigin())) {
              callback({});
              return;
            }
            if (!Number.isInteger(idx) || idx < 0 || idx >= sources.length) {
              callback({});
            } else if (audio) {
              callback({ video: sources[idx], audio: "loopback" });
            } else {
              callback({ video: sources[idx] });
            }
          };
          ipcMain.once("screenPickerCallback", onPick);
          cancelPendingScreenPicker = () => {
            ipcMain.removeListener("screenPickerCallback", onPick);
            cancelPendingScreenPicker = null;
            callback({});
          };
          mainWindow.webContents.send(
            "screenPicker",
            sources.map((source, idx) => {
              const image = scaleSourceIcon(source.appIcon);
              return {
                idx: idx,
                name: source.name,
                isFullScreen: source.id.startsWith("screen"),
                image: image?.toDataURL(),
              };
            }),
          );
        })
        .catch(() => originalCallback(null));
    },
    { useSystemPicker: true },
  );

  // mainWindow.webContents.openDevTools();

  // let i = 0;
  // setInterval(() => setBadgeCount((++i % 30) + 1), 1000);
}

// Push world events to the window
//
// The window can in theory be recreated, and this is done in practice on macOS,
// so this is registered app-wide
onTrusted(
  "minimise",
  () => getAppOrigin(),
  () => mainWindow?.minimize(),
);
onTrusted(
  "maximise",
  () => getAppOrigin(),
  () =>
    mainWindow?.isMaximized()
      ? mainWindow.unmaximize()
      : mainWindow?.maximize(),
);
onTrusted(
  "close",
  () => getAppOrigin(),
  () => mainWindow?.close(),
);

/**
 * Quit the entire app
 */
export function quitApp() {
  shouldQuit = true;
  mainWindow.close();
}

// Ensure global app quit works properly
app.on("before-quit", () => {
  shouldQuit = true;
});
