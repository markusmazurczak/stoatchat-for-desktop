import { describe, expect, it } from "vitest";

import {
  DEFAULT_SERVER_URL,
  isOfficialServer,
  normalizeServerUrl,
  resolveServerUrl,
  withRecentServer,
} from "./serverUrl";

describe("normalizeServerUrl", () => {
  it("adds https:// and trims whitespace", () => {
    expect(normalizeServerUrl("  chat.example.com/app ")).toMatchObject({
      ok: true,
      url: "https://chat.example.com/app",
    });
  });

  it("keeps paths and query, drops the fragment", () => {
    expect(normalizeServerUrl("https://chat.example.com/app?x=1#top").url).toBe(
      "https://chat.example.com/app?x=1",
    );
  });

  it.each([
    ["http://chat.example.com", "Only https://"],
    ["ftp://chat.example.com", "Only https://"],
    ["javascript:alert(1)", "not a valid address"],
    ["https://user:pw@chat.example.com", "credentials"],
    ["", "enter a server address"],
    ["https://exa mple.com", "not a valid address"],
  ])("rejects %s", (input, message) => {
    const result = normalizeServerUrl(input);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(message);
  });

  it("allows http only for localhost", () => {
    expect(normalizeServerUrl("http://localhost:5173").ok).toBe(true);
    expect(normalizeServerUrl("http://127.0.0.1:5173/app").ok).toBe(true);
  });

  it("rejects overly long addresses", () => {
    expect(normalizeServerUrl(`https://a.com/${"x".repeat(3000)}`).ok).toBe(
      false,
    );
  });
});

describe("resolveServerUrl", () => {
  it("prefers --force-server over the saved setting", () => {
    expect(
      resolveServerUrl("https://cli.example.com", "https://saved.example.com"),
    ).toMatchObject({
      url: "https://cli.example.com/",
      source: "command-line",
    });
  });

  it("uses the saved setting without a command line value", () => {
    expect(
      resolveServerUrl(undefined, "https://saved.example.com/app"),
    ).toMatchObject({
      url: "https://saved.example.com/app",
      source: "settings",
    });
  });

  it("falls back to the official app", () => {
    expect(resolveServerUrl(undefined, "")).toEqual({
      url: DEFAULT_SERVER_URL,
      source: "default",
      warning: undefined,
    });
  });

  it("ignores invalid values with a warning instead of failing", () => {
    const result = resolveServerUrl("http://insecure.example.com", "");
    expect(result.url).toBe(DEFAULT_SERVER_URL);
    expect(result.warning).toContain("--force-server ignored");
  });
});

describe("helpers", () => {
  it("recognises the official server by origin", () => {
    expect(isOfficialServer("https://stoat.chat/app/")).toBe(true);
    expect(isOfficialServer("https://stoat.chat.evil.example/app")).toBe(false);
  });

  it("keeps recent servers unique, newest first and bounded", () => {
    const recent = ["a", "b", "c", "d", "e"];
    expect(withRecentServer(recent, "c")).toEqual(["c", "a", "b", "d", "e"]);
    expect(withRecentServer(recent, "f")).toEqual(["f", "a", "b", "c", "d"]);
  });
});
