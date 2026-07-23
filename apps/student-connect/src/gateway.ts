import { invoke } from "@tauri-apps/api/core";
import { initialBrowserSnapshot, type ConnectSnapshot } from "./domain.js";

export interface ConnectGateway {
  load(): Promise<ConnectSnapshot>;
}

export function createConnectGateway(): ConnectGateway {
  if ("__TAURI_INTERNALS__" in window)
    return { load: () => invoke<ConnectSnapshot>("connect_snapshot") };
  return { load: () => Promise.resolve(initialBrowserSnapshot()) };
}
