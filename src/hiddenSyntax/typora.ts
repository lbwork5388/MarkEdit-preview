import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { typoraIndentExtension } from './typoraIndent';
import { typoraCodeCopy } from './typoraCopy';

export const typoraStyleExtension = [
  EditorView.editorAttributes.of({ class: 'cm-typoraMode' }),
  EditorView.lineWrapping,
  typoraIndentExtension,
  typoraCodeCopy,
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = typographyDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.geometryChanged
        || update.transactions.some(transaction => transaction.reconfigured)) {
        this.decorations = typographyDecorations(update.view);
      }
    }
  }, { decorations: plugin => plugin.decorations }),
  EditorView.theme({
    '&.cm-typoraMode': {
      color: 'var(--typora-text)',
      backgroundColor: 'var(--typora-background)',
    },
    '&.cm-typoraMode .cm-scroller': {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      fontSize: '16px',
      lineHeight: '1.75 !important',
      backgroundColor: 'var(--typora-background)',
    },
    '&.cm-typoraMode .cm-content': {
      boxSizing: 'border-box',
      width: '100%',
      maxWidth: '860px',
      minWidth: '0',
      marginInline: 'auto',
      padding: '42px clamp(18px, 4vw, 30px) 96px !important',
      caretColor: 'var(--typora-text)',
    },
    '&.cm-typoraMode .cm-gutters': { display: 'none' },
    '&.cm-typoraMode .cm-line': { lineHeight: '1.75 !important' },
    '&.cm-typoraMode .cm-activeLine': { backgroundColor: 'transparent' },
    '&.cm-typoraMode .cm-typora-heading': {
      color: 'var(--typora-text)',
      fontWeight: '600',
      lineHeight: '1.3 !important',
      paddingBlock: '0.35em 0.2em',
    },
    '&.cm-typoraMode .cm-typora-heading span:not(.cm-md-syntaxHiddenSource, .cm-md-syntaxHiddenSource *)': {
      fontSize: 'inherit !important',
      color: 'inherit',
      textDecoration: 'none !important',
    },
    '&.cm-typoraMode .cm-typora-h1': { fontSize: '2.25em' },
    '&.cm-typoraMode .cm-typora-h2': {
      fontSize: '1.75em',
      borderBottom: '1px solid var(--typora-border)',
    },
    '&.cm-typoraMode .cm-typora-h3': { fontSize: '1.4em' },
    '&.cm-typoraMode .cm-typora-h4': { fontSize: '1.2em' },
    '&.cm-typoraMode .cm-typora-h5': { fontSize: '1em' },
    '&.cm-typoraMode .cm-typora-h6': { fontSize: '1em', color: 'var(--typora-muted)' },
    '&.cm-typoraMode .cm-typora-code': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      backgroundColor: 'var(--typora-code)',
      lineHeight: '1.6 !important',
      paddingInline: '14px',
      '--code-border': 'var(--typora-border)',
    },
    '&.cm-typoraMode .cm-typora-codeStart': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px' },
    '&.cm-typoraMode .cm-typora-codeEnd': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px' },
    '&.cm-typoraMode .cm-typora-inlineCode, &.cm-typoraMode .cm-md-inlineCode': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      backgroundColor: 'var(--typora-code)',
      borderRadius: '3px',
    },
    '&.cm-typoraMode .cm-typora-quote': { color: 'var(--typora-muted)' },
    '&.cm-typoraMode .cm-md-syntaxHiddenBlockquoteBar': {
      backgroundColor: 'var(--typora-border) !important',
      opacity: '1 !important',
    },
    '&.cm-typoraMode .cm-typora-link': { color: 'var(--typora-link)', textDecoration: 'underline' },
    '&.cm-typoraMode .cm-typora-strong': { fontWeight: '600' },
    '&.cm-typoraMode .cm-typora-emphasis': { fontStyle: 'italic' },
    '&.cm-typoraMode .cm-md-syntaxHiddenHorizontalRule': {
      borderTop: '1px solid var(--typora-border)',
      opacity: '1',
    },
  }),
  EditorView.baseTheme({
    '&light.cm-typoraMode': {
      '--typora-text': '#333333',
      '--typora-muted': '#777777',
      '--typora-background': '#ffffff',
      '--typora-code': '#f6f6f6',
      '--typora-border': '#e5e5e5',
      '--typora-link': '#4183c4',
    },
    '&dark.cm-typoraMode': {
      '--typora-text': '#d9d9d9',
      '--typora-muted': '#a3a3a3',
      '--typora-background': '#262626',
      '--typora-code': '#303030',
      '--typora-border': '#484848',
      '--typora-link': '#8ab4e0',
    },
  }),
];

function typographyDecorations(view: EditorView) {
  const ranges: Range<Decoration>[] = [];
  const lines = new Map<number, Set<string>>();
  const addLine = (from: number, classes: string[]) => {
    const existing = lines.get(from) ?? new Set<string>();
    classes.forEach(name => existing.add(name));
    lines.set(from, existing);
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: node => {
        const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
        if (heading !== null) {
          const underline = node.name.startsWith('Setext') ? node.node.getChild('HeaderMark') : null;
          const end = underline?.from ?? node.to;
          const first = view.state.doc.lineAt(Math.max(from, node.from)).number;
          const last = view.state.doc.lineAt(Math.min(to, Math.max(node.from, end - 1))).number;
          for (let number = first; number <= last; number++) {
            addLine(view.state.doc.line(number).from, ['cm-typora-heading', `cm-typora-h${heading[1]}`]);
          }
        }

        if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'Blockquote') {
          const firstLine = view.state.doc.lineAt(node.from);
          const lastLine = view.state.doc.lineAt(node.to);
          const first = Math.max(firstLine.number, view.state.doc.lineAt(from).number);
          const last = Math.min(lastLine.number, view.state.doc.lineAt(to).number);
          for (let number = first; number <= last; number++) {
            const classes = [node.name === 'Blockquote' ? 'cm-typora-quote' : 'cm-typora-code'];
            if (node.name !== 'Blockquote') {
              if (number === firstLine.number) {
                classes.push('cm-typora-codeStart');
              }
              if (number === lastLine.number) {
                classes.push('cm-typora-codeEnd');
              }
            }
            addLine(view.state.doc.line(number).from, classes);
          }
        }

        const inlineClass = {
          InlineCode: 'cm-typora-inlineCode',
          Link: 'cm-typora-link',
          Autolink: 'cm-typora-link',
          StrongEmphasis: 'cm-typora-strong',
          Emphasis: 'cm-typora-emphasis',
        }[node.name];
        if (inlineClass !== undefined) {
          ranges.push(Decoration.mark({ class: inlineClass }).range(node.from, node.to));
        }
      },
    });
  }

  lines.forEach((classes, from) => ranges.push(Decoration.line({ class: [...classes].join(' ') }).range(from)));
  return Decoration.set(ranges, true);
}
