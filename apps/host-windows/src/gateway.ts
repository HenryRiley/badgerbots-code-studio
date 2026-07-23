import { invoke } from "@tauri-apps/api/core";
import {
  completeSetupStep,
  createInitialHostSnapshot,
  requestServerTransition,
  type HostSnapshot,
  type SetupStepId,
} from "./domain.js";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export interface HostGateway {
  load(): Promise<HostSnapshot>;
  completeStep(stepId: SetupStepId, detail: string): Promise<HostSnapshot>;
  transition(
    action: "start" | "mark_running" | "stop" | "mark_stopped" | "crash",
  ): Promise<HostSnapshot>;
  resetPreview(): Promise<HostSnapshot>;
}

export function createHostGateway(): HostGateway {
  if (window.__TAURI_INTERNALS__) return nativeGateway;
  let snapshot = createInitialHostSnapshot("browser_preview");
  return {
    load: () => Promise.resolve(structuredClone(snapshot)),
    completeStep: (stepId, detail) => {
      snapshot = completeSetupStep(snapshot, stepId, detail);
      return Promise.resolve(structuredClone(snapshot));
    },
    transition: (action) => {
      snapshot = requestServerTransition(snapshot, action);
      return Promise.resolve(structuredClone(snapshot));
    },
    resetPreview: () => {
      snapshot = createInitialHostSnapshot("browser_preview");
      return Promise.resolve(structuredClone(snapshot));
    },
  };
}

const nativeGateway: HostGateway = {
  load: () => invoke<HostSnapshot>("host_snapshot"),
  completeStep: (stepId, detail) => invoke<HostSnapshot>("complete_setup_step", { stepId, detail }),
  transition: (action) => invoke<HostSnapshot>("transition_server", { action }),
  resetPreview: () => Promise.reject(new Error("Native Host state cannot be reset from the UI.")),
};
