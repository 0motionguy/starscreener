import { getRepoReasons } from "../src/lib/repo-reasons";
import { slugToId } from "../src/lib/utils";

const repo = process.argv[2] ?? "ollama/ollama";
console.log("slug:", slugToId(repo));
const reasons = getRepoReasons(repo);
console.log("count:", reasons.length);
console.log(JSON.stringify(reasons, null, 2));
