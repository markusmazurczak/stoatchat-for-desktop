import { Client } from "discord-rpc";

import { config } from "./config";

const CLIENT_ID = "872068124005007420";
const RECONNECT_DELAY_MS = 10_000;

// internal state: at most one client and one pending reconnect
let rpc: Client | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!config.discordRpc || reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initDiscordRpc();
  }, RECONNECT_DELAY_MS);
}

function disposeClient() {
  const client = rpc;
  rpc = null;
  if (!client) return;

  client.removeAllListeners();
  client.destroy().catch((err) => {
    console.warn("Failed to close Discord RPC connection:", err);
  });
}

export async function initDiscordRpc() {
  if (!config.discordRpc) return;

  // never keep more than one client alive (old clients kept the activity visible)
  clearReconnect();
  disposeClient();

  const client = new Client({ transport: "ipc" });
  rpc = client;

  const handleConnectionLoss = () => {
    if (rpc !== client) return;
    disposeClient();
    scheduleReconnect();
  };

  client.on("ready", () =>
    client
      .setActivity({
        state: "stoat.chat",
        details: "Chatting with others",
        largeImageKey: "qr",
        largeImageText: "Join Stoat!",
        buttons: [
          {
            label: "Join Stoat",
            url: "https://stoat.chat/",
          },
        ],
      })
      .catch((err) => console.warn("Failed to set Discord activity:", err)),
  );

  client.on("disconnected", handleConnectionLoss);

  try {
    await client.login({ clientId: CLIENT_ID });
  } catch {
    // Discord is not running or refused the connection; retry later
    handleConnectionLoss();
  }
}

export async function destroyDiscordRpc() {
  clearReconnect();
  disposeClient();
}
