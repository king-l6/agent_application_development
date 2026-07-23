"""演示 AgentError 如何把失败信息组织成稳定的数据结构。"""

from terminal_agent.contracts import AgentError, ErrorCode


# 请求内容有问题：修改请求后可以重新提交，但当前请求不应原样重试。
invalid_request_error = AgentError(
    code=ErrorCode.INVALID_REQUEST,
    message="goal must not be blank",
    details={"field": "goal"},
)

# 服务暂时不可用：请求本身没问题，稍后可以自动重试。
temporary_internal_error = AgentError(
    code=ErrorCode.INTERNAL_ERROR,
    message="model service is temporarily unavailable",
    retryable=True,
    details={"service": "model"},
)

print(invalid_request_error.to_dict())
print(temporary_internal_error.to_dict())
