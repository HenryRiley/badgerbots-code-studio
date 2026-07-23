import type { StoreState } from "./types.js";

export class MemoryControlPlaneStore {
  readonly state: StoreState = {
    organizations: [],
    locations: [],
    instructors: [],
    memberships: [],
    sessions: [],
    campers: [],
    workspaces: [],
    versions: [],
    progressRecords: [],
    helpRequests: [],
    audits: [],
    realtimeHints: [],
  };
}
