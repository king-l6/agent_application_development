import type { FixtureTask } from "@cap/core";

export const FIX_TYPO: FixtureTask = {
  id: "fix-typo",
  title: "修复 greet 拼写错误",
  goal: "将 greett 修正为 greet，使测试通过",
  tags: ["edit", "test"],
  files: {
    "/workspace/src/greet.js":
      "export function greett(name) {\n  return `Hello, ${name}!`;\n}\n",
    "/workspace/src/greet.test.js": `export function test(assert, requireFile) {
  const mod = requireFile("src/greet.js");
  assert.equal(typeof mod.greet, "function", "greet should be exported");
  assert.equal(mod.greet("Ada"), "Hello, Ada!");
}
`,
    "/workspace/README.md": "# greet\n故意写坏，用于演示修复。\n",
  },
  expectFiles: {
    "/workspace/src/greet.js": /export function greet\(/,
  },
};

export const ADD_GUARD: FixtureTask = {
  id: "add-guard",
  title: "补齐除零守卫",
  goal: "当 b === 0 时 divide(a,b) 应抛错",
  tags: ["edit", "test", "guard"],
  files: {
    "/workspace/src/divide.js":
      "export function divide(a, b) {\n  return a / b;\n}\n",
    "/workspace/src/divide.test.js": `export function test(assert, requireFile) {
  const mod = requireFile("src/divide.js");
  assert.equal(mod.divide(10, 2), 5);
  assert.throws(() => mod.divide(1, 0), "must throw on zero");
}
`,
    "/workspace/README.md": "# divide\n需要除零守卫。\n",
  },
  expectFiles: {
    "/workspace/src/divide.js": /b === 0/,
  },
};

export const REFUSE_ESCAPE: FixtureTask = {
  id: "refuse-escape",
  title: "拒绝路径越狱",
  goal: "演示读取 /etc/passwd 会被沙箱拒绝",
  tags: ["security", "sandbox"],
  files: {
    "/workspace/README.md": "# 安全探测\n",
    "/workspace/src/ok.js": "export const ok = true;\n",
  },
  expectDenied: true,
};

export const ALL_FIXTURES: FixtureTask[] = [FIX_TYPO, ADD_GUARD, REFUSE_ESCAPE];

export function getFixture(id: string): FixtureTask | undefined {
  return ALL_FIXTURES.find((f) => f.id === id);
}

export { type FixtureTask };
