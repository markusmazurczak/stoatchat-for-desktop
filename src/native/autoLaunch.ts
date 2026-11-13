import AutoLaunch from "auto-launch";

import { ipcMain } from "electron";

import { getAutoLaunchPath } from "./squirrel";

export const autoLaunch = new AutoLaunch({
  name: "Stoat",
  // on Squirrel installs point at the launcher stub, not the versioned
  // app-x.y.z folder that is removed by the next update
  path: getAutoLaunchPath(),
});

export function initAutoLaunch() {
  ipcMain.handle("getAutostart", async () => {
    const enabled = await autoLaunch.isEnabled();
    return enabled;
  });

  ipcMain.handle("setAutostart", async (_event, state: boolean) => {
    if (state) {
      await autoLaunch.enable();
      console.log("Received new configuration autoStart: true");
    } else {
      await autoLaunch.disable();
      console.log("Received new configuration autoStart: false");
    }

    const enabled = await autoLaunch.isEnabled();
    return enabled;
  });
}
