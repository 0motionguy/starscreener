// Tests for parseYahooCandles in src/lib/ai-stocks.ts.
//
// Yahoo's v8 chart arrays are null-padded on halted/partial sessions; the
// parser must skip incomplete rows, convert unix seconds → ISO days (UTC),
// and cap output at maxCandles keeping the most recent rows. The chart's
// honest-data contract depends on this: a null row must vanish, never
// become a zero-priced candle.

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseYahooCandles } from "../ai-stocks";

const DAY = 86_400;
const T0 = Date.UTC(2026, 5, 1) / 1000; // 2026-06-01T00:00:00Z

test("parses complete rows and skips null-padded ones", () => {
  const ts = [T0, T0 + DAY, T0 + 2 * DAY];
  const quote = {
    open: [10, null, 12],
    high: [11, 13, 14],
    low: [9, 10, 11],
    close: [10.5, 12.5, 13.5],
  };
  const candles = parseYahooCandles(ts, quote);
  assert.equal(candles.length, 2);
  assert.deepEqual(candles[0], {
    day: "2026-06-01",
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
  });
  assert.deepEqual(candles[1], {
    day: "2026-06-03",
    open: 12,
    high: 14,
    low: 11,
    close: 13.5,
  });
});

test("caps at maxCandles keeping the most recent rows", () => {
  const n = 10;
  const ts = Array.from({ length: n }, (_, i) => T0 + i * DAY);
  const arr = Array.from({ length: n }, (_, i) => 100 + i);
  const candles = parseYahooCandles(
    ts,
    { open: arr, high: arr, low: arr, close: arr },
    4,
  );
  assert.equal(candles.length, 4);
  assert.equal(candles[0].open, 106);
  assert.equal(candles[3].day, "2026-06-10");
});

test("empty and malformed inputs return []", () => {
  assert.deepEqual(parseYahooCandles(undefined, undefined), []);
  assert.deepEqual(parseYahooCandles([], {}), []);
  // close array missing entirely → no fabricated rows
  assert.deepEqual(
    parseYahooCandles([T0], { open: [1], high: [2], low: [0.5] }),
    [],
  );
});

test("non-finite values are skipped, not coerced", () => {
  const ts = [T0, T0 + DAY];
  const quote = {
    open: [10, Number.NaN],
    high: [11, 12],
    low: [9, 10],
    close: [10.5, 11.5],
  };
  const candles = parseYahooCandles(ts, quote);
  assert.equal(candles.length, 1);
  assert.equal(candles[0].day, "2026-06-01");
});
