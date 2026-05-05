// UTF-8 safe base64url helpers shared by tier-list client/server paths.

export function encodeUtf8Base64Url(input: string): string {
  if (typeof window !== "undefined") {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return window
      .btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  return Buffer.from(input, "utf8").toString("base64url");
}

export function decodeUtf8Base64Url(input: string): string {
  if (typeof window !== "undefined") {
    const normalized = input
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(input.length / 4) * 4, "=");
    const binary = window.atob(normalized);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(input, "base64url").toString("utf8");
}
