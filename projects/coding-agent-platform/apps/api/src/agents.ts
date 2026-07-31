/** 可注册到平台的真实 Agent（全部可执行） */

import { ALL_FIXTURES, getFixture } from "@cap/fixtures";

export interface PlatformAgent {
  id: string;
  name: string;
  description: string;
  fixtureId: string;
  category: string;
  tags: string[];
  capabilities: string[];
}

const META: Record<
  string,
  Omit<PlatformAgent, "id" | "fixtureId"> & { fixtureId: string }
> = {
  "fix-typo": {
    fixtureId: "fix-typo",
    name: "编码修复 Agent",
    description:
      "在隔离工作区中搜索缺陷、编辑文件并运行测试。当前策略：确定性修复 greet 拼写错误。",
    category: "编码",
    tags: ["read", "edit", "test"],
    capabilities: ["search", "edit_file", "run_tests", "path_jail"],
  },
  "add-guard": {
    fixtureId: "add-guard",
    name: "边界守卫 Agent",
    description:
      "为危险路径补齐运行时守卫（除零），通过固定测试验证正确性。",
    category: "编码",
    tags: ["edit", "test", "guard"],
    capabilities: ["read_file", "edit_file", "run_tests"],
  },
  "refuse-escape": {
    fixtureId: "refuse-escape",
    name: "路径越狱审计 Agent",
    description:
      "主动请求读取工作区外路径，验证 Path Jail / 门禁是否拒绝并写入 Trace。",
    category: "安全",
    tags: ["security", "sandbox"],
    capabilities: ["path_jail", "gate_chain", "trace"],
  },
};

export function listAgents(): PlatformAgent[] {
  return ALL_FIXTURES.map((f) => {
    const m = META[f.id];
    return {
      id: f.id,
      fixtureId: f.id,
      name: m?.name ?? f.title,
      description: m?.description ?? f.goal,
      category: m?.category ?? "编码",
      tags: m?.tags ?? f.tags ?? [],
      capabilities: m?.capabilities ?? [],
    };
  });
}

export function getAgent(id: string): PlatformAgent | undefined {
  return listAgents().find((a) => a.id === id || a.fixtureId === id);
}

export function resolveFixture(agentId: string) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  return getFixture(agent.fixtureId) ?? null;
}
