// @vitest-environment jsdom
import './support';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { hiddenSyntaxModeExtension, setHiddenSyntaxMode } from '../../src/hiddenSyntax/mode';
import { fencedCodeAt, fencedCodeText } from '../../src/hiddenSyntax/typoraCopy';
import { copyFeedbackDuration } from '../../src/hiddenSyntax/components/copyButton';
import * as editor from '../support/editor';

const clipboard = vi.hoisted(() => ({ items: [] as Record<string, Blob>[] }));
const alerts = vi.hoisted(() => ({ showAlert: vi.fn() }));
vi.mock('markedit-api', () => ({ MarkEdit: { editorConfig: { theme: 'github-light' }, showAlert: alerts.showAlert } }));

window.matchMedia ??= query => Object.assign(new EventTarget(), {
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
});

function readBlob(blob: Blob) {
  return new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

class FakeClipboardItem {
  constructor(readonly types: Record<string, Blob>) {}
}

beforeEach(() => {
  clipboard.items = [];
  vi.stubGlobal('ClipboardItem', FakeClipboardItem);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: vi.fn(async (items: FakeClipboardItem[]) => {
        clipboard.items.push(...items.map(item => item.types));
      }),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function codeText(source: string, pos = 0) {
  editor.setUp(source);
  const state = window.editor.state;
  ensureSyntaxTree(state, state.doc.length, 1000);
  const node = fencedCodeAt(state, pos);
  return node === undefined ? undefined : fencedCodeText(state, node);
}

const codeButtons = () => [...window.editor.dom.querySelectorAll<HTMLButtonElement>('.cm-typora-codeCopy .cm-md-copyButton')];

describe('Typora copy buttons', () => {
  test('extracts code between fences without container indentation', () => {
    expect(codeText('```js\nconst a = 1;\n\nreturn a;\n```')).toBe('const a = 1;\n\nreturn a;');
    expect(codeText('- item\n\n  ```\n  nested\n    deeper\n  ```', 10)).toBe('nested\n  deeper');
    expect(codeText('> ```\n> quoted\n> ```')).toBe('quoted');
    expect(codeText('```\nunclosed\nlines')).toBe('unclosed\nlines');
    expect(codeText('```\n```')).toBe('');
    expect(codeText('Plain text')).toBeUndefined();
    window.editor.destroy();
    editor.setUp('');
  });

  test('copies code and shows a temporary check mark without moving the selection', async () => {
    const source = 'Intro\n\n```ts\nconst value = 1;\n```\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);

    const [button] = codeButtons();
    expect(button.title).toBe('Copy Code');
    vi.useFakeTimers();

    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
    for (let index = 0; index < 5; index++) {
      await Promise.resolve();
    }

    expect(button.classList.contains('is-copied')).toBe(true);
    expect(button.title).toBe('Copied');
    expect(window.editor.state.selection.main.anchor).toBe(source.length);
    expect(window.editor.state.doc.toString()).toBe(source);

    vi.advanceTimersByTime(copyFeedbackDuration - 1);
    expect(button.classList.contains('is-copied')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(button.classList.contains('is-copied')).toBe(false);
    expect(button.title).toBe('Copy Code');

    vi.useRealTimers();
    expect(await readBlob(clipboard.items[0]['text/plain'])).toBe('const value = 1;');
  });

  test('copies the latest code after edits and skips Mermaid and other modes', async () => {
    const source = '```\nold\n```\n\n```mermaid\ngraph TD\n```\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);
    expect(codeButtons()).toHaveLength(1);

    window.editor.dispatch({ changes: { from: 4, to: 7, insert: 'new' } });
    codeButtons()[0].click();
    await vi.waitFor(() => expect(clipboard.items).toHaveLength(1));
    expect(await readBlob(clipboard.items[0]['text/plain'])).toBe('new');

    await setHiddenSyntaxMode(window.editor, true);
    expect(codeButtons()).toHaveLength(0);
  });

  test('reports clipboard failures', async () => {
    editor.setUp('```\ncode\n```\n\nEnd', hiddenSyntaxModeExtension);
    window.editor.dispatch({ selection: { anchor: window.editor.state.doc.length } });
    await setHiddenSyntaxMode(window.editor, true, true);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(navigator.clipboard.write).mockRejectedValueOnce(new Error('denied'));

    const [button] = codeButtons();
    button.click();
    await vi.waitFor(() => expect(alerts.showAlert).toHaveBeenCalledWith('Failed to copy. Please try again.'));
    expect(button.classList.contains('is-copied')).toBe(false);
  });

  test('copies tables as Markdown and HTML', async () => {
    const source = '| A | B |\n| --- | --- |\n| one | two |\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);

    const root = () => window.editor.dom.querySelector('.cm-md-syntaxHiddenTable')?.shadowRoot;
    await vi.waitFor(() => expect(root()?.querySelector('table')).toBeTruthy());
    const button = root()!.querySelector<HTMLButtonElement>('.cm-md-copyButton')!;
    expect(button.getAttribute('part')).toBe('copy-button');
    expect(button.title).toBe('Copy Table');

    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true });
    button.dispatchEvent(mousedown);
    expect(window.editor.state.selection.main.anchor).toBe(source.length);

    button.click();
    await vi.waitFor(() => expect(button.classList.contains('is-copied')).toBe(true));
    expect(await readBlob(clipboard.items[0]['text/plain'])).toBe('| A | B |\n| --- | --- |\n| one | two |');
    expect(await readBlob(clipboard.items[0]['text/html'])).toMatch(/^<table>.*<td>one<\/td>/s);
  });
});
