import { contextBridge, ipcRenderer } from "electron";

// Minimal bridge for the local desktop settings window only.
// The remote web app never gets this preload.
contextBridge.exposeInMainWorld("stoatSettings", {
  getState: () => ipcRenderer.invoke("settings:get-state"),
  testServer: (url: string) => ipcRenderer.invoke("settings:test-server", url),
  save: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  close: () => window.close(),
});
