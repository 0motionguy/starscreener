const SOFT_404_MARKERS: RegExp[] = [
  /\b404\b/i,
  /\bnot\s+found\b/i,
  /\bpage\s+not\s+found\b/i,
  /\bresource\s+not\s+found\b/i,
  /\bdoes(?:\s+not|n't)\s+exist\b/i,
];

export interface Soft404CheckInput {
  status: number;
  bodyText: string;
}

export interface Soft404CheckResult {
  isSoft404: boolean;
  markers: string[];
}

export function detectSoft404(input: Soft404CheckInput): Soft404CheckResult {
  if (input.status < 200 || input.status >= 300) {
    return { isSoft404: false, markers: [] };
  }

  const normalized = input.bodyText.slice(0, 8192);
  const markers = SOFT_404_MARKERS.filter((pattern) => pattern.test(normalized)).map(
    (pattern) => pattern.source,
  );

  return {
    isSoft404: markers.length > 0,
    markers,
  };
}
