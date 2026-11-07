// Reading a tool call's arguments. Agents send JSON, so every field is checked
// rather than trusted. Pure, so `npm test` can load it.

function field(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/** A trimmed string argument; "" when missing or not a string. */
export function str(input: unknown, key: string): string {
  const v = field(input, key);
  return typeof v === "string" ? v.trim() : "";
}

/** A required string argument; throws naming it when missing. */
export function need(input: unknown, key: string): string {
  const v = str(input, key);
  if (!v) throw new Error(`Give ${key}.`);
  return v;
}

/** True only for a JSON `true`. */
export function flag(input: unknown, key: string): boolean {
  return field(input, key) === true;
}

/** A whole number within [min, max], or `fallback` when missing; throws when out of range. */
export function int(
  input: unknown,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const v = field(input, key);
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
  }
  return v;
}
