"""课程实验台（Playground）—— 通用的「学过即可测」模块系统。

与 guardrails 的 pass/fail 适配器并存，支持任意输出形状。
"""
from playground.base import PlaygroundModule, ModuleResult
from playground.registry import registry
