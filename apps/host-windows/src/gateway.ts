import { invoke } from "@tauri-apps/api/core";
import {
  completeSetupStep,
  createInitialHostSnapshot,
  requestServerTransition,
  type HostOnboardingView,
  type HostSnapshot,
  type InstructorProfile,
  type SignInResult,
  type SetupStepId,
} from "./domain.js";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export interface HostGateway {
  load(): Promise<HostSnapshot>;
  onboarding(): Promise<HostOnboardingView>;
  configureService(serviceUrl: string, publishableKey: string): Promise<HostOnboardingView>;
  signIn(email: string, password: string): Promise<SignInResult>;
  pairHost(
    organizationId: string,
    locationId: string,
    displayName: string,
  ): Promise<HostOnboardingView>;
  signOut(): Promise<HostOnboardingView>;
  probeHardware(): Promise<HostSnapshot>;
  completeStep(stepId: SetupStepId, detail: string): Promise<HostSnapshot>;
  transition(
    action: "start" | "mark_running" | "stop" | "mark_stopped" | "crash",
  ): Promise<HostSnapshot>;
  resetPreview(): Promise<HostSnapshot>;
}

export function createHostGateway(): HostGateway {
  if (window.__TAURI_INTERNALS__) return nativeGateway;
  let snapshot = createInitialHostSnapshot("browser_preview");
  let onboarding: HostOnboardingView = {
    serviceConfigured: false,
    signedIn: false,
    paired: false,
    credentialProtection: "Preview only — no credential is stored",
  };
  const previewProfile: InstructorProfile = {
    memberships: [{ organizationId: "preview-organization", role: "owner" }],
    organizations: [{ id: "preview-organization", name: "BadgerBots preview" }],
    locations: [
      {
        id: "preview-location",
        organizationId: "preview-organization",
        name: "Madison preview",
      },
    ],
  };
  return {
    load: () => Promise.resolve(structuredClone(snapshot)),
    onboarding: () => Promise.resolve(structuredClone(onboarding)),
    configureService: (serviceUrl) => {
      onboarding = {
        ...onboarding,
        serviceConfigured: true,
        serviceUrl,
      };
      return Promise.resolve(structuredClone(onboarding));
    },
    signIn: (email) => {
      onboarding = { ...onboarding, signedIn: true, instructorEmail: email };
      snapshot = completeSetupStep(
        snapshot,
        "instructor_sign_in",
        "Preview identity — no credential stored.",
      );
      return Promise.resolve({
        onboarding: structuredClone(onboarding),
        profile: structuredClone(previewProfile),
      });
    },
    pairHost: (_organizationId, _locationId, displayName) => {
      onboarding = {
        ...onboarding,
        paired: true,
        organizationName: "BadgerBots preview",
        locationName: "Madison preview",
        hostId: "preview-host",
        hostDisplayName: displayName,
      };
      snapshot = completeSetupStep(snapshot, "location", "Madison preview");
      return Promise.resolve(structuredClone(onboarding));
    },
    signOut: () => {
      onboarding = { ...onboarding, signedIn: false };
      return Promise.resolve(structuredClone(onboarding));
    },
    probeHardware: () => {
      snapshot = {
        ...snapshot,
        readiness: snapshot.readiness.map((check) =>
          check.id === "platform" || check.id === "memory"
            ? {
                ...check,
                status: "warning",
                measured: "Browser preview — native measurement unavailable",
              }
            : check,
        ),
      };
      return Promise.resolve(structuredClone(snapshot));
    },
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
  onboarding: () => invoke<HostOnboardingView>("host_onboarding_status"),
  configureService: (serviceUrl, publishableKey) =>
    invoke<HostOnboardingView>("configure_classroom_service", { serviceUrl, publishableKey }),
  signIn: (email, password) => invoke<SignInResult>("sign_in_instructor", { email, password }),
  pairHost: (organizationId, locationId, displayName) =>
    invoke<HostOnboardingView>("pair_classroom_host", {
      organizationId,
      locationId,
      displayName,
    }),
  signOut: () => invoke<HostOnboardingView>("sign_out_instructor"),
  probeHardware: () => invoke<HostSnapshot>("probe_host_hardware"),
  completeStep: (stepId, detail) => invoke<HostSnapshot>("complete_setup_step", { stepId, detail }),
  transition: (action) => invoke<HostSnapshot>("transition_server", { action }),
  resetPreview: () => Promise.reject(new Error("Native Host state cannot be reset from the UI.")),
};
