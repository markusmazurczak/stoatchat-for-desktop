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
import { updateTrayMenu } from "./tray";
import { startVirtualMic } from "./virtualMic";

// global reference to main window
export let mainWindow: BrowserWindow;

// currently in-use build
export const BUILD_URL = new URL(
  app.commandLine.hasSwitch("force-server")
    ? app.commandLine.getSwitchValue("force-server")
    : /*MAIN_WINDOW_VITE_DEV_SERVER_URL ??*/ "https://stoat.chat/app",
);

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
      spellcheck: true,
    },
  });

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
    .loadURL(BUILD_URL.toString())
    .then(() => mainWindow.webContents.reload());

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
          ipcMain.once(
            "screenPickerCallback",
            (_, idx: number, audio: boolean) => {
              if (idx < 0 || idx > sources.length) {
                callback({});
              } else {
                audio
                  ? callback({
                      video: sources[idx],
                      audio: "loopback",
                    })
                  : callback({
                      video: sources[idx],
                    });
              }
            },
          );
          mainWindow.webContents.send(
            "screenPicker",
            sources.map((source, idx) => {
              const image = source.appIcon;
              if (image) {
                if (image.getAspectRatio() > 1) {
                  image.resize({ width: 256 });
                } else {
                  image.resize({ height: 256 });
                }
              }
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
ipcMain.on("minimise", () => mainWindow?.minimize());
ipcMain.on("maximise", () =>
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize(),
);
ipcMain.on("close", () => mainWindow?.close());

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
