export type HealthStatus = "ok" | "stale" | "error";

export function getHealthHttpStatusForStatus(
  status: HealthStatus,
  soft: boolean,
): 200 | 503 {
  if (status === "error") return soft ? 200 : 503;
  return 200;
}
