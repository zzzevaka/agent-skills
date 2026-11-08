/** Helpers that reproduce Python formatting so error messages stay identical. */

const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

function hex(code: number, width: number): string {
  return code.toString(16).padStart(width, "0");
}

/** Python `repr()` of a `str`. */
export function pyRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === quote || char === "\\") out += "\\" + char;
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (char !== " " && NON_PRINTABLE.test(char)) {
      if (code < 0x100) out += "\\x" + hex(code, 2);
      else if (code < 0x10000) out += "\\u" + hex(code, 4);
      else out += "\\U" + hex(code, 8);
    } else out += char;
  }
  return out + quote;
}

/** Python `repr()` of a JSON scalar (`str`, number, `bool`, `None`). */
export function pyValueRepr(value: unknown): string {
  if (typeof value === "string") return pyRepr(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null || value === undefined) return "None";
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

/** Python `repr()` of a list of strings, e.g. `['a', 'b']`. */
export function pyListRepr(items: string[]): string {
  return "[" + items.map(pyRepr).join(", ") + "]";
}

/** Python `type(value).__name__` for a JSON-compatible value. */
export function pyTypeName(
  value: unknown,
): "str" | "int" | "float" | "bool" | "list" | "dict" | "NoneType" {
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (Array.isArray(value)) return "list";
  if (value !== null && typeof value === "object") return "dict";
  return "NoneType";
}

// Characters for which Python's `str.isspace()` is true. JS `trim()` differs:
// it strips U+FEFF but not U+001C-U+001F or U+0085.
const PY_SPACE =
  "[\\t\\n\\v\\f\\r\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const LEADING = new RegExp(`^${PY_SPACE}+`);
const TRAILING = new RegExp(`${PY_SPACE}+$`);

/** Python `str.strip()`. */
export function pyStrip(value: string): string {
  return value.replace(LEADING, "").replace(TRAILING, "");
}

/** Python `str.lstrip()`. */
export function pyLstrip(value: string): string {
  return value.replace(LEADING, "");
}
