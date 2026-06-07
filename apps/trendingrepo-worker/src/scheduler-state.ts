export interface SchedulerRuntimeState {
  activeJobs: string[];
  skippedJobs: string[];
  overrides: {
    total: number;
    paused: number;
    deprecated: number;
  };
  lastReconciledAt: string | null;
  reconciliationErrors: number;
}

let state: SchedulerRuntimeState = {
  activeJobs: [],
  skippedJobs: [],
  overrides: { total: 0, paused: 0, deprecated: 0 },
  lastReconciledAt: null,
  reconciliationErrors: 0,
};

export function publishSchedulerRuntimeState(
  next: Omit<SchedulerRuntimeState, 'activeJobs' | 'skippedJobs'> & {
    activeJobs: Iterable<string>;
    skippedJobs: Iterable<string>;
  },
): void {
  state = {
    activeJobs: [...next.activeJobs].sort(),
    skippedJobs: [...next.skippedJobs].sort(),
    overrides: next.overrides,
    lastReconciledAt: next.lastReconciledAt,
    reconciliationErrors: next.reconciliationErrors,
  };
}

export function getSchedulerRuntimeState(): SchedulerRuntimeState {
  return {
    activeJobs: [...state.activeJobs],
    skippedJobs: [...state.skippedJobs],
    overrides: { ...state.overrides },
    lastReconciledAt: state.lastReconciledAt,
    reconciliationErrors: state.reconciliationErrors,
  };
}
