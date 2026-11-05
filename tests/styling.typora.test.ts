import { beforeEach, describe, expect, test, vi } from 'vitest';

const settings = vi.hoisted(() => ({ themeName: 'typora' }));
vi.mock('markedit-api', () => ({ MarkEdit: { userSettings: { 'extension.markeditPreview': settings } } }));

beforeEach(() => {
  vi.resetModules();
  settings.themeName = 'typora';
});

describe('Typora preview theme', () => {
  test.each(['light', 'dark', 'auto'] as const)('includes typography and the %s palette', async scheme => {
    const { coreCss, previewThemeCss, previewThemeNames } = await import('../src/styling');
    const css = previewThemeCss(scheme);
    expect(previewThemeNames).toContain('typora');
    expect(css).toContain('calc((100% - 800px) / 2)');
    expect(css).toContain('line-height: 1.75');
    expect(css).toContain('.markdown-body table th');
    if (scheme !== 'dark') {
      expect(css).toContain('--fgColor-default: #333333');
      expect(coreCss(scheme)).toContain('background: #ffffff');
    }
    if (scheme !== 'light') {
      expect(css).toContain('--fgColor-default: #d9d9d9');
      expect(coreCss(scheme)).toContain('background: #262626');
    }
    expect(css.includes('@media (prefers-color-scheme: dark)')).toBe(scheme === 'auto');
  });

  test('uses the same theme for inline rendered content', async () => {
    const { editorThemeCss } = await import('../src/styling');
    expect(editorThemeCss('typora', false)).toContain('--fgColor-default: #333333');
    expect(editorThemeCss('typora', true)).toContain('--bgColor-default: #262626');
  });

  test('leaves GitHub and raw HTML styling unchanged', async () => {
    settings.themeName = 'github';
    let styling = await import('../src/styling');
    expect(styling.previewThemeCss()).not.toContain('calc((100% - 800px) / 2)');
    vi.resetModules();
    settings.themeName = 'none';
    styling = await import('../src/styling');
    expect(styling.coreCss()).toBe('');
    expect(styling.previewThemeCss()).not.toContain('line-height: 1.75');
  });
});
