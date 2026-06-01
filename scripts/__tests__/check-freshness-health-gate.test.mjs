import { once } from "node:events";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);

function json(res, body) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("check-freshness fails when soft health is degraded despite green freshness state", async () => {
  const server = await startServer((req, res) => {
    if (req.url === "/api/health?soft=1") {
      json(res, {
        status: "ok",
        sourceStatus: "ok",
        workerStatus: "degraded",
      });
      return;
    }

    if (req.url === "/api/cron/freshness/state") {
      json(res, {
        checkedAt: "2026-06-01T00:00:00.000Z",
        sources: [
          {
            name: "trending",
            lastUpdate: "2026-06-01T00:00:00.000Z",
            freshnessBudget: "1h",
            ageMs: 1000,
            status: "GREEN",
            blocking: true,
          },
        ],
        disabledSources: [],
        summary: {
          green: 1,
          yellow: 0,
          red: 0,
          dead: 0,
          disabled: 0,
        },
      });
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  try {
    await assert.rejects(
      () =>
        execFileAsync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/check-freshness.mts",
            "--base-url",
            server.baseUrl,
            "--json",
            "--timeout-ms",
            "1000",
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              CRON_SECRET: "",
              SENTRY_DSN: "",
            },
          },
        ),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /"exitCode": 1/);
        assert.match(error.stdout, /"workerStatus": "degraded"/);
        return true;
      },
    );
  } finally {
    await server.close();
  }
});

test("check-freshness fails when soft health omits workerStatus", async () => {
  const server = await startServer((req, res) => {
    if (req.url === "/api/health?soft=1") {
      json(res, {
        status: "ok",
        sourceStatus: "ok",
      });
      return;
    }

    if (req.url === "/api/cron/freshness/state") {
      json(res, {
        checkedAt: "2026-06-01T00:00:00.000Z",
        sources: [
          {
            name: "trending",
            lastUpdate: "2026-06-01T00:00:00.000Z",
            freshnessBudget: "1h",
            ageMs: 1000,
            status: "GREEN",
            blocking: true,
          },
        ],
        disabledSources: [],
        summary: {
          green: 1,
          yellow: 0,
          red: 0,
          dead: 0,
          disabled: 0,
        },
      });
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  try {
    await assert.rejects(
      () =>
        execFileAsync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/check-freshness.mts",
            "--base-url",
            server.baseUrl,
            "--json",
            "--timeout-ms",
            "1000",
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              CRON_SECRET: "",
              SENTRY_DSN: "",
            },
          },
        ),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /"exitCode": 1/);
        assert.match(error.stdout, /"sourceStatus": "ok"/);
        return true;
      },
    );
  } finally {
    await server.close();
  }
});
