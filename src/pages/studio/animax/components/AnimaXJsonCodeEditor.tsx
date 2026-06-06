import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldService,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

import {
  loadLottieSchema,
  pathToLabel,
  resolveJsonFieldDoc,
  type JsonFieldDoc,
  type JsonPathSegment,
  type LottieSchemaDocument,
} from '../lottieJsonDocs';
import type { JsonPreviewStatus } from '../toolTypes';

interface AnimaXJsonCodeEditorProps {
  value: string;
  previewStatus: JsonPreviewStatus;
  canReset: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}

type JsonTreeCursor = ReturnType<ReturnType<typeof syntaxTree>['cursorAt']>;

class JsonDocBadgeWidget extends WidgetType {
  toDOM() {
    const badge = document.createElement('span');
    badge.className = 'animax-json-doc-badge';
    badge.textContent = 'i';
    badge.setAttribute('aria-hidden', 'true');
    return badge;
  }
}

const propertyMark = Decoration.mark({ class: 'animax-json-doc-key' });
const propertyBadge = Decoration.widget({
  widget: new JsonDocBadgeWidget(),
  side: 1,
});

export const AnimaXJsonCodeEditor: React.FC<AnimaXJsonCodeEditorProps> = ({
  value,
  previewStatus,
  canReset,
  onChange,
  onReset,
}) => {
  const previewStatusLabel = previewStatus.tone === 'error' ? '语法错误' : previewStatus.message;
  const previewStatusHint = previewStatus.tone === 'error' ? previewStatus.message : undefined;
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const schemaRef = useRef<LottieSchemaDocument | null>(null);
  const externalUpdateRef = useRef(false);
  const [formatError, setFormatError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const controller = new AbortController();

    loadLottieSchema(controller.signal)
      .then((schema) => {
        schemaRef.current = schema;
      })
      .catch((error: unknown) => {
        if ((error as DOMException)?.name === 'AbortError') return;
        schemaRef.current = null;
      });

    return () => controller.abort();
  }, []);

  const extensions = useMemo<Extension[]>(
    () => [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      foldGutter(),
      history(),
      indentUnit.of('  '),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      highlightSelectionMatches(),
      json(),
      foldService.of(jsonPropertyFoldService),
      linter(jsonParseLinter()),
      lintGutter(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      indentOnInput(),
      createJsonDocsExtension(() => schemaRef.current),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || externalUpdateRef.current) return;
        onChangeRef.current(update.state.doc.toString());
        setFormatError(null);
      }),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
        },
        '.cm-scroller': {
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: '12px',
          lineHeight: '1.6',
        },
        '.cm-content': {
          padding: '12px 0',
        },
        '.cm-gutters': {
          backgroundColor: 'var(--bg-app)',
          color: 'var(--animax-muted)',
          borderRight: '1px solid var(--animax-line)',
        },
        '.cm-activeLineGutter, .cm-activeLine': {
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
        },
      }),
    ],
    [],
  );

  useEffect(() => {
    if (!parentRef.current) return undefined;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions,
      }),
      parent: parentRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    externalUpdateRef.current = true;
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
    });
    externalUpdateRef.current = false;
  }, [value]);

  const handleFormat = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    try {
      const formatted = `${JSON.stringify(JSON.parse(view.state.doc.toString()), null, 2)}\n`;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: formatted },
      });
      setFormatError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFormatError(`JSON 无法格式化：${message}`);
    }
  }, []);

  const handleOpenSearch = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    openSearchPanel(view);
    view.focus();
  }, []);

  return (
    <div className="animax-editor-panel">
      <div className="animax-editor-section no-head">
        <div className="animax-editor-section-body">
          <div className="animax-editor-json-toolbar">
            <div className="animax-editor-json-toolbar-primary">
              <div className="animax-editor-json-toolbar-actions" aria-label="JSON 操作">
                <button
                  type="button"
                  className="animax-json-command format"
                  onClick={handleFormat}
                  title="格式化 JSON"
                >
                  <span className="animax-json-command-glyph" aria-hidden="true">
                    {'{}'}
                  </span>
                  <span className="animax-json-command-label">格式化</span>
                </button>
                <button
                  type="button"
                  className="animax-json-command search"
                  onClick={handleOpenSearch}
                  title="查找 JSON"
                >
                  <span className="animax-json-command-glyph" aria-hidden="true">
                    {'⌕'}
                  </span>
                  <span className="animax-json-command-label">查找</span>
                </button>
                <button
                  type="button"
                  className="animax-json-command reset"
                  onClick={onReset}
                  disabled={!canReset}
                  title="还原 JSON"
                >
                  <span className="animax-json-command-glyph" aria-hidden="true">
                    {'↺'}
                  </span>
                  <span className="animax-json-command-label">还原</span>
                </button>
              </div>
              <span className="animax-json-auto-chip">
                <span className="animax-json-auto-dot" aria-hidden="true" />
                自动预览
              </span>
            </div>
            <span
              className={`animax-editor-json-status ${previewStatus.tone}`}
              data-tooltip={previewStatusHint}
              aria-label={previewStatusHint ?? previewStatusLabel}
              tabIndex={previewStatusHint ? 0 : undefined}
            >
              <span className="animax-editor-json-status-label">{previewStatusLabel}</span>
            </span>
          </div>
          {formatError && <div className="animax-editor-json-error">{formatError}</div>}
          <div className="animax-editor-json-codemirror-shell">
            <div ref={parentRef} className="animax-json-codemirror" />
          </div>
        </div>
      </div>
    </div>
  );
};

function createJsonDocsExtension(getSchema: () => LottieSchemaDocument | null): Extension {
  const docsPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildPropertyDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildPropertyDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );

  const tooltip = hoverTooltip((view, pos) => {
    const fieldInfo = getFieldInfoAtPosition(view, pos, getSchema());
    if (!fieldInfo) return null;

    return {
      pos: fieldInfo.from,
      end: fieldInfo.to,
      above: true,
      arrow: true,
      create: () => ({ dom: createDocTooltip(fieldInfo.doc) }),
    };
  });

  return [docsPlugin, tooltip];
}

function jsonPropertyFoldService(state: EditorState, lineStart: number, lineEnd: number) {
  const line = state.doc.lineAt(lineStart);
  const lineText = state.sliceDoc(line.from, line.to);
  const valueStartMatch = /:\s*[\[{]/.exec(lineText);
  if (!valueStartMatch) return null;

  const openerIndex = valueStartMatch.index + valueStartMatch[0].length - 1;
  const openerPos = line.from + openerIndex;
  if (openerPos > lineEnd) return null;

  const closerPos = findMatchingJsonBracket(state.doc.toString(), openerPos);
  if (closerPos === null || closerPos <= line.to) return null;

  return {
    from: openerPos + 1,
    to: closerPos,
  };
}

function findMatchingJsonBracket(source: string, openerPos: number) {
  const opener = source[openerPos];
  const initialCloser = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (!initialCloser) return null;

  const stack = [initialCloser];
  let inString = false;
  let escaping = false;

  for (let index = openerPos + 1; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return index;
    }
  }

  return null;
}

function buildPropertyDecorations(view: EditorView) {
  const decorations: Array<Range<Decoration>> = [];
  const tree = syntaxTree(view.state);

  for (const range of view.visibleRanges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (node.name !== 'PropertyName') return;
        decorations.push(propertyMark.range(node.from, node.to));
        decorations.push(propertyBadge.range(node.to));
      },
    });
  }

  return Decoration.set(decorations, true);
}

function getFieldInfoAtPosition(
  view: EditorView,
  pos: number,
  schema: LottieSchemaDocument | null,
) {
  const cursor = syntaxTree(view.state).cursorAt(pos, -1);
  if (!moveToPropertyName(cursor)) return null;

  const path = jsonPathFromCursor(view.state, cursor);
  const rootValue = parseJson(view.state.doc.toString());
  const doc = resolveJsonFieldDoc(path, schema, rootValue);
  if (!doc) return null;

  return {
    from: cursor.from,
    to: cursor.to,
    doc,
  };
}

function moveToPropertyName(cursor: JsonTreeCursor) {
  if (cursor.name === 'PropertyName') return true;

  while (cursor.parent()) {
    if (cursor.name === 'PropertyName') return true;
  }

  return false;
}

function jsonPathFromCursor(state: EditorState, startCursor: JsonTreeCursor) {
  const cursor = startCursor.node.cursor();
  const path: JsonPathSegment[] = [];

  while (cursor.name && cursor.name !== 'JsonText') {
    if (cursor.name === 'PropertyName') {
      path.unshift(state.sliceDoc(cursor.from + 1, cursor.to - 1));
      cursor.parent();
      cursor.parent();
      continue;
    }

    if (cursor.name === 'Property') {
      cursor.firstChild();
      continue;
    }

    if (cursor.node.parent?.name === 'Array') {
      let index = -1;
      while (cursor.prevSibling()) index += 1;
      path.unshift(Math.max(0, index));
    }

    if (!cursor.parent()) break;
  }

  return path;
}

function createDocTooltip(doc: JsonFieldDoc) {
  const container = document.createElement('div');
  container.className = 'animax-json-doc-tooltip';

  const title = document.createElement('div');
  title.className = 'animax-json-doc-tooltip-title';
  title.textContent = doc.title;
  container.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'animax-json-doc-tooltip-meta';
  meta.textContent = `${doc.source}${doc.type ? ` · ${doc.type}` : ''} · ${pathToLabelText(doc.path)}`;
  container.appendChild(meta);

  if (doc.description) {
    const description = document.createElement('div');
    description.className = 'animax-json-doc-tooltip-description';
    description.textContent = doc.description;
    container.appendChild(description);
  }

  if (doc.valueHint) {
    const valueHint = document.createElement('div');
    valueHint.className = 'animax-json-doc-tooltip-value';
    valueHint.textContent = doc.valueHint;
    container.appendChild(valueHint);
  }

  return container;
}

function pathToLabelText(path: string) {
  return path || pathToLabel([]);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
