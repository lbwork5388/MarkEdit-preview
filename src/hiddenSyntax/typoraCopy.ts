import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { localized } from '../shared/strings';
import { copyButtonCss, createCopyButton } from './components/copyButton';

class CodeCopyWidget extends WidgetType {
  toDOM(view: EditorView) {
    // A zero-size anchor keeps cursor measurement at the end of the fence line
    const anchor = document.createElement('span');
    anchor.className = 'cm-typora-codeCopy';
    anchor.append(createCopyButton(localized('copyCode'), () => {
      const node = fencedCodeAt(view.state, view.posAtDOM(anchor));
      return node === undefined ? undefined : { text: fencedCodeText(view.state, node) };
    }));

    return anchor;
  }

  eq() {
    return true;
  }

  ignoreEvent() {
    return true;
  }
}

const codeCopyWidget = Decoration.widget({ widget: new CodeCopyWidget(), side: 1 });

export const typoraCodeCopy = [
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      installStyle();
      this.decorations = codeCopyDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.transactions.some(transaction => transaction.reconfigured)) {
        this.decorations = codeCopyDecorations(update.view);
      }
    }
  }, { decorations: plugin => plugin.decorations }),
  EditorView.theme({
    '&.cm-typoraMode .cm-typora-codeCopy': {
      display: 'inline-block',
      width: '0',
      height: '0',
      verticalAlign: 'top',
    },
    '&.cm-typoraMode .cm-typora-codeCopy .cm-md-copyButton': {
      position: 'absolute',
      top: '2px',
      right: '6px',
      zIndex: '1',
      width: '24px',
      height: '24px',
      opacity: '0.4',
      '--copy-background': 'var(--typora-code)',
      '--copy-border': 'var(--typora-border)',
      '--copy-color': 'var(--typora-muted)',
    },
    '&.cm-typoraMode .cm-typora-codeCopy .cm-md-copyButton:hover, &.cm-typoraMode .cm-typora-codeCopy .cm-md-copyButton.is-copied': {
      opacity: '1',
    },
    '&.cm-typoraMode .cm-md-syntaxHiddenTable::part(copy-button)': {
      display: 'inline-flex',
    },
    '&.cm-typoraMode .cm-md-syntaxHiddenCodeStart[data-code-language]::after': {
      right: '40px',
      maxWidth: 'calc(100% - 52px)',
    },
  }),
];

function codeCopyDecorations(view: EditorView) {
  const ranges: Range<Decoration>[] = [];
  const seen = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: node => {
        if (node.name !== 'FencedCode') {
          return;
        }

        if (!seen.has(node.from) && isCopyableFence(view.state, node.node)) {
          seen.add(node.from);
          ranges.push(codeCopyWidget.range(view.state.doc.lineAt(node.from).to));
        }

        return false;
      },
    });
  }

  return Decoration.set(ranges, true);
}

function isCopyableFence(state: EditorState, node: SyntaxNode) {
  const opening = node.firstChild;
  if (opening?.name !== 'CodeMark') {
    return false;
  }

  const info = node.getChild('CodeInfo');
  // Mermaid diagrams are rendered as images in the full build
  return !(__FULL_BUILD__ && info !== null && state.sliceDoc(info.from, info.to).trim() === 'mermaid');
}

export function fencedCodeAt(state: EditorState, pos: number) {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node !== null; node = node.parent) {
    if (node.name === 'FencedCode') {
      return node;
    }
  }

  const line = state.doc.lineAt(pos);
  let found: SyntaxNode | undefined;
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter: node => {
      if (found === undefined && node.name === 'FencedCode' && state.doc.lineAt(node.from).number === line.number) {
        found = node.node;
      }

      return found === undefined;
    },
  });

  return found;
}

/**
 * The code between the fences, without the indentation or container markers of the opening fence.
 */
export function fencedCodeText(state: EditorState, node: SyntaxNode) {
  const opening = node.firstChild;
  if (opening === null) {
    return '';
  }

  const firstLine = state.doc.lineAt(node.from);
  const prefix = state.sliceDoc(firstLine.from, opening.from);
  const closing = node.lastChild;
  const closed = closing !== null && closing.name === 'CodeMark' && closing.from !== opening.from
    && state.doc.lineAt(closing.from).number > firstLine.number;
  const last = closed ? state.doc.lineAt(closing.from).number - 1 : state.doc.lineAt(node.to).number;

  const lines: string[] = [];
  for (let number = firstLine.number + 1; number <= last; number++) {
    const text = state.doc.line(number).text;
    let index = 0;
    while (index < prefix.length && index < text.length && text[index] === prefix[index]) {
      index++;
    }

    lines.push(text.slice(index));
  }

  return lines.join('\n');
}

let styleInstalled = false;
function installStyle() {
  if (styleInstalled) {
    return;
  }

  styleInstalled = true;
  const style = document.createElement('style');
  style.textContent = copyButtonCss;
  document.head.appendChild(style);
}
