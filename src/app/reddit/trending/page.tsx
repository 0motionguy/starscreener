// Legacy /reddit/trending route. Collapsed into /reddit?tab=news under
// the unified Signal Terminal layout. The bubble map mindshare view is
// retired — topics surface as a dense list on /reddit?tab=topics.

import { redirect } from "next/navigation";

export default function RedditTrendingPage() {
  redirect("/reddit?tab=news");
}
