// SEO: redirect
// /huggingface — alias to /huggingface/models. Pure redirect.

import { redirect } from "next/navigation";

export default function HuggingFaceAliasPage() {
  redirect("/huggingface/models");
}
