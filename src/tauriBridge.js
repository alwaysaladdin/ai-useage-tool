import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export function isTauriRuntime() {
  return Boolean(window.__TAURI_INTERNALS__);
}

export async function openDashboardWindow() {
  if (isTauriRuntime()) {
    await invoke("open_dashboard");
    return;
  }

  window.open("/#overview", "_blank", "noopener,noreferrer");
}

export async function hideMenubarWindow() {
  if (isTauriRuntime()) {
    await invoke("hide_menubar_window");
  }
}

export async function quitDesktopApp() {
  if (isTauriRuntime()) {
    await invoke("quit_app");
  }
}

export async function onTraySync(handler) {
  if (!isTauriRuntime()) return () => {};
  return listen("tray-sync", handler);
}
