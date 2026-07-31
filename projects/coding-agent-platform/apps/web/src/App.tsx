import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layout,
  Menu,
  Button,
  Card,
  Col,
  Row,
  Space,
  Typography,
  Tag,
  Select,
  Input,
  Form,
  Table,
  Checkbox,
  List,
  Statistic,
  Alert,
  Empty,
  Divider,
  Badge,
  App as AntAppHook,
} from "antd";
import {
  MessageOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  PlusOutlined,
  SendOutlined,
  CloudSyncOutlined,
  SaveOutlined,
  PlayCircleOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import {
  api,
  API_BASE,
  type Agent,
  type ChatSession,
  type DocItem,
  type Metrics,
  type TaskDetail,
  type TaskSummary,
} from "./api";

const { Header, Content } = Layout;
const { Title, Paragraph, Text, Link } = Typography;
const { TextArea } = Input;

type Tab = "chat" | "docs" | "workbench" | "tasks" | "eval" | "metrics";

const TAB_ITEMS = [
  { key: "chat", icon: <MessageOutlined />, label: "对话" },
  { key: "docs", icon: <FileTextOutlined />, label: "文档" },
  { key: "workbench", icon: <AppstoreOutlined />, label: "工作台" },
  { key: "tasks", icon: <UnorderedListOutlined />, label: "任务" },
  { key: "eval", icon: <ExperimentOutlined />, label: "评测" },
  { key: "metrics", icon: <BarChartOutlined />, label: "指标" },
];

export function App() {
  const { message } = AntAppHook.useApp();
  const [tab, setTab] = useState<Tab>("chat");
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [evalReport, setEvalReport] = useState<Metrics["latestEval"]>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [docEditing, setDocEditing] = useState<DocItem | null>(null);
  const [wecomForm] = Form.useForm();
  const [wecomConfigured, setWecomConfigured] = useState(false);
  const [docForm] = Form.useForm();

  const agentMap = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, a])),
    [agents],
  );

  const refresh = useCallback(async () => {
    try {
      await api.health();
      setOnline(true);
      setError(null);
      const [a, t, m, e, d, s, w] = await Promise.all([
        api.agents(),
        api.tasks(),
        api.metrics(),
        api.latestEval(),
        api.docs(),
        api.chatSessions(),
        api.wecomStatus(),
      ]);
      setAgents(a.agents);
      setTasks(t.tasks);
      setMetrics(m);
      setEvalReport(e.report);
      setDocs(d.docs);
      setSessions(s.sessions);
      setWecomConfigured(w.configured);
      if (!selectedAgent && a.agents[0]) setSelectedAgent(a.agents[0].id);
    } catch (err) {
      setOnline(false);
      setError(
        err instanceof Error
          ? `${err.message}（请先 pnpm dev，API: ${API_BASE}）`
          : String(err),
      );
    }
  }, [selectedAgent]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!activeTaskId) return;
    let es: EventSource | null = null;
    let cancelled = false;
    async function open() {
      setLiveLines([]);
      try {
        const { task } = await api.task(activeTaskId!);
        if (!cancelled) setDetail(task);
      } catch {
        /* ignore */
      }
      es = new EventSource(api.eventsUrl(activeTaskId!));
      es.addEventListener("agent", (ev) => {
        setLiveLines((prev) => [
          ...prev,
          formatEvent(JSON.parse((ev as MessageEvent).data)),
        ]);
      });
      es.addEventListener("status", async (ev) => {
        const st = JSON.parse((ev as MessageEvent).data) as { status: string };
        const { task } = await api.task(activeTaskId!);
        setDetail(task);
        if (["completed", "failed", "paused"].includes(st.status)) {
          es?.close();
          void refresh();
        }
      });
    }
    void open();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [activeTaskId, refresh]);

  async function loadWecomForm() {
    const { config } = await api.wecomConfig();
    if (config) {
      wecomForm.setFieldsValue({
        corpId: config.corpId,
        corpSecret: config.hasSecret ? "********" : "",
        spaceIds: config.spaceIds.join(", "),
        userid: config.userid,
      });
    }
  }

  async function ensureSession() {
    if (session) return session;
    const { session: s } = await api.createChat({
      agentId: selectedAgent || undefined,
      docIds: selectedDocIds,
    });
    setSession(s);
    setSessions((prev) => [s, ...prev]);
    return s;
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    setBusy(true);
    setChatInput("");
    try {
      const s = await ensureSession();
      const out = await api.sendChat(s.id, {
        content: text,
        agentId: selectedAgent || undefined,
        docIds: selectedDocIds,
      });
      setSession(out.session);
      await refresh();
      if (out.taskId) {
        message.success("已创建编码任务");
        setActiveTaskId(out.taskId);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header className="app-header">
        <div className="brand">
          <div className="brand-mark">智</div>
          智工台
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[tab]}
          items={TAB_ITEMS}
          onClick={({ key }) => {
            setTab(key as Tab);
            if (key === "docs") void loadWecomForm();
          }}
          style={{ flex: 1, minWidth: 0, border: "none" }}
        />
        <div className="header-status">
          <Badge status={online ? "success" : "error"} />
          {online ? "API 已连接" : "API 未连接"}
        </div>
      </Header>

      <Content className="app-content">
        {error && (
          <Alert
            type="error"
            showIcon
            closable
            message={error}
            style={{ marginBottom: 16 }}
            onClose={() => setError(null)}
          />
        )}

        {tab === "chat" && (
          <div className="chat-shell">
            <Card
              title="会话"
              extra={
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={async () => {
                    const { session: s } = await api.createChat({
                      agentId: selectedAgent || undefined,
                      docIds: selectedDocIds,
                    });
                    setSession(s);
                    await refresh();
                  }}
                >
                  新建
                </Button>
              }
            >
              <List
                size="small"
                dataSource={sessions}
                locale={{ emptyText: "暂无会话" }}
                renderItem={(s) => (
                  <List.Item
                    style={{
                      cursor: "pointer",
                      background:
                        session?.id === s.id ? "#f0f0ff" : undefined,
                      borderRadius: 8,
                      paddingInline: 10,
                    }}
                    onClick={() =>
                      void api.chatSession(s.id).then((r) => setSession(r.session))
                    }
                  >
                    <List.Item.Meta
                      title={s.title}
                      description={new Date(s.updatedAt).toLocaleString("zh-CN")}
                    />
                  </List.Item>
                )}
              />
              <Divider />
              <Form layout="vertical" size="middle">
                <Form.Item label="绑定 Agent">
                  <Select
                    value={selectedAgent || undefined}
                    placeholder="选择 Agent"
                    options={agents.map((a) => ({
                      value: a.id,
                      label: a.name,
                    }))}
                    onChange={setSelectedAgent}
                  />
                </Form.Item>
                <Form.Item label="引用文档">
                  <Checkbox.Group
                    style={{ width: "100%" }}
                    value={selectedDocIds}
                    onChange={(v) => setSelectedDocIds(v as string[])}
                  >
                    <Space direction="vertical" style={{ width: "100%" }}>
                      {docs.map((d) => (
                        <Checkbox key={d.id} value={d.id}>
                          {d.title}{" "}
                          <Tag>{d.source === "wecom" ? "企微" : "本地"}</Tag>
                        </Checkbox>
                      ))}
                      {!docs.length && (
                        <Text type="secondary">暂无文档，先去「文档」同步</Text>
                      )}
                    </Space>
                  </Checkbox.Group>
                </Form.Item>
              </Form>
            </Card>

            <Card
              title="对话"
              styles={{ body: { display: "flex", flexDirection: "column", gap: 12 } }}
            >
              <div className="chat-messages">
                {(session?.messages ?? []).map((m) => (
                  <div key={m.id} className={`msg ${m.role}`}>
                    <div className="role">
                      {m.role === "user" ? "你" : "智工台助手"}
                    </div>
                    {m.content}
                    {m.meta?.taskId && (
                      <div style={{ marginTop: 8 }}>
                        <Button
                          size="small"
                          onClick={() => {
                            setActiveTaskId(m.meta!.taskId!);
                            setTab("tasks");
                          }}
                        >
                          查看任务
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {!session && (
                  <Empty description="新建或选择会话后开始对话" />
                )}
              </div>
              <Space.Compact style={{ width: "100%" }}>
                <TextArea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="输入问题；或「运行编码修复 / 边界守卫 / 越狱审计」"
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={busy}
                  disabled={!online}
                  onClick={() => void sendChat()}
                  style={{ height: "auto" }}
                >
                  发送
                </Button>
              </Space.Compact>
            </Card>
          </div>
        )}

        {tab === "docs" && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card>
              <Title level={4} style={{ marginTop: 0 }}>
                文档管理
              </Title>
              <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                本地文档可编辑；企微通过微盘 API（wedrive/file_list）拉取你有权限的空间文件。
                应用需开通微盘权限，并填写 spaceId。详见 docs/wecom-setup.md。
              </Paragraph>
              <Tag color={wecomConfigured ? "success" : "error"}>
                {wecomConfigured ? "企微已配置" : "企微未配置"}
              </Tag>
            </Card>

            <Row gutter={16}>
              <Col xs={24} lg={10}>
                <Card title="企微连接" extra={<ApiOutlined />}>
                  <Form
                    form={wecomForm}
                    layout="vertical"
                    requiredMark="optional"
                    onFinish={async (values) => {
                      setBusy(true);
                      try {
                        await api.saveWecomConfig({
                          corpId: String(values.corpId).trim(),
                          corpSecret: String(values.corpSecret),
                          spaceIds: String(values.spaceIds || "")
                            .split(/[,，\s]+/)
                            .map((s) => s.trim())
                            .filter(Boolean),
                          userid: values.userid
                            ? String(values.userid).trim()
                            : undefined,
                        });
                        message.success("配置已保存");
                        await refresh();
                      } catch (err) {
                        message.error(
                          err instanceof Error ? err.message : String(err),
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Form.Item
                      name="corpId"
                      label="CorpId"
                      rules={[{ required: true, message: "请输入企业 ID" }]}
                    >
                      <Input placeholder="企业 ID，如 wwxxxx" allowClear />
                    </Form.Item>
                    <Form.Item
                      name="corpSecret"
                      label="CorpSecret"
                      rules={[{ required: true, message: "请输入应用 Secret" }]}
                      extra="已保存过可保持 ******** 不改"
                    >
                      <Input.Password placeholder="应用凭证密钥" />
                    </Form.Item>
                    <Form.Item
                      name="spaceIds"
                      label="微盘 SpaceId"
                      rules={[{ required: true, message: "请填写至少一个 spaceId" }]}
                      extra="多个用逗号分隔，填你有权限的空间"
                    >
                      <Input placeholder="spaceid1, spaceid2" allowClear />
                    </Form.Item>
                    <Form.Item name="userid" label="UserId">
                      <Input placeholder="可选" allowClear />
                    </Form.Item>
                    <Space wrap>
                      <Button
                        type="default"
                        icon={<SaveOutlined />}
                        htmlType="submit"
                        loading={busy}
                      >
                        保存配置
                      </Button>
                      <Button
                        type="primary"
                        icon={<CloudSyncOutlined />}
                        loading={busy}
                        onClick={async () => {
                          try {
                            const values = await wecomForm.validateFields();
                            setBusy(true);
                            await api.saveWecomConfig({
                              corpId: String(values.corpId).trim(),
                              corpSecret: String(values.corpSecret),
                              spaceIds: String(values.spaceIds || "")
                                .split(/[,，\s]+/)
                                .map((s) => s.trim())
                                .filter(Boolean),
                              userid: values.userid
                                ? String(values.userid).trim()
                                : undefined,
                            });
                            const { result } = await api.syncWecom();
                            message.success(
                              `同步完成：新增 ${result.imported}，更新 ${result.updated}`,
                            );
                            if (result.errors.length) {
                              message.warning(result.errors.join("；"));
                            }
                            await refresh();
                          } catch (err) {
                            if (err && typeof err === "object" && "errorFields" in err) {
                              return;
                            }
                            message.error(
                              err instanceof Error ? err.message : String(err),
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        从企微拉取
                      </Button>
                    </Space>
                  </Form>
                </Card>
              </Col>

              <Col xs={24} lg={14}>
                <Card
                  title={`文档库（${docs.length}）`}
                  extra={
                    <Button
                      icon={<PlusOutlined />}
                      onClick={async () => {
                        const { doc } = await api.createDoc(
                          "未命名文档",
                          "在此编写内容…",
                        );
                        setDocEditing(doc);
                        docForm.setFieldsValue({
                          title: doc.title,
                          content: doc.content,
                        });
                        await refresh();
                      }}
                    >
                      新建本地文档
                    </Button>
                  }
                >
                  <Table
                    size="middle"
                    rowKey="id"
                    pagination={{ pageSize: 8 }}
                    dataSource={docs}
                    columns={[
                      { title: "标题", dataIndex: "title" },
                      {
                        title: "来源",
                        dataIndex: "source",
                        width: 100,
                        render: (v: string) => (
                          <Tag color={v === "wecom" ? "purple" : "blue"}>
                            {v === "wecom" ? "企微" : "本地"}
                          </Tag>
                        ),
                      },
                      {
                        title: "操作",
                        width: 160,
                        render: (_, d) => (
                          <Space>
                            <Button
                              type="link"
                              onClick={() => {
                                setDocEditing(d);
                                docForm.setFieldsValue({
                                  title: d.title,
                                  content: d.content,
                                });
                              }}
                            >
                              打开
                            </Button>
                            <Button
                              type="link"
                              danger
                              onClick={async () => {
                                await api.deleteDoc(d.id);
                                if (docEditing?.id === d.id) setDocEditing(null);
                                message.success("已删除");
                                await refresh();
                              }}
                            >
                              删除
                            </Button>
                          </Space>
                        ),
                      },
                    ]}
                  />

                  {docEditing && (
                    <>
                      <Divider />
                      <Form
                        form={docForm}
                        layout="vertical"
                        onFinish={async (values) => {
                          await api.updateDoc(docEditing.id, {
                            title: values.title,
                            content: values.content,
                          });
                          message.success("文档已保存");
                          setDocEditing(null);
                          await refresh();
                        }}
                      >
                        <Form.Item
                          name="title"
                          label="标题"
                          rules={[{ required: true }]}
                        >
                          <Input />
                        </Form.Item>
                        <Form.Item name="content" label="正文">
                          <TextArea rows={10} showCount />
                        </Form.Item>
                        {docEditing.url && (
                          <Paragraph>
                            企微链接：
                            <Link href={docEditing.url} target="_blank">
                              {docEditing.url}
                            </Link>
                          </Paragraph>
                        )}
                        <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                          保存文档
                        </Button>
                      </Form>
                    </>
                  )}
                </Card>
              </Col>
            </Row>
          </Space>
        )}

        {tab === "workbench" && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card>
              <Title level={4} style={{ marginTop: 0 }}>
                工作台
              </Title>
              <Paragraph type="secondary">
                选择 Agent 直接创建编码任务；对话里也可以触发同样的 Harness。
              </Paragraph>
            </Card>
            <Row gutter={16}>
              <Col span={6}>
                <Card>
                  <Statistic title="任务" value={metrics?.totals.tasks ?? 0} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="成功率"
                    value={Math.round((metrics?.totals.successRate ?? 0) * 100)}
                    suffix="%"
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="文档" value={docs.length} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="评测通过率"
                    value={
                      evalReport
                        ? Math.round(evalReport.passRate * 100)
                        : undefined
                    }
                    suffix={evalReport ? "%" : undefined}
                    formatter={(v) => (v === undefined ? "未跑" : v)}
                  />
                </Card>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} md={10}>
                <Card title="Agent">
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {agents.map((a) => (
                      <Card
                        key={a.id}
                        size="small"
                        hoverable
                        type={selectedAgent === a.id ? "inner" : undefined}
                        style={{
                          borderColor:
                            selectedAgent === a.id ? "#5b5bd6" : undefined,
                        }}
                        onClick={() => setSelectedAgent(a.id)}
                      >
                        <Text strong>{a.name}</Text>
                        <Paragraph
                          type="secondary"
                          style={{ marginBottom: 0, marginTop: 4 }}
                        >
                          {a.description}
                        </Paragraph>
                      </Card>
                    ))}
                    <Button
                      type="primary"
                      block
                      icon={<PlayCircleOutlined />}
                      loading={busy}
                      disabled={!online || !selectedAgent}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const { task } = await api.createTask(selectedAgent);
                          setActiveTaskId(task.id);
                          setTab("tasks");
                          message.success("任务已创建");
                          await refresh();
                        } catch (err) {
                          message.error(
                            err instanceof Error ? err.message : String(err),
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      创建并运行任务
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={14}>
                <Card title="最近任务">
                  <Table
                    size="middle"
                    rowKey="id"
                    pagination={false}
                    dataSource={tasks.slice(0, 8)}
                    onRow={(t) => ({
                      onClick: () => {
                        setActiveTaskId(t.id);
                        setTab("tasks");
                      },
                      style: { cursor: "pointer" },
                    })}
                    columns={[
                      {
                        title: "Agent",
                        render: (_, t) => agentMap[t.agentId]?.name ?? t.agentId,
                      },
                      {
                        title: "状态",
                        dataIndex: "status",
                        render: (s: string) => <StatusTag status={s} />,
                      },
                      {
                        title: "摘要",
                        render: (_, t) => t.summary ?? t.goal,
                        ellipsis: true,
                      },
                    ]}
                  />
                </Card>
              </Col>
            </Row>
          </Space>
        )}

        {tab === "tasks" && (
          <Row gutter={16}>
            <Col xs={24} md={9}>
              <Card title="任务列表">
                <Table
                  size="middle"
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  dataSource={tasks}
                  rowClassName={(t) =>
                    activeTaskId === t.id ? "ant-table-row-selected" : ""
                  }
                  onRow={(t) => ({
                    onClick: () => setActiveTaskId(t.id),
                    style: { cursor: "pointer" },
                  })}
                  columns={[
                    {
                      title: "Agent",
                      render: (_, t) => (
                        <div>
                          <div>{agentMap[t.agentId]?.name}</div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t.id}
                          </Text>
                        </div>
                      ),
                    },
                    {
                      title: "状态",
                      dataIndex: "status",
                      width: 90,
                      render: (s: string) => <StatusTag status={s} />,
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} md={15}>
              <Card title="任务详情">
                {!activeTaskId ? (
                  <Empty description="选择任务查看事件流" />
                ) : (
                  <Space direction="vertical" style={{ width: "100%" }} size={12}>
                    <Space>
                      <StatusTag status={detail?.status ?? "—"} />
                      <Text type="secondary">{detail?.goal}</Text>
                    </Space>
                    <div className="mono-panel">
                      {liveLines.length ? liveLines.join("\n") : "等待事件…"}
                    </div>
                  </Space>
                )}
              </Card>
            </Col>
          </Row>
        )}

        {tab === "eval" && (
          <Card
            title="固定任务评测"
            extra={
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const { report } = await api.runEval();
                    setEvalReport(report);
                    message.success(
                      `评测完成，通过率 ${Math.round(report.passRate * 100)}%`,
                    );
                    await refresh();
                  } catch (err) {
                    message.error(
                      err instanceof Error ? err.message : String(err),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                运行评测
              </Button>
            }
          >
            {!evalReport ? (
              <Empty description="尚未产生评测报告" />
            ) : (
              <Table
                rowKey="taskId"
                dataSource={evalReport.results}
                columns={[
                  { title: "任务", dataIndex: "taskId" },
                  {
                    title: "结果",
                    dataIndex: "passed",
                    render: (v: boolean) => (
                      <Tag color={v ? "success" : "error"}>
                        {v ? "通过" : "失败"}
                      </Tag>
                    ),
                  },
                  { title: "延迟", dataIndex: "latencyMs", render: (v) => `${v}ms` },
                  { title: "原因", dataIndex: "reason" },
                ]}
              />
            )}
          </Card>
        )}

        {tab === "metrics" && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={16}>
              <Col span={8}>
                <Card>
                  <Statistic title="完成" value={metrics?.totals.completed ?? 0} />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic title="失败" value={metrics?.totals.failed ?? 0} />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="工具调用"
                    value={metrics?.totals.toolCalls ?? 0}
                  />
                </Card>
              </Col>
            </Row>
            <Card title="按 Agent 聚合">
              <Table
                rowKey="id"
                pagination={false}
                dataSource={Object.entries(metrics?.byAgent ?? {}).map(
                  ([id, row]) => ({ id, ...row }),
                )}
                columns={[
                  {
                    title: "Agent",
                    dataIndex: "id",
                    render: (id: string) => agentMap[id]?.name ?? id,
                  },
                  { title: "运行次数", dataIndex: "runs" },
                  { title: "成功", dataIndex: "success" },
                  { title: "工具调用", dataIndex: "toolCalls" },
                ]}
              />
            </Card>
          </Space>
        )}
      </Content>
    </Layout>
  );
}

function StatusTag({ status }: { status: string }) {
  const map: Record<string, { color: string; text: string }> = {
    completed: { color: "success", text: "成功" },
    failed: { color: "error", text: "失败" },
    running: { color: "processing", text: "运行中" },
    queued: { color: "default", text: "排队" },
    paused: { color: "warning", text: "暂停" },
  };
  const m = map[status] ?? { color: "default", text: status };
  return <Tag color={m.color}>{m.text}</Tag>;
}

function formatEvent(e: { type: string; [k: string]: unknown }): string {
  switch (e.type) {
    case "session.start":
      return `会话开始 · ${e.taskId}`;
    case "state.changed":
      return `状态 ${e.from} → ${e.to}`;
    case "tool.call":
      return `调用 ${e.name}`;
    case "tool.result":
      return `结果 ${e.name} ${e.ok ? "成功" : "失败"}`;
    case "gate.decision":
      return `门禁 ${e.allow ? "通过" : "拒绝"} · ${e.reason}`;
    case "session.complete":
      return "结束";
    default:
      return e.type;
  }
}
