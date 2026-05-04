import type { DataStore } from "@/lib/data-store";
import type {
  DailyByFeaturePayload,
  DailyByModelPayload,
  DailySummaryPayload,
} from "@/lib/llm/types";

const EMPTY_BY_MODEL: DailyByModelPayload = { rows: [] };
const EMPTY_BY_FEATURE: DailyByFeaturePayload = { rows: [] };
const EMPTY_SUMMARY: DailySummaryPayload = { rows: [] };

export async function touchDailyAggregates(store: DataStore): Promise<void> {
  const [byModel, byFeature, summary] = await Promise.all([
    store.read<DailyByModelPayload>("llm-daily-by-model"),
    store.read<DailyByFeaturePayload>("llm-daily-by-feature"),
    store.read<DailySummaryPayload>("llm-daily-summary"),
  ]);

  await Promise.all([
    store.write<DailyByModelPayload>(
      "llm-daily-by-model",
      byModel.data ?? EMPTY_BY_MODEL,
    ),
    store.write<DailyByFeaturePayload>(
      "llm-daily-by-feature",
      byFeature.data ?? EMPTY_BY_FEATURE,
    ),
    store.write<DailySummaryPayload>(
      "llm-daily-summary",
      summary.data ?? EMPTY_SUMMARY,
    ),
  ]);
}
