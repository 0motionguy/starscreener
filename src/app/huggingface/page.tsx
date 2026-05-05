import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

const TITLE = `Hugging Face Signal — ${SITE_NAME}`;
const DESCRIPTION =
  "Hugging Face hub: trending models, datasets, and spaces feeding the cross-source momentum scanner.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["Hugging Face trending", "HF models", "HF datasets", "HF spaces"],
  alternates: { canonical: absoluteUrl("/huggingface") },
  openGraph: {
    type: "website",
    url: absoluteUrl("/huggingface"),
    title: TITLE,
    description: DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function HuggingFaceAliasPage() {
  redirect("/huggingface/models");
}
