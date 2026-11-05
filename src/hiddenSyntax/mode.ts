import { Compartment, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type * as HiddenSyntax from './index';

const extensionCompartment = new Compartment();
export const hiddenSyntaxModeExtension = extensionCompartment.of([]);

let modeChangeVersion = 0;
export async function setHiddenSyntaxMode(view: EditorView, enabled: boolean, typora = false) {
  const change = ++modeChangeVersion;
  const extension = enabled ? await loadHiddenSyntaxExtension(typora) : [];

  if (change !== modeChangeVersion) {
    return;
  }

  view.dispatch({
    effects: extensionCompartment.reconfigure(extension),
  });
  window.dispatchEvent(new Event('editor-colors-changed'));

  if (enabled) {
    view.requestMeasure();
  }
}

let loadingExtensionPromise: Promise<typeof HiddenSyntax> | undefined;
async function loadHiddenSyntaxExtension(typora: boolean): Promise<Extension> {
  const module = await (loadingExtensionPromise ??= import('./index'));
  return typora ? module.typoraExtension : module.hiddenSyntaxExtension;
}
