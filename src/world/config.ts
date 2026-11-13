import { contextBridge, ipcRenderer } from "electron";

// Available before the page's scripts run; kept up to date by "config" pushes.
let config: DesktopConfig = ipcRenderer.sendSync("config:get");

ipcRenderer.on("config", (_, data) => (config = data));

/** Current desktop config for other preload modules */
export function getDesktopConfig() {
  return config;
}

contextBridge.exposeInMainWorld("desktopConfig", {
  get: () => config,
  set: (config: DesktopConfig) => ipcRenderer.send("config", config),
  getAutostart() {
    return ipcRenderer.invoke("getAutostart") as Promise<boolean>;
  },
  setAutostart(value: boolean) {
    return ipcRenderer.invoke("setAutostart", value) as Promise<boolean>;
  },
});
