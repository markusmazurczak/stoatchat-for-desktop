import { type JSONSchema } from "json-schema-typed";

import { ipcMain } from "electron";
import Store from "electron-store";

import { destroyDiscordRpc, initDiscordRpc } from "./discordRpc";
import { onTrusted, sanitizeConfigUpdate } from "./security";
import { getAppOrigin, mainWindow } from "./window";

const schema = {
  firstLaunch: {
    type: "boolean",
  } as JSONSchema.Boolean,
  customFrame: {
    type: "boolean",
  } as JSONSchema.Boolean,
  minimiseToTray: {
    type: "boolean",
  } as JSONSchema.Boolean,
  startMinimisedToTray: {
    type: "boolean",
  } as JSONSchema.Boolean,
  spellchecker: {
    type: "boolean",
  } as JSONSchema.Boolean,
  hardwareAcceleration: {
    type: "boolean",
  } as JSONSchema.Boolean,
  discordRpc: {
    type: "boolean",
  } as JSONSchema.Boolean,
  voiceJoinOnDoubleClick: {
    type: "boolean",
  } as JSONSchema.Boolean,
  serverUrl: {
    type: "string",
  } as JSONSchema.String,
  recentServers: {
    type: "array",
    items: { type: "string" },
  } as JSONSchema.Array,
  windowState: {
    type: "object",
    properties: {
      x: {
        type: "number",
      } as JSONSchema.Number,
      y: {
        type: "number",
      } as JSONSchema.Number,
      width: {
        type: "number",
      } as JSONSchema.Number,
      height: {
        type: "number",
      } as JSONSchema.Number,
      isMaximised: {
        type: "boolean",
      } as JSONSchema.Boolean,
    },
  } as JSONSchema.Object,
};

/** Desktop-only settings that are never exposed to the web app */
type LocalConfig = {
  /** empty: use the official server */
  serverUrl: string;
  recentServers: string[];
};

const defaults: DesktopConfig & LocalConfig = {
  serverUrl: "",
  recentServers: [],
  firstLaunch: true,
  customFrame: true,
  minimiseToTray: true,
  startMinimisedToTray: false,
  spellchecker: true,
  hardwareAcceleration: true,
  discordRpc: true,
  voiceJoinOnDoubleClick: false,
  windowState: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    isMaximised: false,
  },
};

const store = new Store({
  schema,
  defaults,
});

/**
 * Shim for `electron-store` because typings are broken
 */
class Config {
  snapshot(): DesktopConfig {
    return {
      firstLaunch: this.firstLaunch,
      customFrame: this.customFrame,
      minimiseToTray: this.minimiseToTray,
      startMinimisedToTray: this.startMinimisedToTray,
      spellchecker: this.spellchecker,
      hardwareAcceleration: this.hardwareAcceleration,
      discordRpc: this.discordRpc,
      voiceJoinOnDoubleClick: this.voiceJoinOnDoubleClick,
      windowState: this.windowState,
    };
  }

  sync() {
    mainWindow.webContents.send("config", this.snapshot());
  }

  get firstLaunch() {
    return (store as never as { get(k: string): boolean }).get("firstLaunch");
  }

  set firstLaunch(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "firstLaunch",
      value,
    );

    this.sync();
  }

  get customFrame() {
    return (store as never as { get(k: string): boolean }).get("customFrame");
  }

  set customFrame(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "customFrame",
      value,
    );

    this.sync();
  }

  get minimiseToTray() {
    return (store as never as { get(k: string): boolean }).get(
      "minimiseToTray",
    );
  }

  set minimiseToTray(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "minimiseToTray",
      value,
    );

    this.sync();
  }

  get startMinimisedToTray() {
    return (store as never as { get(k: string): boolean }).get(
      "startMinimisedToTray",
    );
  }

  set startMinimisedToTray(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "startMinimisedToTray",
      value,
    );

    this.sync();
  }

  get spellchecker() {
    return (store as never as { get(k: string): boolean }).get("spellchecker");
  }

  set spellchecker(value: boolean) {
    mainWindow.webContents.session.setSpellCheckerEnabled(value);

    (store as never as { set(k: string, value: boolean): void }).set(
      "spellchecker",
      value,
    );

    this.sync();
  }

  get hardwareAcceleration() {
    return (store as never as { get(k: string): boolean }).get(
      "hardwareAcceleration",
    );
  }

  set hardwareAcceleration(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "hardwareAcceleration",
      value,
    );

    this.sync();
  }

  get discordRpc() {
    return (store as never as { get(k: string): boolean }).get("discordRpc");
  }

  set discordRpc(value: boolean) {
    const changed = value !== this.discordRpc;

    // persist first: initDiscordRpc() reads the stored value
    (store as never as { set(k: string, value: boolean): void }).set(
      "discordRpc",
      value,
    );

    // the web app sends the whole config on every change; only react to real toggles
    if (changed) {
      if (value) {
        initDiscordRpc();
      } else {
        destroyDiscordRpc();
      }
    }

    this.sync();
  }

  get voiceJoinOnDoubleClick() {
    return (store as never as { get(k: string): boolean }).get(
      "voiceJoinOnDoubleClick",
    );
  }

  set voiceJoinOnDoubleClick(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "voiceJoinOnDoubleClick",
      value,
    );

    this.sync();
  }

  get serverUrl() {
    return (store as never as { get(k: string): string }).get("serverUrl");
  }

  set serverUrl(value: string) {
    (store as never as { set(k: string, value: string): void }).set(
      "serverUrl",
      value,
    );
  }

  get recentServers() {
    return (store as never as { get(k: string): string[] }).get(
      "recentServers",
    );
  }

  set recentServers(value: string[]) {
    (store as never as { set(k: string, value: string[]): void }).set(
      "recentServers",
      value,
    );
  }

  get windowState() {
    return (
      store as never as { get(k: string): DesktopConfig["windowState"] }
    ).get("windowState");
  }

  set windowState(value: DesktopConfig["windowState"]) {
    (
      store as never as {
        set(k: string, value: DesktopConfig["windowState"]): void;
      }
    ).set("windowState", value);

    this.sync();
  }
}

export const config = new Config();

// The preload reads the configuration synchronously before any page script runs.
// Waiting for `did-finish-load` is too late: the web app may already render the
// custom titlebar, which reads `desktopConfig.get().windowState` (blank window).
ipcMain.on("config:get", (event) => {
  // A sync IPC without returnValue would block the renderer, so always answer.
  try {
    event.returnValue = config.snapshot();
  } catch (error) {
    console.error("Failed to read configuration, using defaults:", error);
    event.returnValue = defaults;
  }
});

onTrusted(
  "config",
  () => getAppOrigin(),
  (_, input) => {
    const newConfig = sanitizeConfigUpdate(input);
    console.info("Received new configuration", newConfig);
    Object.entries(newConfig).forEach(
      ([key, value]) => (config[key as keyof DesktopConfig] = value as never),
    );
  },
);
