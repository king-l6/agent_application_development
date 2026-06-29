"""Playground 模块注册表。

集中注册所有 PlaygroundModule，提供：
  - list_grouped()  按 phase 分组的模块清单（含 input_schema），驱动前端左侧导航
  - run(name, inputs) 按 name 执行模块

新增一节课的实验模块时，只需：
  1. 在 modules/ 下新建一个模块文件
  2. 在下面 _MODULES 列表里加一行
前端无需改动。
"""
from playground.base import PlaygroundModule, ModuleResult
from playground.modules.phase_summary import PhaseSummary
from playground.modules.embedding_similarity import EmbeddingSimilarity
from playground.modules.lesson_search import LessonSearch
from playground.modules.cost_estimator import CostEstimator
from playground.modules.prompt_analyzer import PromptAnalyzer
from playground.modules.cot_prompt_builder import CotPromptBuilder
from playground.modules.json_validator import JsonValidator
from playground.modules.context_budget_planner import ContextBudgetPlanner
from playground.modules.function_call_simulator import FunctionCallSimulator
from playground.modules.cache_friendliness import CacheFriendliness
from playground.modules.langgraph_simulator import LangGraphSimulator
from playground.modules.checkpoint_viewer import CheckpointViewer
from playground.modules.framework_picker import FrameworkPicker
from playground.modules.react_loop_tracer import ReactLoopTracer


# phase 显示名与图标
_PHASE_META = {
    "00-navigation": {"label": "课程导航", "icon": "🧭"},
    "11-llm-engineering": {"label": "Phase 11 · LLM 工程", "icon": "🧪"},
    "14-agent-engineering": {"label": "Phase 14 · Agent 工程", "icon": "🤖"},
}


class Registry:
    def __init__(self):
        self._modules = {}

    def register(self, module: PlaygroundModule):
        self._modules[module.name] = module

    def get(self, name: str):
        return self._modules.get(name)

    def run(self, name: str, inputs: dict) -> dict:
        mod = self.get(name)
        if mod is None:
            return ModuleResult(ok=False, error=f"未找到模块: {name}").to_dict()
        try:
            return mod.run(inputs or {}).to_dict()
        except Exception as e:
            return ModuleResult(ok=False, error=f"执行出错: {e}").to_dict()

    def list_grouped(self) -> list:
        """按 phase 分组返回，供前端渲染导航树。"""
        from collections import defaultdict
        groups = defaultdict(list)
        for mod in self._modules.values():
            groups[mod.phase].append(mod.meta())

        result = []
        for phase in sorted(groups.keys()):
            meta = _PHASE_META.get(phase, {"label": phase, "icon": "📦"})
            modules = sorted(groups[phase], key=lambda m: (m["order"], m["name"]))
            result.append({
                "phase": phase,
                "label": meta["label"],
                "icon": meta["icon"],
                "modules": modules,
            })
        return result


# ──── 注册所有模块 ────────────────────────────────────────────────
registry = Registry()
_MODULES = [
    PhaseSummary(),
    EmbeddingSimilarity(),
    LessonSearch(),
    CostEstimator(),
    PromptAnalyzer(),
    CotPromptBuilder(),
    JsonValidator(),
    ContextBudgetPlanner(),
    FunctionCallSimulator(),
    CacheFriendliness(),
    LangGraphSimulator(),
    CheckpointViewer(),
    FrameworkPicker(),
    ReactLoopTracer(),
]
for _m in _MODULES:
    registry.register(_m)
