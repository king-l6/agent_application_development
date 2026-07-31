/** T15 — delivery artifacts: diff, tests, trace, PR-shaped body */

import type { DeliveryArtifacts, TaskResult } from "../contracts/index.js";
import type { EvalReport } from "../eval/index.js";

export function buildArtifacts(opts: {
  result: TaskResult;
  diffs: { path: string; before: string; after: string }[];
  testEvidence: string;
  traceJsonl: string;
  evalReport?: EvalReport;
}): DeliveryArtifacts {
  const { result, diffs, testEvidence, traceJsonl, evalReport } = opts;
  const diffSummary =
    diffs.length === 0
      ? "(no file changes)"
      : diffs
          .map((d) => {
            const lines = [
              `--- a${d.path}`,
              `+++ b${d.path}`,
              `@@ changed @@`,
              ...d.before.split("\n").map((l) => `- ${l}`),
              ...d.after.split("\n").map((l) => `+ ${l}`),
            ];
            return lines.join("\n");
          })
          .join("\n\n");

  const evalSnippet = evalReport
    ? `passRate=${(evalReport.passRate * 100).toFixed(0)}% cases=${evalReport.results.length}`
    : undefined;

  const prBody = [
    `## Summary`,
    result.summary,
    ``,
    `## Status`,
    `- task: \`${result.taskId}\``,
    `- status: **${result.status}**`,
    `- steps: ${result.stepsCompleted}, tools: ${result.toolCalls}`,
    `- duration: ${result.durationMs}ms, cost: $${result.costUsd.toFixed(4)}`,
    ``,
    `## Test evidence`,
    "```",
    testEvidence || "(none)",
    "```",
    ``,
    `## Diff`,
    "```diff",
    diffSummary.slice(0, 6_000),
    "```",
    evalSnippet ? `\n## Eval\n${evalSnippet}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    diffSummary,
    testEvidence,
    traceJsonl,
    evalSnippet,
    prBody,
  };
}

export function downloadableArtifactJson(artifacts: DeliveryArtifacts): string {
  return JSON.stringify(artifacts, null, 2);
}
