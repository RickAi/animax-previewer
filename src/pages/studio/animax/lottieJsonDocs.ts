export type JsonPathSegment = string | number;

export interface JsonFieldDoc {
  title: string;
  type?: string;
  description?: string;
  path: string;
  source: 'Lottie Schema' | 'AnimaX Extension' | 'Local Fallback';
  valueHint?: string;
}

type JsonSchemaNode = {
  $ref?: string;
  allOf?: JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode | JsonSchemaNode[];
  title?: string;
  description?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
};

export type LottieSchemaDocument = JsonSchemaNode & {
  $defs?: Record<string, unknown>;
};

type LocalDoc = Omit<JsonFieldDoc, 'path' | 'source' | 'valueHint'> & {
  pattern: string;
  source?: JsonFieldDoc['source'];
};

export const LOTTIE_SCHEMA_URL = 'https://lottiefiles.github.io/lottie-docs/lottie.schema.json';

const LOCAL_FIELD_DOCS: LocalDoc[] = [
  {
    pattern: 'v',
    title: 'Bodymovin Version',
    type: 'string',
    description: 'Bodymovin exporter version. Older versions may encode some fields differently.',
  },
  {
    pattern: 'fr',
    title: 'Framerate',
    type: 'number',
    description: 'Frames per second used by the animation timeline.',
  },
  {
    pattern: 'ip',
    title: 'In Point',
    type: 'number',
    description: 'Frame where the animation starts.',
  },
  {
    pattern: 'op',
    title: 'Out Point',
    type: 'number',
    description: 'Frame where the animation stops or loops.',
  },
  {
    pattern: 'w',
    title: 'Width',
    type: 'integer',
    description: 'Composition width in pixels.',
  },
  {
    pattern: 'h',
    title: 'Height',
    type: 'integer',
    description: 'Composition height in pixels.',
  },
  {
    pattern: 'assets',
    title: 'Assets',
    type: 'array',
    description: 'Reusable image, precomposition, sound, or data assets referenced by layers.',
  },
  {
    pattern: 'layers',
    title: 'Layers',
    type: 'array',
    description: 'Top-level layer list rendered in timeline order.',
  },
  {
    pattern: 'fonts',
    title: 'Font List',
    type: 'object',
    description: 'Font metadata used by text layers.',
  },
  {
    pattern: 'videos',
    title: 'Video Assets',
    type: 'array',
    description: 'AnimaX extension: video resources used by AlphaVideo layers.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*',
    title: 'Video Asset',
    type: 'object',
    description: 'AnimaX extension: one decoded video resource and its RGB/alpha frame layout.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.id',
    title: 'Video ID',
    type: 'string',
    description: 'Identifier referenced by an AlphaVideo layer through refId.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.u',
    title: 'Video Directory',
    type: 'string',
    description: 'Relative directory or URL prefix for the video file.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.p',
    title: 'Video Path',
    type: 'string',
    description: 'Video file path, URL, or file name resolved with u.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.x',
    title: 'RGB Frame X',
    type: 'number',
    description: 'X coordinate of the RGB region inside the video texture.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.y',
    title: 'RGB Frame Y',
    type: 'number',
    description: 'Y coordinate of the RGB region inside the video texture.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.w',
    title: 'RGB Frame Width',
    type: 'number',
    description: 'Width of the RGB region, also used as the displayed video width.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.h',
    title: 'RGB Frame Height',
    type: 'number',
    description: 'Height of the RGB region, also used as the displayed video height.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.ax',
    title: 'Alpha Frame X',
    type: 'number',
    description: 'X coordinate of the alpha region inside the video texture.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.ay',
    title: 'Alpha Frame Y',
    type: 'number',
    description: 'Y coordinate of the alpha region inside the video texture.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.aw',
    title: 'Alpha Frame Width',
    type: 'number',
    description: 'Width of the alpha region inside the video texture.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'videos.*.ah',
    title: 'Alpha Frame Height',
    type: 'number',
    description: 'Height of the alpha region inside the video texture.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'layers.*.ty',
    title: 'Layer Type',
    type: 'integer',
    description: 'Layer discriminator. AnimaX additionally uses 1009 for AlphaVideo layers.',
    source: 'AnimaX Extension',
  },
  {
    pattern: 'layers.*.refId',
    title: 'Reference ID',
    type: 'string',
    description: 'References an asset, precomposition, image, or AnimaX video resource.',
  },
];

export async function loadLottieSchema(signal?: AbortSignal): Promise<LottieSchemaDocument> {
  const response = await fetch(LOTTIE_SCHEMA_URL, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load Lottie schema: ${response.status}`);
  }
  return (await response.json()) as LottieSchemaDocument;
}

export function resolveJsonFieldDoc(
  path: JsonPathSegment[],
  schema: LottieSchemaDocument | null,
  rootValue: unknown,
): JsonFieldDoc | null {
  const localDoc = resolveLocalDoc(path, rootValue);
  const schemaDoc = schema ? resolveSchemaDoc(path, schema) : null;

  if (localDoc && (!schemaDoc || localDoc.source === 'AnimaX Extension')) {
    return localDoc;
  }

  return schemaDoc ?? localDoc;
}

export function pathToLabel(path: JsonPathSegment[]) {
  if (path.length === 0) return '$';
  return path.map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment)).join('.');
}

function resolveLocalDoc(path: JsonPathSegment[], rootValue: unknown): JsonFieldDoc | null {
  const normalizedPath = normalizePath(path);
  const doc = LOCAL_FIELD_DOCS.filter((item) =>
    pathMatchesPattern(normalizedPath, item.pattern),
  ).sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (!doc) return null;

  return {
    title: doc.title,
    type: doc.type,
    description: doc.description,
    path: pathToLabel(path),
    source: doc.source ?? 'Local Fallback',
    valueHint: getLocalValueHint(path, rootValue),
  };
}

function resolveSchemaDoc(
  path: JsonPathSegment[],
  schema: LottieSchemaDocument,
): JsonFieldDoc | null {
  const key = path[path.length - 1];
  if (typeof key !== 'string') return null;

  let candidates: JsonSchemaNode[] = [schema];
  for (const segment of path.slice(0, -1)) {
    candidates =
      typeof segment === 'number'
        ? getItemSchemas(candidates, schema)
        : getPropertySchemas(candidates, segment, schema);
    if (candidates.length === 0) return null;
  }

  const propertySchemas = getPropertySchemas(candidates, key, schema);
  if (propertySchemas.length === 0) return null;

  const nodes = flattenSchemas(propertySchemas, schema);
  const title = firstString(nodes, 'title') ?? key;
  const description = firstString(nodes, 'description');
  const type = formatSchemaType(propertySchemas, schema);

  return {
    title,
    type,
    description,
    path: pathToLabel(path),
    source: 'Lottie Schema',
    valueHint: getLocalValueHint(path, undefined),
  };
}

function getPropertySchemas(
  nodes: JsonSchemaNode[],
  property: string,
  schema: LottieSchemaDocument,
) {
  const result: JsonSchemaNode[] = [];

  for (const node of flattenSchemas(nodes, schema)) {
    const propertySchema = node.properties?.[property];
    if (propertySchema) result.push(propertySchema);
  }

  return result;
}

function getItemSchemas(nodes: JsonSchemaNode[], schema: LottieSchemaDocument) {
  const result: JsonSchemaNode[] = [];

  for (const node of flattenSchemas(nodes, schema)) {
    const items = node.items;
    if (Array.isArray(items)) result.push(...items);
    else if (items) result.push(items);
  }

  return result;
}

function flattenSchemas(nodes: JsonSchemaNode[], schema: LottieSchemaDocument) {
  const result: JsonSchemaNode[] = [];
  const seen = new Set<JsonSchemaNode | string>();

  const visit = (node: JsonSchemaNode | undefined) => {
    if (!node) return;

    if (node.$ref) {
      if (seen.has(node.$ref)) return;
      seen.add(node.$ref);
      visit(resolveRef(schema, node.$ref));
    }

    if (seen.has(node)) return;
    seen.add(node);
    result.push(node);

    node.allOf?.forEach(visit);
    node.anyOf?.forEach(visit);
    node.oneOf?.forEach(visit);
  };

  nodes.forEach(visit);
  return result;
}

function resolveRef(schema: LottieSchemaDocument, ref: string): JsonSchemaNode | undefined {
  if (!ref.startsWith('#/')) return undefined;

  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[segment];
    }, schema) as JsonSchemaNode | undefined;
}

function firstString(nodes: JsonSchemaNode[], key: 'title' | 'description') {
  return nodes.map((node) => node[key]).find((value): value is string => typeof value === 'string');
}

function formatSchemaType(
  nodes: JsonSchemaNode[],
  schema: LottieSchemaDocument,
): string | undefined {
  const types = new Set<string>();

  for (const node of flattenSchemas(nodes, schema)) {
    if (node.type) {
      const rawTypes = Array.isArray(node.type) ? node.type : [node.type];
      rawTypes.forEach((type) => {
        if (type === 'array') {
          const itemTypes = getItemSchemas([node], schema)
            .map((item) => firstString(flattenSchemas([item], schema), 'title') ?? item.type)
            .filter((value): value is string => typeof value === 'string');
          types.add(itemTypes.length > 0 ? `Array<${dedupe(itemTypes).join(' | ')}>` : 'array');
        } else {
          types.add(type);
        }
      });
    }

    if (node.$ref) {
      const refTitle = firstString(flattenSchemas([node], schema), 'title');
      if (refTitle) types.add(refTitle);
    }
  }

  return types.size > 0 ? Array.from(types).join(' | ') : undefined;
}

function normalizePath(path: JsonPathSegment[]) {
  return path.map((segment) => (typeof segment === 'number' ? '*' : segment)).join('.');
}

function pathMatchesPattern(path: string, pattern: string) {
  return path === pattern || path.endsWith(`.${pattern}`);
}

function getLocalValueHint(path: JsonPathSegment[], rootValue: unknown) {
  const key = path[path.length - 1];
  if (key !== 'ty') return undefined;

  const value = getValueAtPath(rootValue, path);
  if (value === 1009) return '1009 = AlphaVideo Layer';
  if (value === 0) return '0 = Precomposition Layer';
  if (value === 1) return '1 = Solid Layer';
  if (value === 2) return '2 = Image Layer';
  if (value === 3) return '3 = Null Layer';
  if (value === 4) return '4 = Shape Layer';
  if (value === 5) return '5 = Text Layer';
  return undefined;
}

function getValueAtPath(rootValue: unknown, path: JsonPathSegment[]) {
  return path.reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, rootValue);
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}
