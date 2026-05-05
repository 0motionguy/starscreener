let _override: unknown = null;

export function resolveBuildSidebarData<T>(defaultFn: T): T {
  return ((_override as T | null) ?? defaultFn) as T;
}

export function __setBuildSidebarDataForTests<T>(fn: T): void {
  _override = fn;
}

export function __resetBuildSidebarDataForTests(): void {
  _override = null;
}
