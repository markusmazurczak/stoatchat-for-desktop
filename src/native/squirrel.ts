import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { app } from "electron";

/**
 * AppUserModelID of the shortcuts Squirrel.Windows creates
 * (`com.squirrel.<package name>.<exe name>`, see forge.config.ts).
 * The app must use the same ID, otherwise Windows treats the running window
 * and the pinned/start-menu shortcut as different apps (duplicate taskbar
 * icons) and notifications lose the app name and icon.
 */
export const WINDOWS_APP_USER_MODEL_ID = "com.squirrel.Stoat.stoat-desktop";

export type SquirrelAction =
  | "create-shortcuts"
  | "keep-shortcuts"
  | "remove-shortcuts"
  | "quit"
  | null;

/**
 * Map Squirrel.Windows lifecycle arguments to what the app has to do.
 * Shortcuts are only created on the first install: recreating them on every
 * update brought back deleted desktop icons and dropped custom shortcut
 * arguments such as --force-server.
 */
export function getSquirrelAction(
  argv: string[],
  platform: NodeJS.Platform,
): SquirrelAction {
  if (platform !== "win32") return null;

  switch (argv[1]) {
    case "--squirrel-install":
      return "create-shortcuts";
    case "--squirrel-updated":
      return "keep-shortcuts";
    case "--squirrel-uninstall":
      return "remove-shortcuts";
    case "--squirrel-obsolete":
      return "quit";
    default:
      return null;
  }
}

function squirrelRoot() {
  return path.resolve(path.dirname(process.execPath), "..");
}

function runUpdateExe(args: string[]) {
  return new Promise<void>((resolve) => {
    const updateExe = path.join(squirrelRoot(), "Update.exe");
    spawn(updateExe, args, { detached: true })
      .on("error", (err) => {
        console.error("Failed to run Squirrel Update.exe:", err);
        resolve();
      })
      .on("close", () => resolve());
  });
}

/**
 * Path that survives updates: Squirrel replaces the versioned `app-x.y.z`
 * folder on every update, but keeps the launcher stub in the install root.
 */
export function getAutoLaunchPath() {
  if (process.platform !== "win32") return undefined;

  const stub = path.join(squirrelRoot(), path.basename(process.execPath));
  return fs.existsSync(path.join(squirrelRoot(), "Update.exe"))
    ? stub
    : undefined;
}

/**
 * Handle Squirrel.Windows install/update/uninstall events.
 * @returns true if the app was started by Squirrel and must quit
 */
export function handleSquirrelEvent(onUninstall: () => Promise<void>) {
  const action = getSquirrelAction(process.argv, process.platform);
  if (!action) return false;

  const target = path.basename(process.execPath);
  const finish = () => app.quit();

  switch (action) {
    case "create-shortcuts":
      runUpdateExe([`--createShortcut=${target}`]).then(finish);
      break;
    case "remove-shortcuts":
      onUninstall()
        .catch((err) => console.error("Uninstall cleanup failed:", err))
        .then(() => runUpdateExe([`--removeShortcut=${target}`]))
        .then(finish);
      break;
    default:
      finish();
  }

  return true;
}
