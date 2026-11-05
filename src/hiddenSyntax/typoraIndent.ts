import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField, type EditorState, type Text } from '@codemirror/state';
import { Decoration, type DecorationSet, Direction, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { selectionReveals } from './selection';

interface Anchor {
  line: number;
  end: number;
  fallback: string;
  taskSlot?: string;
}

interface LineIndent {
  from: number;
  prefixEnd: number;
  anchor: Anchor;
}

interface MeasuredIndent {
  from: number;
  prefix: number;
  target: number;
}

const taskSlotWidth = 1.4;
const setIndents = StateEffect.define<readonly MeasuredIndent[]>();
const indentDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setIndents)) {
        return Decoration.set(effect.value.map(indent => Decoration.line({
          class: 'cm-typora-hangingIndent',
          attributes: {
            style: `--typora-prefix-width: ${indent.prefix}px; --typora-wrap-indent: ${indent.target}px`,
          },
        }).range(indent.from)), true);
      }
    }

    return value.map(transaction.changes);
  },
  provide: field => EditorView.decorations.from(field),
});

export const typoraIndentExtension = [
  indentDecorations,
  ViewPlugin.fromClass(class {
    private previous = '[]';
    private destroyed = false;

    constructor(view: EditorView) {
      this.schedule(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged
        || update.transactions.some(transaction => transaction.reconfigured)) {
        this.schedule(update.view);
      }
    }

    destroy() {
      this.destroyed = true;
    }

    private schedule(view: EditorView) {
      view.requestMeasure({
        key: this,
        read: current => measureIndents(current),
        write: (indents, current) => {
          if (this.destroyed) {
            return;
          }

          const signature = JSON.stringify(indents);
          if (signature !== this.previous) {
            this.previous = signature;
            const state = current.state;
            // CodeMirror cannot dispatch while it is measuring the view.
            queueMicrotask(() => {
              if (this.destroyed || signature !== this.previous) {
                return;
              }

              if (current.state !== state) {
                this.previous = '';
                this.schedule(current);
              } else {
                current.dispatch({ effects: setIndents.of(indents) });
              }
            });
          }
        },
      });
    }
  }),
  EditorView.theme({
    '&.cm-typoraMode .cm-md-syntaxHiddenTaskCheckboxFrame': {
      minWidth: `${taskSlotWidth}em`,
    },
    '&.cm-typoraMode .cm-typora-hangingIndent': {
      marginInlineStart: 'var(--typora-wrap-indent) !important',
      textIndent: 'calc(-1 * var(--typora-prefix-width)) !important',
    },
  }),
];

function measureIndents(view: EditorView): MeasuredIndent[] {
  const anchors = new Map<string, number>();
  const lines = paragraphLines(view);
  const measureFallback = prefixMeasurer(view);
  const maxIndent = maxWrapIndent(view);
  const result: MeasuredIndent[] = [];

  for (const line of lines) {
    const key = `${line.anchor.line}:${line.anchor.end}`;
    let target = anchors.get(key);
    if (target === undefined) {
      target = prefixWidth(view, line.anchor.line, line.anchor.end) ?? measureFallback(line.anchor);
      anchors.set(key, target);
    }

    if (target > maxIndent) {
      continue;
    }

    const prefix = prefixWidth(view, line.from, line.prefixEnd);
    if (prefix !== undefined) {
      result.push({ from: line.from, prefix: rounded(prefix), target: rounded(target) });
    }
  }

  return result;
}

function maxWrapIndent(view: EditorView) {
  const width = view.contentDOM.clientWidth;
  if (width === 0) {
    return Infinity;
  }

  const style = getComputedStyle(view.contentDOM);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  return Math.max(0, width - padding - Math.max(32, view.defaultCharacterWidth * 4));
}

function paragraphLines(view: EditorView): LineIndent[] {
  const lines = new Map<number, LineIndent>();
  const { state } = view;

  for (const visible of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter: node => {
        if (node.name !== 'Paragraph' && node.name !== 'Task') {
          return;
        }

        const context = nearestContainer(node.node);
        const anchor = context?.name === 'ListItem'
          ? listAnchor(context, state)
          : context?.name === 'Blockquote' ? quoteAnchor(node.from, state.doc) : undefined;
        if (anchor === undefined) {
          return;
        }

        const first = state.doc.lineAt(Math.max(node.from, visible.from)).number;
        const last = state.doc.lineAt(Math.min(node.to, visible.to)).number;
        for (let number = first; number <= last; number++) {
          const line = state.doc.line(number);
          if (line.length === 0) {
            continue;
          }

          const prefixEnd = line.from === anchor.line
            ? anchor.end
            : line.from + structuralPrefixLength(line.text);
          lines.set(line.from, { from: line.from, prefixEnd, anchor });
        }
      },
    });
  }

  return [...lines.values()].sort((a, b) => a.from - b.from);
}

function nearestContainer(node: SyntaxNode): SyntaxNode | undefined {
  for (let parent = node.parent; parent !== null; parent = parent.parent) {
    if (parent.name === 'ListItem' || parent.name === 'Blockquote') {
      return parent;
    }
  }
}

function listAnchor(item: SyntaxNode, state: EditorState): Anchor | undefined {
  const marker = item.getChild('ListMark');
  if (marker === null) {
    return;
  }

  const line = state.doc.lineAt(marker.from);
  let end = marker.to;
  while (end < line.to && /[ \t]/.test(state.sliceDoc(end, end + 1))) {
    end++;
  }

  const task = item.getChild('Task')?.getChild('TaskMarker');
  if (task !== null && task !== undefined && task.from >= end && task.to < line.to) {
    end = task.to;
    while (end < line.to && /[ \t]/.test(state.sliceDoc(end, end + 1))) {
      end++;
    }
  }

  let fallback = state.sliceDoc(line.from, end);
  let taskSlot: string | undefined;
  if (item.parent?.name === 'BulletList' && task !== null && task !== undefined && state.sliceDoc(task.to, task.to + 1) === ' '
    && !selectionReveals(state, marker.from, task.to)) {
    taskSlot = state.sliceDoc(marker.from, marker.to + 1);
    fallback = state.sliceDoc(line.from, marker.from) + taskSlot + state.sliceDoc(task.to + 1, end);
  }

  return { line: line.from, end, fallback, taskSlot };
}

function quoteAnchor(from: number, doc: Text): Anchor {
  const line = doc.lineAt(from);
  return { line: line.from, end: from, fallback: doc.sliceString(line.from, from) };
}

function structuralPrefixLength(text: string) {
  let index = 0;
  while (index < text.length) {
    if (text[index] === ' ' || text[index] === '\t' || text[index] === '>') {
      index++;
    } else {
      break;
    }
  }
  return index;
}

function prefixWidth(view: EditorView, from: number, to: number) {
  if (from === to) {
    return 0;
  }

  const start = view.coordsForChar(from) ?? view.coordsAtPos(from, 1);
  const end = view.coordsAtPos(to, 1);
  if (start === null || end === null || start.bottom <= end.top || end.bottom <= start.top) {
    return;
  }

  const startEdge = view.textDirection === Direction.RTL ? start.right : start.left;
  return Math.abs(end.left - startEdge) / (view.scaleX || 1);
}

function prefixMeasurer(view: EditorView) {
  let context: CanvasRenderingContext2D | null | undefined;
  let letterSpacing = 0;
  let fontSize = 0;
  const width = (text: string) => {
    let expanded = '';
    for (const character of text) {
      const spaces = character === '\t' ? view.state.tabSize - (expanded.length % view.state.tabSize) : 1;
      expanded += character === '\t' ? ' '.repeat(spaces) : character;
    }

    if (context === undefined) {
      const style = getComputedStyle(view.contentDOM);
      const scrollerStyle = getComputedStyle(view.scrollDOM);
      context = view.dom.ownerDocument.createElement('canvas').getContext('2d');
      fontSize = parseFloat(style.fontSize) || parseFloat(scrollerStyle.fontSize) || 16;
      if (context !== null) {
        context.font = `${style.fontStyle || 'normal'} ${style.fontWeight || 'normal'} ${fontSize}px ${style.fontFamily || scrollerStyle.fontFamily}`;
        letterSpacing = parseFloat(style.letterSpacing) || 0;
      }
    }

    return context === null
      ? expanded.length * view.defaultCharacterWidth
      : context.measureText(expanded).width + Math.max(0, expanded.length - 1) * letterSpacing;
  };
  return (anchor: Anchor) => {
    const measured = width(anchor.fallback);
    return anchor.taskSlot === undefined
      ? measured
      : measured + Math.max(0, taskSlotWidth * fontSize - width(anchor.taskSlot));
  };
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}
