import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

const clients: FakeClient[] = [];
let loginShouldFail = false;
const mockConfig = { discordRpc: true };

class FakeClient {
  listeners: Record<string, Listener> = {};
  destroyed = false;
  on(event: string, fn: Listener) {
    this.listeners[event] = fn;
    return this;
  }
  removeAllListeners() {
    this.listeners = {};
    return this;
  }
  login() {
    return loginShouldFail
      ? Promise.reject(new Error("not running"))
      : Promise.resolve(this);
  }
  setActivity() {
    return Promise.resolve();
  }
  destroy() {
    this.destroyed = true;
    return Promise.resolve();
  }
  constructor() {
    clients.push(this);
  }
}

vi.mock("discord-rpc", () => ({ Client: FakeClient }));
vi.mock("./config", () => ({ config: mockConfig }));

describe("Discord RPC", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    clients.length = 0;
    loginShouldFail = false;
    mockConfig.discordRpc = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a single client when initialised repeatedly", async () => {
    const { initDiscordRpc } = await import("./discordRpc");

    await initDiscordRpc();
    await initDiscordRpc();
    await initDiscordRpc();

    expect(clients.filter((c) => !c.destroyed)).toHaveLength(1);
  });

  it("destroys the client and does not reconnect after being disabled", async () => {
    const { initDiscordRpc, destroyDiscordRpc } = await import("./discordRpc");
    await initDiscordRpc();
    clients[0].listeners.disconnected?.();

    mockConfig.discordRpc = false;
    await destroyDiscordRpc();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(clients.every((c) => c.destroyed)).toBe(true);
    expect(clients).toHaveLength(1);
  });

  it("retries once Discord becomes available after a failed login", async () => {
    loginShouldFail = true;
    const { initDiscordRpc } = await import("./discordRpc");
    await initDiscordRpc();

    loginShouldFail = false;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(clients).toHaveLength(2);
    expect(clients[1].destroyed).toBe(false);
  });
});
