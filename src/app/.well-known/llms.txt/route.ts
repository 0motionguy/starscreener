// .well-known/llms.txt — alias for /llms.txt to satisfy crawlers that
// probe the well-known prefix per IETF RFC 8615 conventions. Same content,
// same cache headers, same dynamic mode.

export { GET, dynamic, revalidate } from "@/app/llms.txt/route";
