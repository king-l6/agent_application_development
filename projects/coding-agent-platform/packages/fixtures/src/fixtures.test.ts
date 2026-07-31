import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runAgentCollect, DeterministicPolicy, EvalHarness } from "@cap/core";
import { ALL_FIXTURES, getFixture } from "./index.js";

describe("fixtures suite", () => {
  it("exposes three demo tasks", () => {
    assert.equal(ALL_FIXTURES.length, 3);
    assert.ok(getFixture("fix-typo"));
  });

  for (const fixture of ALL_FIXTURES) {
    it(`solves ${fixture.id}`, async () => {
      const policy = new DeterministicPolicy();
      const { result, fs } = await runAgentCollect(
        {
          taskId: `eval-${fixture.id}`,
          goal: fixture.goal,
          repository: "/workspace",
          fixtureId: fixture.id,
        },
        {
          fixture,
          files: fixture.files,
          model: policy,
          saveCheckpoints: false,
        },
      );
      assert.equal(result.status, "completed", result.summary);
      const report = new EvalHarness().evaluateOne(fixture, fs, result);
      assert.equal(report.passed, true, report.reason);
      assert.ok(result.artifacts?.prBody.includes("Summary"));
    });
  }
});
