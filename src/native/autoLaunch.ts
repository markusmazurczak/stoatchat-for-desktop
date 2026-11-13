import AutoLaunch from "auto-launch";

import { handleTrusted } from "./security";
import { getAppOrigin } from "./window";

export const autoLaunch = new AutoLaunch({
  name: "Stoat",
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
