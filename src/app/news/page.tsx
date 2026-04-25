// /news → permanently redirects to /signals (Market Signals).
import { redirect } from "next/navigation";

export default function NewsPage() {
  redirect("/signals");
}
