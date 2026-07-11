import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  return NextResponse.json(
    {
      version: "1.0",
      actions: [
        { id: "repo.search", risk: "safe", description: "Search public repository index." },
        { id: "repo.filter.category", risk: "safe", description: "Filter visible repo results." },
        { id: "repo.sort", risk: "safe", description: "Sort visible repo results." },
        { id: "repo.open", risk: "safe", description: "Open a public repo detail page." },
        { id: "repo.compare", risk: "safe", description: "Add or remove a repo from compare." },
        { id: "repo.watchlist", risk: "confirm", description: "Mutate local watchlist state." },
        { id: "toolbox.scan", risk: "confirm", description: "Send public repo IDs to Toolbox." },
        { id: "x402.paid", risk: "confirm", description: "Paid execution requires visible quote and confirmation." },
      ],
      blocked: ["arbitrary_javascript", "secret_exfiltration", "paid_without_confirmation"],
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
