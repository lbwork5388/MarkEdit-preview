import { Prec } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { MarkEdit } from 'markedit-api';
import { joinPaths } from '../shared/utils';
import { localized } from '../shared/strings';
import { pastedImageFolder } from '../support/settings';

const extensions: Record<string, string> = {
  'jpeg': 'jpg',
  'svg+xml': 'svg',
  'x-icon': 'ico',
};

/**
 * Save pasted images into a folder next to the document, such as `assets/`, then insert links to them.
 *
 * It runs before other paste handlers (e.g., MarkEdit-enhanced-paste) so that images are saved only once.
 */
export function imagePasteExtension(folder: string | null = pastedImageFolder) {
  if (folder === null || typeof MarkEdit.getFileInfo !== 'function' || typeof MarkEdit.createFile !== 'function') {
    return [];
  }

  // Paste handlers must decide synchronously, so the document path is cached and refreshed in the background
  const plugin = ViewPlugin.fromClass(class {
    hasPath = false;
    lastKeyRefresh = 0;
    private destroyed = false;

    constructor() {
      this.refresh();
    }

    refresh() {
      MarkEdit.getFileInfo().then(info => {
        if (!this.destroyed) {
          this.hasPath = info?.filePath !== undefined;
        }
      }).catch(() => undefined);
    }

    destroy() {
      this.destroyed = true;
    }
  }, {
    eventHandlers: {
      focus() {
        this.refresh();
      },
      keydown() {
        // Untitled documents can be saved at any time, there is no save event to observe
        if (!this.hasPath && Date.now() - this.lastKeyRefresh > 1000) {
          this.lastKeyRefresh = Date.now();
          this.refresh();
        }
      },
    },
  });

  return [plugin, Prec.highest(EditorView.domEventHandlers({
    paste: (event, view) => {
      const files = pastedImageFiles(event.clipboardData);
      if (files.length === 0) {
        return false;
      }

      const cache = view.plugin(plugin);
      cache?.refresh();

      // Untitled documents have no folder yet, keep the default paste behavior instead of dropping the image
      if (cache?.hasPath !== true) {
        return false;
      }

      event.preventDefault();
      insertImages(view, files, folder).catch(error => {
        console.error('Failed to paste images:', error);
        MarkEdit.showAlert(localized('failedToSaveImage'));
      });
      return true;
    },
  }))];
}

/**
 * Image files on the clipboard; rich content (e.g., cells copied from a spreadsheet) is left to other handlers.
 */
export function pastedImageFiles(data: DataTransfer | null) {
  if (data === null || Array.from(data.types).includes('text/html')) {
    return [];
  }

  return Array.from(data.items)
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file?.type.startsWith('image/') ?? false);
}

export async function insertImages(view: EditorView, files: File[], folder: string) {
  const info = await MarkEdit.getFileInfo();
  if (info?.filePath === undefined) {
    // The document lost its path after the paste was accepted
    MarkEdit.showAlert(localized('failedToSaveImage'));
    return;
  }

  const relativeFolder = normalizeFolder(folder, info.filePath);
  const directory = relativeFolder === '' ? info.parentPath : joinPaths(info.parentPath, relativeFolder);
  const existing = await ensureDirectory(info.parentPath, relativeFolder);
  if (existing === undefined) {
    MarkEdit.showAlert(localized('failedToSaveImage'));
    return;
  }

  const names = new Set(existing);
  const links: string[] = [];
  for (const file of files) {
    const name = uniqueFileName(imageFileName(file), names);
    names.add(name);

    const saved = await MarkEdit.createFile({ path: joinPaths(directory, name), data: await base64(file) });
    if (!saved) {
      MarkEdit.showAlert(localized('failedToSaveImage'));
      continue;
    }

    const target = relativeFolder === '' ? name : `${relativeFolder}/${name}`;
    links.push(`![${baseName(name)}](${encodeLinkPath(target)})`);
  }

  if (links.length > 0) {
    view.dispatch(view.state.replaceSelection(links.join('\n')), { scrollIntoView: true, userEvent: 'input.paste' });
  }
}

export function normalizeFolder(folder: string, documentPath: string) {
  const documentName = baseName(documentPath.split('/').pop() ?? '');
  return folder
    .replace(/\$\{filename\}/g, documentName)
    .split('/')
    .filter(segment => segment !== '' && segment !== '.')
    .join('/');
}

export function imageFileName(file: File, date = new Date()) {
  const subtype = file.type.replace(/^image\//, '').toLowerCase();
  const extension = extensions[subtype] ?? (subtype.replace(/[^a-z0-9]/g, '') || 'png');
  const name = file.name.replace(/[/:]/g, '-').trim();

  // Screenshots and copied image data are usually named "image.png"
  if (name === '' || /^image\.[a-z0-9]+$/i.test(name)) {
    const pad = (value: number, length = 2) => String(value).padStart(length, '0');
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`;
    return `image-${stamp}.${extension}`;
  }

  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${extension}`;
}

export function uniqueFileName(name: string, existing: ReadonlySet<string>) {
  if (!existing.has(name)) {
    return name;
  }

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let index = 1; ; index++) {
    const candidate = `${stem}-${index}${extension}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
}

export function encodeLinkPath(path: string) {
  return path.replace(/[ ()<>]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

async function ensureDirectory(parentPath: string, relativeFolder: string) {
  let path = parentPath;
  let files = await MarkEdit.listFiles(path);
  for (const segment of relativeFolder === '' ? [] : relativeFolder.split('/')) {
    path = joinPaths(path, segment);
    files = await MarkEdit.listFiles(path);
    if (files === undefined) {
      if (!await MarkEdit.createFile({ path, isDirectory: true })) {
        return undefined;
      }

      files = [];
    }
  }

  return files;
}

function baseName(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function base64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
