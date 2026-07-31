/** T2 — tool registry + JSON Schema subset validation */

export interface ValidationError {
  path: string;
  keyword: string;
  message: string;
}

export type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: Schema;
  description?: string;
  additionalProperties?: boolean;
};

const PRIMITIVE_TYPE_MAP: Record<string, string[]> = {
  string: ["string"],
  integer: ["integer"],
  number: ["number", "integer"],
  boolean: ["boolean"],
  object: ["object"],
  array: ["array"],
  null: ["null"],
};

const ALLOWED_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "enum",
  "minLength",
  "maxLength",
  "pattern",
  "items",
  "description",
  "additionalProperties",
]);

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<ToolResult> | ToolResult;

export interface ToolResult {
  ok: boolean;
  output: string;
  truncated?: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ToolRecord {
  name: string;
  description: string;
  parameters: Schema;
  handler: ToolHandler;
}

export function validateSchemaShape(
  schema: Schema,
  path = "$",
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of Object.keys(schema)) {
    if (!ALLOWED_KEYWORDS.has(key)) {
      errors.push({
        path,
        keyword: "additionalProperties",
        message: `unsupported keyword "${key}"`,
      });
    }
  }
  if (schema.properties) {
    for (const [k, child] of Object.entries(schema.properties)) {
      errors.push(...validateSchemaShape(child, `${path}.${k}`));
    }
  }
  if (schema.items) {
    errors.push(...validateSchemaShape(schema.items, `${path}.items`));
  }
  return errors;
}

function jsType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(expected: string | string[] | undefined, actual: string): boolean {
  if (!expected) return true;
  const list = Array.isArray(expected) ? expected : [expected];
  return list.some((t) => (PRIMITIVE_TYPE_MAP[t] ?? [t]).includes(actual));
}

export function validateArgs(
  schema: Schema,
  args: unknown,
  path = "$",
): ValidationError[] {
  const errors: ValidationError[] = [];
  const actual = jsType(args);
  if (!typeMatches(schema.type, actual)) {
    errors.push({
      path,
      keyword: "type",
      message: `expected ${JSON.stringify(schema.type)}, got ${actual}`,
    });
    return errors;
  }
  if (schema.enum && !schema.enum.some((v) => Object.is(v, args))) {
    errors.push({
      path,
      keyword: "enum",
      message: `value not in enum`,
    });
  }
  if (typeof args === "string") {
    if (schema.minLength !== undefined && args.length < schema.minLength) {
      errors.push({
        path,
        keyword: "minLength",
        message: `length ${args.length} < ${schema.minLength}`,
      });
    }
    if (schema.maxLength !== undefined && args.length > schema.maxLength) {
      errors.push({
        path,
        keyword: "maxLength",
        message: `length ${args.length} > ${schema.maxLength}`,
      });
    }
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(args)) {
        errors.push({
          path,
          keyword: "pattern",
          message: `does not match /${schema.pattern}/`,
        });
      }
    }
  }
  if (actual === "object" && args && typeof args === "object") {
    const obj = args as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) {
        errors.push({
          path: `${path}.${req}`,
          keyword: "required",
          message: `missing required property "${req}"`,
        });
      }
    }
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(obj)) {
      if (k in props) {
        errors.push(...validateArgs(props[k], v, `${path}.${k}`));
      } else if (schema.additionalProperties === false) {
        errors.push({
          path: `${path}.${k}`,
          keyword: "additionalProperties",
          message: `unexpected property "${k}"`,
        });
      }
    }
  }
  if (actual === "array" && Array.isArray(args) && schema.items) {
    args.forEach((item, i) => {
      errors.push(...validateArgs(schema.items!, item, `${path}[${i}]`));
    });
  }
  return errors;
}

export class ToolRegistry {
  private tools = new Map<string, ToolRecord>();

  register(record: ToolRecord): void {
    if (this.tools.has(record.name)) {
      throw new Error(`tool already registered: ${record.name}`);
    }
    const shapeErrors = validateSchemaShape(record.parameters);
    if (shapeErrors.length) {
      throw new Error(
        `invalid schema for ${record.name}: ${shapeErrors[0].message}`,
      );
    }
    this.tools.set(record.name, record);
  }

  get(name: string): ToolRecord | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()].sort();
  }

  validate(name: string, args: unknown): ValidationError[] {
    const tool = this.tools.get(name);
    if (!tool) {
      return [
        {
          path: "$",
          keyword: "unknown",
          message: `unknown tool "${name}"`,
        },
      ];
    }
    return validateArgs(tool.parameters, args);
  }

  list(): ToolRecord[] {
    return [...this.tools.values()];
  }
}
