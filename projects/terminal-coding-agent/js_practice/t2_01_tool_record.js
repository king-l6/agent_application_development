/**
 * T2.1 — 本小节范围的【完整翻译】（含函数体；不是整份 main.py）
 *
 * 对应文件：
 *   phases/19-capstone-projects/21-tool-registry-schema-validation/code/main.py
 *
 * 本小节只覆盖「工具名片 + 注册进表」：
 *   - PRIMITIVE_TYPE_MAP / ALLOWED_KEYWORDS （register 前检查 schema 要用）
 *   - ValidationError / Ok / ToolRecord
 *   - ToolRegistry.__init__ / register / get / names
 *   - validate_schema_shape
 *
 * 明确不含（下一小节再译）：
 *   - ToolRegistry.validate
 *   - _walk / _path / _type_matches / _check_string / _check_object / _check_array
 *   - _demo
 *
 * 左开本文件，右开 main.py 上述符号。
 */

// = py: PRIMITIVE_TYPE_MAP（约 20–28 行）
export const PRIMITIVE_TYPE_MAP = {
  string: ["string"],
  integer: ["integer"],
  number: ["number"],
  boolean: ["boolean"],
  object: ["object"],
  array: ["array"],
  null: ["null"],
};

// = py: ALLOWED_KEYWORDS（约 30–33 行）
export const ALLOWED_KEYWORDS = new Set([
  "type", "properties", "required", "enum",
  "minLength", "maxLength", "pattern", "items", "description",
]);

/** = py: ValidationError（约 36–43 行） */
export class ValidationError {
  constructor(path, keyword, message) {
    this.path = path;
    this.keyword = keyword;
    this.message = message;
  }
  /** = py: def to_dict(self) */
  toDict() {
    return { path: this.path, keyword: this.keyword, message: this.message };
  }
}

/** = py: class Ok: pass（约 46–48 行）——留给下一节 validate 返回值用，先放着 */
export class Ok {}

/** = py: ToolRecord（约 51–58 行）——一张工具名片（字段定义；逻辑在 register） */
export class ToolRecord {
  constructor({ name, description, schema, handler, idempotent = false, timeoutMs = 30_000 }) {
    this.name = name;
    this.description = description;
    this.schema = schema;
    this.handler = handler;
    this.idempotent = idempotent;
    this.timeoutMs = timeoutMs; // = py: timeout_ms
  }
}

/**
 * = py: class ToolRegistry（本节只译 __init__ / register / get / names）
 * validate() 下一节再译。
 */
export class ToolRegistry {
  // = py: _NAME_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$")
  static _NAME_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

  /** = py: def __init__(self) -> None: */
  constructor() {
    this._records = {}; // = py: self._records: dict[str, ToolRecord] = {}
    this._order = []; // = py: self._order: list[str] = []
  }

  /**
   * 注册工具：检查名字 → 防重复 → 检查 schema 形状 → 写入表
   * = py: def register(self, name, schema, handler, description="", idempotent=False, timeout_ms=30000, override=False) -> ToolRecord
   */
  register(
    name,
    schema,
    handler,
    description = "",
    idempotent = false,
    timeoutMs = 30_000,
    override = false,
  ) {
    // = py: if not self._NAME_RE.match(name):
    if (!ToolRegistry._NAME_RE.test(name)) {
      // = py: raise ValueError(f"tool name {name!r} must match {self._NAME_RE.pattern}")
      throw new Error(`tool name '${name}' must match ${ToolRegistry._NAME_RE}`);
    }

    // = py: if name in self._records and not override:
    if (Object.prototype.hasOwnProperty.call(this._records, name) && !override) {
      // = py: raise ValueError(f"tool {name!r} already registered; pass override=True to replace")
      throw new Error(`tool '${name}' already registered; pass override=True to replace`);
    }

    // = py: validate_schema_shape(schema)
    validateSchemaShape(schema);

    // = py: rec = ToolRecord(name=..., description=..., schema=..., handler=..., idempotent=..., timeout_ms=...)
    const rec = new ToolRecord({
      name,
      description,
      schema,
      handler,
      idempotent,
      timeoutMs,
    });

    // = py: if name not in self._records: self._order.append(name)
    if (!Object.prototype.hasOwnProperty.call(this._records, name)) {
      this._order.push(name);
    }

    // = py: self._records[name] = rec
    this._records[name] = rec;

    // = py: return rec
    return rec;
  }

  /**
   * = py: def get(self, name: str) -> ToolRecord
   */
  get(name) {
    // = py: if name not in self._records:
    if (!Object.prototype.hasOwnProperty.call(this._records, name)) {
      // = py: raise KeyError(f"unknown tool {name!r}")
      throw new Error(`unknown tool '${name}'`);
    }
    // = py: return self._records[name]
    return this._records[name];
  }

  /**
   * = py: def names(self) -> list[str]
   */
  names() {
    // = py: return list(self._order)
    return [...this._order];
  }
}

/**
 * 注册前检查「schema 自己」合不合法（不是检查调用参数）
 * = py: def validate_schema_shape(schema: dict) -> None:  （约 111–151 行，全文）
 */
export function validateSchemaShape(schema) {
  // = py: if not isinstance(schema, dict):
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new Error("schema must be a dict");
  }

  // = py: unknown = set(schema.keys()) - ALLOWED_KEYWORDS
  const unknown = Object.keys(schema).filter((k) => !ALLOWED_KEYWORDS.has(k));
  if (unknown.length > 0) {
    // = py: raise ValueError(f"unsupported schema keywords: {sorted(unknown)}")
    throw new Error(`unsupported schema keywords: ${unknown.slice().sort()}`);
  }

  const t = schema.type; // = py: schema.get("type")
  if (t !== undefined && !(t in PRIMITIVE_TYPE_MAP)) {
    throw new Error(`unsupported type: '${t}'`);
  }

  const enumVals = schema.enum;
  if (enumVals !== undefined && !Array.isArray(enumVals)) {
    throw new Error("enum must be a list");
  }

  const minLen = schema.minLength;
  if (minLen !== undefined) {
    if (!Number.isInteger(minLen) || minLen < 0) {
      throw new Error("minLength must be a non-negative integer");
    }
  }

  const maxLen = schema.maxLength;
  if (maxLen !== undefined) {
    if (!Number.isInteger(maxLen) || maxLen < 0) {
      throw new Error("maxLength must be a non-negative integer");
    }
  }

  if (minLen !== undefined && maxLen !== undefined && minLen > maxLen) {
    throw new Error("minLength cannot be greater than maxLength");
  }

  const pattern = schema.pattern;
  if (pattern !== undefined && typeof pattern !== "string") {
    throw new Error("pattern must be a string");
  }

  const props = schema.properties;
  if (props !== undefined) {
    if (typeof props !== "object" || props === null || Array.isArray(props)) {
      throw new Error("properties must be a dict");
    }
    for (const [pname, psub] of Object.entries(props)) {
      if (typeof pname !== "string") {
        throw new Error("property names must be strings");
      }
      // = py: validate_schema_shape(psub)
      validateSchemaShape(psub);
    }
  }

  const items = schema.items;
  if (items !== undefined) {
    validateSchemaShape(items);
  }

  const req = schema.required;
  if (req !== undefined) {
    if (!Array.isArray(req) || !req.every((x) => typeof x === "string")) {
      throw new Error("required must be list[str]");
    }
  }
}
