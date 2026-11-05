// @vitest-environment jsdom
import './support';
import { describe, expect, test, vi } from 'vitest';
import { Decoration, Direction, EditorView } from '@codemirror/view';
import { hiddenSyntaxModeExtension, setHiddenSyntaxMode } from '../../src/hiddenSyntax/mode';
import * as editor from '../support/editor';

function mockCoordinates(task = false) {
  vi.spyOn(window.editor, 'coordsForChar').mockReturnValue(null);
  vi.spyOn(window.editor, 'coordsAtPos').mockImplementation(position => {
    const line = window.editor.state.doc.lineAt(position);
    let column = position - line.from;
    if (task && line.number === 1 && column >= 6
      && window.editor.dom.querySelector('.cm-md-syntaxHiddenTaskCheckboxFrame') !== null) {
      column -= 4;
    }

    return {
      left: column * 10,
      right: column * 10,
      top: line.number * 30,
      bottom: line.number * 30 + 20,
    };
  });
}

function lineContaining(text: string) {
  return [...window.editor.contentDOM.querySelectorAll<HTMLElement>('.cm-line')]
    .find(line => line.textContent?.includes(text));
}

function expectIndent(text: string, prefix: string, target: string) {
  const line = lineContaining(text);
  expect(line?.classList.contains('cm-typora-hangingIndent')).toBe(true);
  expect(line?.style.getPropertyValue('--typora-prefix-width')).toBe(prefix);
  expect(line?.style.getPropertyValue('--typora-wrap-indent')).toBe(target);
}

describe('Typora paragraph alignment', () => {
  test('aligns ordered, nested, lazy, and quote continuations without touching ordinary paragraphs', async () => {
    const source = [
      '1. First item with enough content',
      '   Explicit continuation',
      'Lazy continuation',
      '',
      '   Second paragraph',
      '',
      '   - Nested item',
      '     Nested continuation',
      '',
      '2. Next item',
      '',
      '> Quoted paragraph',
      '> Quote continuation',
      '',
      'Ordinary paragraph',
    ].join('\n');
    editor.setUp(source, hiddenSyntaxModeExtension);
    mockCoordinates();
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);

    await vi.waitFor(() => {
      expectIndent('First item', '30px', '30px');
      expectIndent('Explicit continuation', '30px', '30px');
      expectIndent('Lazy continuation', '0px', '30px');
      expectIndent('Second paragraph', '30px', '30px');
      expectIndent('Nested item', '50px', '50px');
      expectIndent('Nested continuation', '50px', '50px');
      expectIndent('Next item', '30px', '30px');
      expectIndent('Quoted paragraph', '20px', '20px');
      expectIndent('Quote continuation', '20px', '20px');
    });
    expect(lineContaining('Ordinary paragraph')?.classList.contains('cm-typora-hangingIndent')).toBe(false);
    expect(window.editor.state.doc.toString()).toBe(source);

    window.editor.dispatch({ changes: { from: 0, to: 1, insert: '123' } });
    await vi.waitFor(() => {
      expectIndent('First item', '50px', '50px');
      expectIndent('Lazy continuation', '0px', '50px');
    });

    await setHiddenSyntaxMode(window.editor, true);
    expect(window.editor.dom.querySelector('.cm-typora-hangingIndent')).toBeNull();
    expect(window.editor.state.doc.toString()).toBe(source.replace('1.', '123.'));
  });

  test('tracks checkbox source visibility and leaves the content editable', async () => {
    const source = '- [ ] First task\n  Task continuation\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    mockCoordinates(true);
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);
    await vi.waitFor(() => {
      expectIndent('First task', '20px', '20px');
      expectIndent('Task continuation', '20px', '20px');
    });

    window.editor.dispatch({ selection: { anchor: source.indexOf('[') + 1 } });
    await vi.waitFor(() => {
      expectIndent('First task', '60px', '60px');
      expectIndent('Task continuation', '20px', '60px');
    });
    expect(window.editor.state.doc.toString()).toBe(source);

    window.editor.dispatch({ selection: { anchor: source.length } });
    await vi.waitFor(() => expectIndent('First task', '20px', '20px'));
  });

  test('overrides a host hanging indent only in Typora mode', async () => {
    const source = '1. Item\n   continuation\n\nEnd';
    const hostIndent = EditorView.decorations.of(Decoration.set([
      Decoration.line({
        class: 'cm-md-contentIndent',
        attributes: { style: 'text-indent: -5px; margin-inline-start: 5px' },
      }).range(0),
    ]));
    editor.setUp(source, [hiddenSyntaxModeExtension, hostIndent]);
    mockCoordinates();
    await setHiddenSyntaxMode(window.editor, true, true);
    await vi.waitFor(() => expectIndent('Item', '30px', '30px'));

    const css = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules])
      .find(rule => rule.cssText.includes('.cm-typoraMode .cm-typora-hangingIndent')) as CSSStyleRule;
    expect(css.style.getPropertyPriority('margin-inline-start')).toBe('important');
    expect(css.style.getPropertyPriority('text-indent')).toBe('important');

    await setHiddenSyntaxMode(window.editor, false);
    const line = lineContaining('Item');
    expect(line?.classList.contains('cm-typora-hangingIndent')).toBe(false);
    expect(line?.style.marginInlineStart).toBe('5px');
    expect(line?.style.textIndent).toBe('-5px');
  });

  test('uses the right edge of a bidirectional marker in right-to-left text', async () => {
    const source = '1. פריט ארוך\n   המשך\n\nסוף';
    editor.setUp(source, hiddenSyntaxModeExtension);
    vi.spyOn(window.editor, 'textDirection', 'get').mockReturnValue(Direction.RTL);
    vi.spyOn(window.editor, 'coordsAtPos').mockImplementation(position => {
      const line = window.editor.state.doc.lineAt(position);
      const x = 100 - (position - line.from) * 10;
      return { left: x, right: x, top: line.number * 30, bottom: line.number * 30 + 20 };
    });
    vi.spyOn(window.editor, 'coordsForChar').mockImplementation(position => {
      const line = window.editor.state.doc.lineAt(position);
      const x = 100 - (position - line.from) * 10;
      return { left: x - 10, right: x, top: line.number * 30, bottom: line.number * 30 + 20 };
    });
    await setHiddenSyntaxMode(window.editor, true, true);
    await vi.waitFor(() => {
      expectIndent('פריט ארוך', '30px', '30px');
      expectIndent('המשך', '30px', '30px');
    });
  });

  test('estimates the task indent when its marker is outside the viewport', async () => {
    const source = '- [ ] Task\n  Continuation\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    window.editor.dispatch({ selection: { anchor: source.length } });
    vi.spyOn(window.editor, 'coordsForChar').mockReturnValue(null);
    vi.spyOn(window.editor, 'coordsAtPos').mockImplementation(position => {
      const line = window.editor.state.doc.lineAt(position);
      if (line.number === 1) {
        return null;
      }

      const x = (position - line.from) * 10;
      return { left: x, right: x, top: line.number * 30, bottom: line.number * 30 + 20 };
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await setHiddenSyntaxMode(window.editor, true, true);

    await vi.waitFor(() => {
      const target = Number.parseFloat(lineContaining('Continuation')?.style.getPropertyValue('--typora-wrap-indent') ?? '');
      expect(Number.isFinite(target)).toBe(true);
      expect(target).toBeGreaterThanOrEqual(1.4 * 16);
    });
    const css = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules])
      .find(rule => rule.cssText.includes('.cm-typoraMode .cm-md-syntaxHiddenTaskCheckboxFrame')
        && (rule as CSSStyleRule).style.getPropertyValue('min-width') === '1.4em');
    expect(css).toBeDefined();
  });

  test('keeps ordered task markers in the off-screen fallback width', async () => {
    const source = '1. [ ] Task\n   Continuation\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    window.editor.dispatch({ selection: { anchor: source.length } });
    vi.spyOn(window.editor, 'coordsForChar').mockReturnValue(null);
    vi.spyOn(window.editor, 'coordsAtPos').mockImplementation(position => {
      const line = window.editor.state.doc.lineAt(position);
      if (line.number === 1) {
        return null;
      }

      const x = (position - line.from) * 10;
      return { left: x, right: x, top: line.number * 30, bottom: line.number * 30 + 20 };
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await setHiddenSyntaxMode(window.editor, true, true);

    await vi.waitFor(() => {
      const target = Number.parseFloat(lineContaining('Continuation')?.style.getPropertyValue('--typora-wrap-indent') ?? '');
      expect(target).toBeCloseTo(window.editor.defaultCharacterWidth * 7, 2);
    });
  });

  test('keeps deeply indented lazy continuations usable in a narrow editor', async () => {
    const source = '123456789. A list item\nLazy continuation\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    Object.defineProperty(window.editor.contentDOM, 'clientWidth', { configurable: true, value: 60 });
    mockCoordinates();
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);

    await vi.waitFor(() => expect(window.editor.coordsAtPos).toHaveBeenCalled());
    expect(lineContaining('Lazy continuation')?.classList.contains('cm-typora-hangingIndent')).toBe(false);
    expect(window.editor.state.doc.toString()).toBe(source);
  });

  test('does not apply paragraph indentation to fenced code inside a list', async () => {
    const source = '1. Introduction\n\n   ```js\n   const item = 1;\n   ```\n\nEnd';
    editor.setUp(source, hiddenSyntaxModeExtension);
    mockCoordinates();
    window.editor.dispatch({ selection: { anchor: source.length } });
    await setHiddenSyntaxMode(window.editor, true, true);

    await vi.waitFor(() => expectIndent('Introduction', '30px', '30px'));
    expect(lineContaining('const item')?.classList.contains('cm-typora-code')).toBe(true);
    expect(lineContaining('const item')?.classList.contains('cm-typora-hangingIndent')).toBe(false);
    expect(window.editor.state.doc.toString()).toBe(source);
  });
});
