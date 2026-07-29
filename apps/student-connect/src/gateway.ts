import { invoke } from "@tauri-apps/api/core";
import { initialBrowserSnapshot, type ConnectSnapshot } from "./domain.js";

export interface ConnectGateway {
  load(): Promise<ConnectSnapshot>;
  openCodingConsole(): Promise<string>;
}

export function createConnectGateway(): ConnectGateway {
  if ("__TAURI_INTERNALS__" in window)
    return {
      load: () => invoke<ConnectSnapshot>("connect_snapshot"),
      openCodingConsole: () => invoke<string>("open_coding_console"),
    };
  return {
    load: () => Promise.resolve(initialBrowserSnapshot()),
    openCodingConsole: () => {
      window.open("http://127.0.0.1:3000/classroom", "_blank", "noopener,noreferrer");
      return Promise.resolve(
        "Opened the local classroom preview without a persistent device link.",
      );
    },
  };
}
