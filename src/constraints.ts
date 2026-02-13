/**
 * JSON Schema constraint validation.
 *
 * Runs post-coercion to check that coerced values satisfy
 * JSON Schema keywords: minimum, maximum, exclusiveMinimum, exclusiveMaximum,
 * minLength, maxLength, pattern, format, minItems, maxItems,
 * minProperties, maxProperties, multipleOf.
 *
 * Constraints are extracted from the schema alongside structural types,
 * and validated against the final coerced value.
 */

// ---------------------------------------------------------------------------
// Constraint types
// ---------------------------------------------------------------------------

export interface NumericConstraints {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

export interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

export interface ArrayConstraints {
  minItems?: number;
  maxItems?: number;
}

export interface ObjectConstraints {
  minProperties?: number;
  maxProperties?: number;
}

export interface Constraints {
  numeric?: NumericConstraints;
  string?: StringConstraints;
  array?: ArrayConstraints;
  object?: ObjectConstraints;
}

// ---------------------------------------------------------------------------
// Constraint violation
// ---------------------------------------------------------------------------

export interface ConstraintViolation {
  /** Dot-path to the violating value. */
  path: string;
  /** The constraint keyword that was violated. */
  keyword: string;
  /** Human-readable description. */
  message: string;
  /** The expected constraint value. */
  expected: unknown;
  /** The actual value. */
  actual: unknown;
}

// ---------------------------------------------------------------------------
// Extract constraints from a JSON Schema node
// ---------------------------------------------------------------------------

export function extractConstraints(schema: Record<string, unknown>): Constraints {
  const constraints: Constraints = {};

  // Numeric
  if (
    schema['minimum'] !== undefined ||
    schema['maximum'] !== undefined ||
    schema['exclusiveMinimum'] !== undefined ||
    schema['exclusiveMaximum'] !== undefined ||
    schema['multipleOf'] !== undefined
  ) {
    constraints.numeric = {};
    if (typeof schema['minimum'] === 'number') constraints.numeric.minimum = schema['minimum'];
    if (typeof schema['maximum'] === 'number') constraints.numeric.maximum = schema['maximum'];
    if (typeof schema['exclusiveMinimum'] === 'number')
      constraints.numeric.exclusiveMinimum = schema['exclusiveMinimum'];
    if (typeof schema['exclusiveMaximum'] === 'number')
      constraints.numeric.exclusiveMaximum = schema['exclusiveMaximum'];
    if (typeof schema['multipleOf'] === 'number')
      constraints.numeric.multipleOf = schema['multipleOf'];
  }

  // String
  if (
    schema['minLength'] !== undefined ||
    schema['maxLength'] !== undefined ||
    schema['pattern'] !== undefined ||
    schema['format'] !== undefined
  ) {
    constraints.string = {};
    if (typeof schema['minLength'] === 'number') constraints.string.minLength = schema['minLength'];
    if (typeof schema['maxLength'] === 'number') constraints.string.maxLength = schema['maxLength'];
    if (typeof schema['pattern'] === 'string') constraints.string.pattern = schema['pattern'];
    if (typeof schema['format'] === 'string') constraints.string.format = schema['format'];
  }

  // Array
  if (schema['minItems'] !== undefined || schema['maxItems'] !== undefined) {
    constraints.array = {};
    if (typeof schema['minItems'] === 'number') constraints.array.minItems = schema['minItems'];
    if (typeof schema['maxItems'] === 'number') constraints.array.maxItems = schema['maxItems'];
  }

  // Object
  if (schema['minProperties'] !== undefined || schema['maxProperties'] !== undefined) {
    constraints.object = {};
    if (typeof schema['minProperties'] === 'number')
      constraints.object.minProperties = schema['minProperties'];
    if (typeof schema['maxProperties'] === 'number')
      constraints.object.maxProperties = schema['maxProperties'];
  }

  return constraints;
}

// ---------------------------------------------------------------------------
// Validate constraints against a value
// ---------------------------------------------------------------------------

export function validateConstraints(
  value: unknown,
  constraints: Constraints,
  path: string = '',
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (value === null || value === undefined) return violations;

  // Numeric constraints
  if (constraints.numeric && typeof value === 'number') {
    const nc = constraints.numeric;
    if (nc.minimum !== undefined && value < nc.minimum) {
      violations.push({
        path,
        keyword: 'minimum',
        message: `Value ${value} is less than minimum ${nc.minimum}`,
        expected: nc.minimum,
        actual: value,
      });
    }
    if (nc.maximum !== undefined && value > nc.maximum) {
      violations.push({
        path,
        keyword: 'maximum',
        message: `Value ${value} is greater than maximum ${nc.maximum}`,
        expected: nc.maximum,
        actual: value,
      });
    }
    if (nc.exclusiveMinimum !== undefined && value <= nc.exclusiveMinimum) {
      violations.push({
        path,
        keyword: 'exclusiveMinimum',
        message: `Value ${value} is not greater than exclusive minimum ${nc.exclusiveMinimum}`,
        expected: nc.exclusiveMinimum,
        actual: value,
      });
    }
    if (nc.exclusiveMaximum !== undefined && value >= nc.exclusiveMaximum) {
      violations.push({
        path,
        keyword: 'exclusiveMaximum',
        message: `Value ${value} is not less than exclusive maximum ${nc.exclusiveMaximum}`,
        expected: nc.exclusiveMaximum,
        actual: value,
      });
    }
    if (nc.multipleOf !== undefined && value % nc.multipleOf !== 0) {
      violations.push({
        path,
        keyword: 'multipleOf',
        message: `Value ${value} is not a multiple of ${nc.multipleOf}`,
        expected: nc.multipleOf,
        actual: value,
      });
    }
  }

  // String constraints
  if (constraints.string && typeof value === 'string') {
    const sc = constraints.string;
    if (sc.minLength !== undefined && value.length < sc.minLength) {
      violations.push({
        path,
        keyword: 'minLength',
        message: `String length ${value.length} is less than minimum ${sc.minLength}`,
        expected: sc.minLength,
        actual: value.length,
      });
    }
    if (sc.maxLength !== undefined && value.length > sc.maxLength) {
      violations.push({
        path,
        keyword: 'maxLength',
        message: `String length ${value.length} is greater than maximum ${sc.maxLength}`,
        expected: sc.maxLength,
        actual: value.length,
      });
    }
    if (sc.pattern !== undefined) {
      try {
        const re = new RegExp(sc.pattern);
        if (!re.test(value)) {
          violations.push({
            path,
            keyword: 'pattern',
            message: `String "${value}" does not match pattern "${sc.pattern}"`,
            expected: sc.pattern,
            actual: value,
          });
        }
      } catch {
        // Invalid regex in schema — skip
      }
    }
    if (sc.format !== undefined) {
      const formatError = validateFormat(value, sc.format);
      if (formatError) {
        violations.push({
          path,
          keyword: 'format',
          message: formatError,
          expected: sc.format,
          actual: value,
        });
      }
    }
  }

  // Array constraints
  if (constraints.array && Array.isArray(value)) {
    const ac = constraints.array;
    if (ac.minItems !== undefined && value.length < ac.minItems) {
      violations.push({
        path,
        keyword: 'minItems',
        message: `Array length ${value.length} is less than minimum ${ac.minItems}`,
        expected: ac.minItems,
        actual: value.length,
      });
    }
    if (ac.maxItems !== undefined && value.length > ac.maxItems) {
      violations.push({
        path,
        keyword: 'maxItems',
        message: `Array length ${value.length} is greater than maximum ${ac.maxItems}`,
        expected: ac.maxItems,
        actual: value.length,
      });
    }
  }

  // Object constraints
  if (constraints.object && typeof value === 'object' && !Array.isArray(value)) {
    const oc = constraints.object;
    const keyCount = Object.keys(value as object).length;
    if (oc.minProperties !== undefined && keyCount < oc.minProperties) {
      violations.push({
        path,
        keyword: 'minProperties',
        message: `Object has ${keyCount} properties, minimum is ${oc.minProperties}`,
        expected: oc.minProperties,
        actual: keyCount,
      });
    }
    if (oc.maxProperties !== undefined && keyCount > oc.maxProperties) {
      violations.push({
        path,
        keyword: 'maxProperties',
        message: `Object has ${keyCount} properties, maximum is ${oc.maxProperties}`,
        expected: oc.maxProperties,
        actual: keyCount,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Deep constraint validation
// ---------------------------------------------------------------------------

/**
 * Recursively extract and validate constraints for a full JSON Schema.
 *
 * Walks the schema tree and the coerced value tree in parallel,
 * checking constraints at each level.
 */
export function validateSchemaConstraints(
  value: unknown,
  schema: Record<string, unknown>,
  path: string = '',
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (value === null || value === undefined) return violations;

  // Handle $ref — skip for now (constraints on $ref targets are complex)
  if (schema['$ref']) return violations;

  // Validate this node's constraints
  const constraints = extractConstraints(schema);
  violations.push(...validateConstraints(value, constraints, path));

  // anyOf / oneOf — find the matching sub-schema and validate its constraints
  const union = (schema['anyOf'] ?? schema['oneOf']) as Record<string, unknown>[] | undefined;
  if (Array.isArray(union)) {
    // Try each sub-schema; use the first one that doesn't add violations
    // (This is a simplification — full JSON Schema validation is more complex)
    for (const subSchema of union) {
      if (subSchema && typeof subSchema === 'object') {
        const subViolations = validateSchemaConstraints(value, subSchema, path);
        if (subViolations.length === 0) {
          return violations; // This sub-schema matched with no violations
        }
      }
    }
    // If none matched cleanly, validate against the first one
    if (union.length > 0 && union[0] && typeof union[0] === 'object') {
      violations.push(...validateSchemaConstraints(value, union[0], path));
    }
    return violations;
  }

  // Recurse into object properties
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    schema['properties'] &&
    typeof schema['properties'] === 'object'
  ) {
    const properties = schema['properties'] as Record<string, unknown>;
    const obj = value as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(properties)) {
      if (propSchema && typeof propSchema === 'object' && key in obj) {
        const childPath = path ? `${path}.${key}` : key;
        violations.push(
          ...validateSchemaConstraints(
            obj[key],
            propSchema as Record<string, unknown>,
            childPath,
          ),
        );
      }
    }
  }

  // Recurse into array items
  if (Array.isArray(value) && schema['items'] && typeof schema['items'] === 'object') {
    const itemSchema = schema['items'] as Record<string, unknown>;
    for (let i = 0; i < value.length; i++) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      violations.push(...validateSchemaConstraints(value[i], itemSchema, childPath));
    }
  }

  // Recurse into additionalProperties (map values)
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    schema['additionalProperties'] &&
    typeof schema['additionalProperties'] === 'object' &&
    !schema['properties']
  ) {
    const valSchema = schema['additionalProperties'] as Record<string, unknown>;
    const obj = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      const childPath = path ? `${path}.${key}` : key;
      violations.push(...validateSchemaConstraints(val, valSchema, childPath));
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Format validators
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}/;
const URI_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

/**
 * Validates that a YYYY-MM-DD string represents a real calendar date.
 * Date.parse silently rolls over impossible dates (e.g. Feb 31 → Mar 3),
 * so we parse the components and round-trip through Date to verify.
 */
function isValidCalendarDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Construct in UTC to avoid timezone shifts
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Validates that the HH:MM:SS portion of a time string is in range.
 */
function isValidTimeRange(timeStr: string): boolean {
  // Strip timezone suffix (Z, +05:30, -05:00) before parsing
  const bare = timeStr.replace(/[Z+-].*$/, '');
  const [hh, mm, ss] = bare.split(':').map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59;
}

/**
 * Validates email addresses beyond the basic regex.
 * Rejects: consecutive dots, leading/trailing dots in local or domain parts.
 */
function isValidEmail(email: string): boolean {
  if (!EMAIL_RE.test(email)) return false;
  // No consecutive dots anywhere
  if (email.includes('..')) return false;
  const [local, domain] = email.split('@');
  // No leading/trailing dots in local part
  if (local.startsWith('.') || local.endsWith('.')) return false;
  // No leading/trailing dots in domain
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}

function validateFormat(value: string, format: string): string | null {
  switch (format) {
    case 'email':
      return isValidEmail(value) ? null : `"${value}" is not a valid email`;
    case 'date':
      return DATE_RE.test(value) && isValidCalendarDate(value)
        ? null
        : `"${value}" is not a valid date (expected YYYY-MM-DD)`;
    case 'date-time':
      if (!DATETIME_RE.test(value) || isNaN(Date.parse(value))) {
        return `"${value}" is not a valid date-time`;
      }
      // Extract the date portion and validate calendar correctness
      return isValidCalendarDate(value.substring(0, 10))
        ? null
        : `"${value}" is not a valid date-time`;
    case 'time':
      return TIME_RE.test(value) && isValidTimeRange(value)
        ? null
        : `"${value}" is not a valid time (expected HH:MM:SS)`;
    case 'uri':
    case 'uri-reference':
      return URI_RE.test(value) ? null : `"${value}" is not a valid URI`;
    case 'uuid':
      return UUID_RE.test(value) ? null : `"${value}" is not a valid UUID`;
    case 'ipv4':
      if (!IPV4_RE.test(value)) return `"${value}" is not a valid IPv4 address`;
      {
        const parts = value.split('.').map(Number);
        if (parts.some((p) => p < 0 || p > 255)) return `"${value}" is not a valid IPv4 address`;
      }
      return null;
    case 'ipv6':
      return IPV6_RE.test(value) ? null : `"${value}" is not a valid IPv6 address`;
    default:
      // Unknown format — don't fail
      return null;
  }
}
