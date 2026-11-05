// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  encodeLinkPath,
  imageFileName,
  imagePasteExtension,
  insertImages,
  normalizeFolder,
  pastedImageFiles,
  uniqueFileName,
} from '../src/features/imagePaste';

const api = vi.hoisted((): {
  files: Map<string, string[]>;
  created: { path: string; data?: string; isDirectory?: boolean }[];
  filePath: string | undefined;
} => ({
  files: new Map(),
  created: [],
  filePath: '/Users/me/Notes/My Note.md',
}));

vi.mock('markedit-api', () => ({
  MarkEdit: {
    getFileInfo: vi.fn(async () => api.filePath === undefined
      ? undefined
      : { filePath: api.filePath, parentPath: api.filePath.slice(0, api.filePath.lastIndexOf('/')) }),
    listFiles: vi.fn(async (path: string) => api.files.get(path)),
    createFile: vi.fn(async (options: { path: string; data?: string; isDirectory?: boolean }) => {
      api.created.push(options);
      const parent = options.path.slice(0, options.path.lastIndexOf('/'));
      const name = options.path.slice(parent.length + 1);
      api.files.set(parent, [...api.files.get(parent) ?? [], name]);
      if (options.isDirectory === true) {
        api.files.set(options.path, []);
      }
      return true;
    }),
    showAlert: vi.fn(),
    playSystemBeep: vi.fn(),
  },
}));

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

function dataTransfer(files: File[], types = ['Files']) {
  return {
    types,
    items: files.map(file => ({ kind: 'file', getAsFile: () => file })),
  } as unknown as DataTransfer;
}

const screenshot = () => new File([new Uint8Array([1, 2, 3])], 'image.png', { type: 'image/png' });
let view: EditorView;

beforeEach(() => {
  api.files = new Map([['/Users/me/Notes', ['My Note.md']]]);
  api.created = [];
  api.filePath = '/Users/me/Notes/My Note.md';
  view = new EditorView({ state: EditorState.create({ doc: 'Before  After', selection: { anchor: 7 } }), parent: document.body });
});

afterEach(() => {
  view.destroy();
});

describe('Image paste', () => {
  test('names, folders, and links', () => {
    const date = new Date(2026, 10, 5, 9, 8, 7, 6);
    expect(imageFileName(screenshot(), date)).toBe('image-20261105090807006.png');
    expect(imageFileName(new File([], '', { type: 'image/jpeg' }), date)).toBe('image-20261105090807006.jpg');
    expect(imageFileName(new File([], 'photo.HEIC', { type: 'image/heic' }))).toBe('photo.HEIC');
    expect(imageFileName(new File([], 'a/b:c', { type: 'image/svg+xml' }))).toBe('a-b-c.svg');
    expect(uniqueFileName('a.png', new Set(['a.png', 'a-1.png']))).toBe('a-2.png');
    expect(uniqueFileName('a.png', new Set())).toBe('a.png');
    expect(normalizeFolder('./assets/', '/x/doc.md')).toBe('assets');
    expect(normalizeFolder('${filename}.assets', '/x/My Doc.md')).toBe('My Doc.assets');
    expect(normalizeFolder('.', '/x/doc.md')).toBe('');
    expect(encodeLinkPath('My Doc.assets/a (1).png')).toBe('My%20Doc.assets/a%20%281%29.png');
  });

  test('only takes plain image pastes', () => {
    const image = screenshot();
    const text = new File([], 'a.txt', { type: 'text/plain' });
    expect(pastedImageFiles(dataTransfer([image, text]))).toEqual([image]);
    expect(pastedImageFiles(dataTransfer([image], ['Files', 'text/html']))).toEqual([]);
    expect(pastedImageFiles(null)).toEqual([]);
  });

  test('saves into a new assets folder and inserts relative links', async () => {
    await insertImages(view, [screenshot(), screenshot()], 'assets');

    expect(api.created[0]).toEqual({ path: '/Users/me/Notes/assets', isDirectory: true });
    const images = api.created.slice(1);
    expect(images).toHaveLength(2);
    expect(images[0].path).toMatch(/^\/Users\/me\/Notes\/assets\/image-\d{17}\.png$/);
    expect(images[1].path).not.toBe(images[0].path);
    expect(images[0].data).toBe('AQID');

    const names = images.map(image => image.path.split('/').pop()!.replace('.png', ''));
    expect(view.state.doc.toString()).toBe(`Before ![${names[0]}](assets/${names[0]}.png)\n![${names[1]}](assets/${names[1]}.png) After`);
  });

  test('reuses existing folders, avoids name clashes, and supports the document name', async () => {
    api.files.set('/Users/me/Notes/My Note.assets', ['photo.png']);
    await insertImages(view, [new File([], 'photo.png', { type: 'image/png' })], '${filename}.assets');

    expect(api.created).toEqual([{ path: '/Users/me/Notes/My Note.assets/photo-1.png', data: '' }]);
    expect(view.state.doc.toString()).toBe('Before ![photo-1](My%20Note.assets/photo-1.png) After');
  });

  test('ignores untitled documents', async () => {
    api.filePath = undefined;
    await insertImages(view, [screenshot()], 'assets');
    expect(api.created).toEqual([]);
    expect(view.state.doc.toString()).toBe('Before  After');
  });

  test('leaves image pastes in untitled documents to the default handlers', async () => {
    view.destroy();
    api.filePath = undefined;
    const later = vi.fn(() => false);
    view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [EditorView.domEventHandlers({ paste: later }), imagePasteExtension('assets')],
      }),
      parent: document.body,
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: { ...dataTransfer([screenshot()]), getData: () => '' } });
    view.contentDOM.dispatchEvent(event);

    expect(later).toHaveBeenCalledTimes(1);
    expect(api.created).toEqual([]);
    expect(view.state.doc.toString()).toBe('');

    // Once saved, the next paste is handled again
    api.filePath = '/Users/me/Notes/My Note.md';
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    const next = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(next, 'clipboardData', { value: dataTransfer([screenshot()]) });
    view.contentDOM.dispatchEvent(next);

    expect(next.defaultPrevented).toBe(true);
    expect(later).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(view.state.doc.toString()).toMatch(/^!\[image-\d{17}\]\(assets\/image-\d{17}\.png\)$/));
  });

  test('handles paste events before other handlers', async () => {
    view.destroy();
    const later = vi.fn(() => false);
    view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [EditorView.domEventHandlers({ paste: later }), imagePasteExtension('assets')],
      }),
      parent: document.body,
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: dataTransfer([screenshot()]) });
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(view.state.doc.toString()).toMatch(/^!\[image-\d{17}\]\(assets\/image-\d{17}\.png\)$/));

    const disabled = new EditorView({
      state: EditorState.create({ extensions: imagePasteExtension(null) }),
      parent: document.body,
    });
    const created = api.created.length;
    const ignored = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(ignored, 'clipboardData', { value: { ...dataTransfer([screenshot()]), getData: () => '' } });
    disabled.contentDOM.dispatchEvent(ignored);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(api.created).toHaveLength(created);
    expect(disabled.state.doc.toString()).toBe('');
    disabled.destroy();
  });
});
