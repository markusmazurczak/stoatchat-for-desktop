import { describe, expect, it, vi } from "vitest";

import { getSquirrelAction } from "./squirrel";

vi.mock("electron", () => ({ app: { quit: vi.fn() } }));

const argv = (flag?: string) => ["stoat-desktop.exe", ...(flag ? [flag] : [])];

describe("getSquirrelAction", () => {
  it("creates shortcuts only on the first install", () => {
    expect(getSquirrelAction(argv("--squirrel-install"), "win32")).toBe(
      "create-shortcuts",
    );
  });

  it("leaves existing shortcuts alone on update", () => {
    expect(getSquirrelAction(argv("--squirrel-updated"), "win32")).toBe(
      "keep-shortcuts",
    );
  });

  it("removes shortcuts on uninstall", () => {
    expect(getSquirrelAction(argv("--squirrel-uninstall"), "win32")).toBe(
      "remove-shortcuts",
    );
  });

  it("quits for obsolete versions", () => {
    expect(getSquirrelAction(argv("--squirrel-obsolete"), "win32")).toBe(
      "quit",
    );
  });

  it("ignores normal starts, first-run and other platforms", () => {
    expect(getSquirrelAction(argv(), "win32")).toBeNull();
    expect(getSquirrelAction(argv("--squirrel-firstrun"), "win32")).toBeNull();
    expect(getSquirrelAction(argv("--squirrel-install"), "darwin")).toBeNull();
  });
});
