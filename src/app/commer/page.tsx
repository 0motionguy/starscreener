// SEO: redirect
// /commer — alias to the canonical /agent-commerce surface. Pure redirect.

import { redirect } from "next/navigation";

export default function CommerAliasPage() {
  redirect("/agent-commerce");
}
