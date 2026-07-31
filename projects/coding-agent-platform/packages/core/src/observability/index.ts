/** T9 — lightweight OpenTelemetry-shaped traces + metrics */

export interface Span {
  id: string;
  name: string;
  parentId?: string;
  startMs: number;
  endMs?: number;
  status: "ok" | "error" | "unset";
  attributes: Record<string, string | number | boolean>;
  events: { name: string; ts: number; attrs?: Record<string, string> }[];
}

export class TraceCollector {
  spans: Span[] = [];
  private stack: string[] = [];
  private seq = 0;

  startSpan(name: string, attributes: Span["attributes"] = {}): string {
    const id = `span_${++this.seq}`;
    const parentId = this.stack[this.stack.length - 1];
    this.spans.push({
      id,
      name,
      parentId,
      startMs: Date.now(),
      status: "unset",
      attributes,
      events: [],
    });
    this.stack.push(id);
    return id;
  }

  addEvent(name: string, attrs?: Record<string, string>): void {
    const id = this.stack[this.stack.length - 1];
    const span = this.spans.find((s) => s.id === id);
    if (span) span.events.push({ name, ts: Date.now(), attrs });
  }

  endSpan(status: Span["status"] = "ok", attrs?: Span["attributes"]): void {
    const id = this.stack.pop();
    const span = this.spans.find((s) => s.id === id);
    if (!span) return;
    span.endMs = Date.now();
    span.status = status;
    if (attrs) Object.assign(span.attributes, attrs);
  }

  toJSONL(): string {
    return this.spans
      .map((s) =>
        JSON.stringify({
          type: "span",
          ...s,
          durationMs: (s.endMs ?? s.startMs) - s.startMs,
        }),
      )
      .join("\n");
  }
}

export class MetricsRegistry {
  counters = new Map<string, number>();
  histograms = new Map<string, number[]>();

  incr(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  observe(name: string, value: number): void {
    const arr = this.histograms.get(name) ?? [];
    arr.push(value);
    this.histograms.set(name, arr);
  }

  snapshot(): Record<string, unknown> {
    const hist: Record<string, { count: number; sum: number; avg: number }> = {};
    for (const [k, vals] of this.histograms) {
      const sum = vals.reduce((a, b) => a + b, 0);
      hist[k] = { count: vals.length, sum, avg: vals.length ? sum / vals.length : 0 };
    }
    return {
      counters: Object.fromEntries(this.counters),
      histograms: hist,
    };
  }
}
