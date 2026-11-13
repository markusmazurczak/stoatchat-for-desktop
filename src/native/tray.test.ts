import { beforeEach, describe, expect, it, vi } from "vitest";

const setContextMenu = vi.fn();

vi.mock("electron", () => ({
  Menu: { buildFromTemplate: (t: unknown) => t },
  Tray: class {
    setContextMenu = setContextMenu;
    setToolTip = vi.fn();
    setImage = vi.fn();
    on = vi.fn();
    isDestroyed = () => false;
  },
  nativeImage: {
    createFromDataURL: () => ({
      resize: () => ({ setTemplateImage: vi.fn() }),
    }),
  },
}));
vi.mock("../../assets/desktop/icon.png?asset", () => ({ default: "" }));
vi.mock("../../assets/desktop/iconTemplate.png?asset", () => ({
  default: "",
}));
vi.mock("./window", () => ({
  mainWindow: { isVisible: () => true },
  quitApp: vi.fn(),
}));

describe("tray menu", () => {
  beforeEach(() => {
    vi.resetModules();
    setContextMenu.mockClear();
  });

  it("ignores menu updates before the tray exists", async () => {
    const { updateTrayMenu } = await import("./tray");

    expect(() => updateTrayMenu()).not.toThrow();
    expect(setContextMenu).not.toHaveBeenCalled();
  });

  it("builds the menu once the tray is created", async () => {
    const { initTray, updateTrayMenu } = await import("./tray");
    initTray();
    setContextMenu.mockClear();

    updateTrayMenu();

    expect(setContextMenu).toHaveBeenCalledTimes(1);
  });
});
