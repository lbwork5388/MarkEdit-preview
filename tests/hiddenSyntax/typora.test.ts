// @vitest-environment jsdom
import { editorText } from './support';
import { describe, expect, test, vi } from 'vitest';
import { EditorView, lineNumbers } from '@codemirror/view';
import { inlineRenderingConfig } from '../../src/hiddenSyntax/config';
import { hiddenSyntaxModeExtension, setHiddenSyntaxMode } from '../../src/hiddenSyntax/mode';
import * as editor from '../support/editor';

describe('Typora editor mode', () => {
  test('toggles typography without changing text, selection, or Mixed mode', async () => {
    const source = '# Title\n\n## Section\n\nText **bold** and `code`.\n\nEnd';
    editor.setUp(source, [hiddenSyntaxModeExtension, lineNumbers()]);
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);

    expect(window.editor.dom.classList.contains('cm-typoraMode')).toBe(true);
    expect(window.editor.dom.classList.contains('cm-md-syntaxHiddenMode')).toBe(true);
    expect(window.editor.dom.querySelector('.cm-typora-h1')?.textContent).toBe('# Title');
    expect(window.editor.dom.querySelector('.cm-typora-h2')?.textContent).toBe('## Section');
    expect(editorText()).toContain('Text bold and code.');
    expect(window.editor.state.doc.toString()).toBe(source);
    expect(window.editor.state.selection.main.anchor).toBe(source.length);
    expect(getComputedStyle(window.editor.dom.querySelector('.cm-gutters')!).display).toBe('none');
    expect(window.editor.state.facet(inlineRenderingConfig)).toEqual(['image', 'table', 'math', 'mermaid']);

    window.editor.dispatch({ selection: { anchor: 3 } });
    expect(editorText()).toContain('# Title');

    await setHiddenSyntaxMode(window.editor, true);
    expect(window.editor.dom.classList.contains('cm-typoraMode')).toBe(false);
    expect(window.editor.dom.querySelector('.cm-typora-h1')).toBeNull();
    expect(window.editor.state.facet(inlineRenderingConfig)).toEqual(['math', 'mermaid']);
    expect(window.editor.dom.classList.contains('cm-md-syntaxHiddenMode')).toBe(true);

    await setHiddenSyntaxMode(window.editor, false);
    expect(editorText()).toBe(source);
    expect(window.editor.dom.classList.contains('cm-md-syntaxHiddenMode')).toBe(false);
  });

  test('styles Setext headings, fenced and indented code, and nested quotes', async () => {
    const source = 'Title\n=====\n\nSection\n-------\n\n~~~js\nconst n = 1;\n~~~\n\n    indented\n\n> Quote\n> > Nested\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    await setHiddenSyntaxMode(window.editor, true, true);
    window.editor.dispatch({ selection: { anchor: source.length } });

    expect(window.editor.dom.querySelector('.cm-typora-h1')?.textContent).toBe('Title');
    expect(window.editor.dom.querySelector('.cm-typora-h2')?.textContent).toBe('Section');
    expect(window.editor.dom.querySelector('.cm-md-syntaxHiddenSetextUnderline.cm-typora-heading')).toBeNull();
    expect(window.editor.dom.querySelectorAll('.cm-typora-code')).toHaveLength(4);
    expect(window.editor.dom.querySelector('.cm-typora-codeStart')?.textContent).toBe('~~~js');
    expect(window.editor.dom.querySelectorAll('.cm-typora-quote')).toHaveLength(2);

    window.editor.dispatch({ changes: { from: 0, to: 11, insert: 'Plain\n' } });
    expect(window.editor.dom.querySelector('.cm-typora-h1')).toBeNull();
  });

  test('uses the dark Typora palette for inline tables', async () => {
    const source = '| A | B |\n| --- | --- |\n| one | two |\n\nEnd';
    editor.setUp(source, [hiddenSyntaxModeExtension, EditorView.darkTheme.of(true)]);
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);
    const table = () => window.editor.dom.querySelector('.cm-md-syntaxHiddenTable');
    await vi.waitFor(() => expect(table()?.shadowRoot?.querySelector('table')).toBeTruthy());
    expect(table()?.shadowRoot?.querySelector('style')?.textContent).toContain('--bgColor-default: #262626');
    expect(getComputedStyle(window.editor.dom).getPropertyValue('--typora-background')).toBe('#262626');
    expect(window.editor.state.doc.toString()).toBe(source);
    expect(window.editor.dom.style.cssText).not.toContain('background');
  });

  test('keeps the most recent mode when lazy loading races', async () => {
    editor.setUp('# Title', hiddenSyntaxModeExtension);
    const typora = setHiddenSyntaxMode(window.editor, true, true);
    await setHiddenSyntaxMode(window.editor, true);
    await typora;
    expect(window.editor.dom.classList.contains('cm-typoraMode')).toBe(false);
    expect(window.editor.dom.classList.contains('cm-md-syntaxHiddenMode')).toBe(true);
  });
});
