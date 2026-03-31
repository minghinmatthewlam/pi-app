import { app, net, Notification, shell } from "electron";

const RELEASES_URL =
  "https://api.github.com/repos/minghinmatthewlam/pi-gui/releases/latest";
const RELEASES_PAGE =
  "https://github.com/minghinmatthewlam/pi-gui/releases/latest";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const INITIAL_DELAY_MS = 15_000; // 15 seconds after launch

async function checkForUpdate(): Promise<void> {
  const res = await net.fetch(RELEASES_URL, {
    headers: { Accept: "application/vnd.github.v3+json" },
  });
  if (!res.ok) return;

  const release = (await res.json()) as { tag_name: string };
  const latest = release.tag_name.replace(/^v/, "");
  const current = app.getVersion();

  if (latest !== current) {
    const notification = new Notification({
      title: "pi-gui Update Available",
      body: `Version ${latest} is available (you have ${current}). Click to download.`,
    });
    notification.on("click", () => {
      shell.openExternal(RELEASES_PAGE);
    });
    notification.show();
  }
}

export function initUpdateChecker(): () => void {
  const noop = (e: Error) =>
    console.warn("Update check failed:", e.message);

  const timeout = setTimeout(() => checkForUpdate().catch(noop), INITIAL_DELAY_MS);
  const interval = setInterval(() => checkForUpdate().catch(noop), CHECK_INTERVAL_MS);

  return () => {
    clearTimeout(timeout);
    clearInterval(interval);
  };
}
