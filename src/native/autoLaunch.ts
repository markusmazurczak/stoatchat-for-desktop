import AutoLaunch from "auto-launch";

import { handleTrusted } from "./security";
import { getAppOrigin } from "./window";

import { getAutoLaunchPath } from "./squirrel";

export const autoLaunch = new AutoLaunch({
  name: "Stoat",
  // on Squirrel installs point at the launcher stub, not the versioned
  // app-x.y.z folder that is removed by the next update
  path: getAutoLaunchPath(),
});

export function initAutoLaunch() {
  handleTrusted(
    "getAutostart",
    () => getAppOrigin(),
    async () => {
      const enabled = await autoLaunch.isEnabled();
      return enabled;
    },
  );

  handleTrusted(
    "setAutostart",
    () => getAppOrigin(),
    async (_event, state) => {
      if (typeof state !== "boolean")
        throw new Error("Invalid autostart state");
      if (state) {
        await autoLaunch.enable();
        console.log("Received new configuration autoStart: true");
      } else {
        await autoLaunch.disable();
        console.log("Received new configuration autoStart: false");
      }

      const enabled = await autoLaunch.isEnabled();
      return enabled;
    },
  );
}
