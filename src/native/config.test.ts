import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers: Record<string, (event: { returnValue?: unknown }) => void> = {};
const stored = new Map<string, unknown>();
let failReads = false;

vi.mock("electron", () => ({
  ipcMain: {
    on: (channel: string, fn: (event: { returnValue?: unknown }) => void) =>
      (handlers[channel] = fn),
  },
}));

vi.mock("electron-store", () => ({
  default: class {
    constructor(options: { defaults: Record<string, unknown> }) {
      Object.entries(options.defaults).forEach(([k, v]) => stored.set(k, v));
    }
    get(key: string) {
      if (failReads) throw new Error("corrupt store");
      return stored.get(key);
    }
    set(key: string, value: unknown) {
      stored.set(key, value);
    }
  },
}));

vi.mock("./discordRpc", () => ({
  initDiscordRpc: vi.fn(),
  destroyDiscordRpc: vi.fn(),
}));

vi.mock("./window", () => ({
  mainWindow: { webContents: { send: vi.fn() } },
}));

describe("main process config", () => {
  beforeEach(async () => {
    vi.resetModules();
    stored.clear();
    failReads = false;
    await import("./config");
  });

  it("answers the synchronous config:get request with a full snapshot", () => {
    const event: { returnValue?: DesktopConfig } = {};

    handlers["config:get"](event);

    expect(event.returnValue).toMatchObject({
      customFrame: true,
      startMinimisedToTray: false,
      windowState: { isMaximised: false },
    });
  });

  it("returns a snapshot that reflects updated values", async () => {
    const { config } = await import("./config");
    config.customFrame = false;
    const event: { returnValue?: DesktopConfig } = {};

    handlers["config:get"](event);

    expect(event.returnValue?.customFrame).toBe(false);
  });

  it("answers with defaults instead of blocking when the store cannot be read", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    failReads = true;
    const event: { returnValue?: DesktopConfig } = {};

    handlers["config:get"](event);

    expect(event.returnValue?.windowState).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      isMaximised: false,
    });
  });
});
