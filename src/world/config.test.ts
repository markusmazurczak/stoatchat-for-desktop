import { beforeEach, describe, expect, it, vi } from "vitest";

const exposed: Record<string, unknown> = {};
const listeners: Record<string, (event: unknown, data: unknown) => void> = {};

const sampleConfig: DesktopConfig = {
  firstLaunch: false,
  customFrame: true,
  minimiseToTray: true,
  startMinimisedToTray: false,
  spellchecker: true,
  hardwareAcceleration: true,
  discordRpc: false,
  windowState: { x: 1, y: 2, width: 800, height: 600, isMaximised: true },
};

const sendSync = vi.fn(() => sampleConfig);

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => (exposed[key] = api),
  },
  ipcRenderer: {
    sendSync: (...args: unknown[]) => sendSync(...(args as [])),
    send: vi.fn(),
    invoke: vi.fn(),
    on: (channel: string, fn: (event: unknown, data: unknown) => void) =>
      (listeners[channel] = fn),
  },
}));

type Bridge = { get(): DesktopConfig | undefined };

describe("preload desktopConfig bridge", () => {
  beforeEach(async () => {
    vi.resetModules();
    sendSync.mockClear();
    await import("./config");
  });

  it("returns the configuration before any push from the main process", () => {
    const bridge = exposed.desktopConfig as Bridge;

    expect(sendSync).toHaveBeenCalledWith("config:get");
    expect(bridge.get()?.windowState.isMaximised).toBe(true);
  });

  it("reflects configuration pushed later by the main process", () => {
    const bridge = exposed.desktopConfig as Bridge;
    const updated = { ...sampleConfig, customFrame: false };

    listeners.config({}, updated);

    expect(bridge.get()?.customFrame).toBe(false);
  });
});
