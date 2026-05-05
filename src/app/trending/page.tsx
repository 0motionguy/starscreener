import { permanentRedirect } from "next/navigation";

// Legacy canonical path: homepage is the trending terminal.
// Keep /trending as a cheap server redirect to avoid expensive 404 renders.
export default function TrendingRedirectPage() {
  permanentRedirect("/");
}
