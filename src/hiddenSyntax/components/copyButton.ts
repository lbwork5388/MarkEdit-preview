import { MarkEdit } from 'markedit-api';
import { localized } from '../../shared/strings';

export const copyFeedbackDuration = 1500;

const copyIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const checkIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

export type CopyPayload = { text: string; html?: string } | undefined;

/**
 * A copy button that shows a check mark for a moment after copying succeeds.
 */
export function createCopyButton(title: string, payload: () => CopyPayload) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cm-md-copyButton';
  button.innerHTML = copyIcon;
  button.title = title;
  button.setAttribute('aria-label', title);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    timer = undefined;
    button.classList.remove('is-copied');
    button.innerHTML = copyIcon;
    button.title = title;
    button.setAttribute('aria-label', title);
  };

  // Keep the editor selection where it is
  button.addEventListener('mousedown', event => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    const content = payload();
    if (content === undefined) {
      return;
    }

    const types: Record<string, Blob> = { 'text/plain': new Blob([content.text], { type: 'text/plain' }) };
    if (content.html !== undefined) {
      types['text/html'] = new Blob([content.html], { type: 'text/html' });
    }

    // Deliberately keep clipboard.write synchronous for #174
    navigator.clipboard.write([new ClipboardItem(types)]).then(() => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }

      button.classList.add('is-copied');
      button.innerHTML = checkIcon;
      button.title = localized('copied');
      button.setAttribute('aria-label', button.title);
      timer = setTimeout(reset, copyFeedbackDuration);
    }).catch(error => {
      console.error('Failed to copy:', error);
      MarkEdit.showAlert(localized('failedToCopy'));
    });
  });

  return button;
}

export const copyButtonCss = `
  .cm-md-copyButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 26px;
    height: 26px;
    padding: 5px;
    margin: 0;
    border: 1px solid var(--copy-border, color-mix(in srgb, currentColor 20%, transparent));
    border-radius: 6px;
    background: var(--copy-background, Canvas);
    color: var(--copy-color, GrayText);
    font: inherit;
    line-height: 1;
    cursor: pointer;
    opacity: 0.55;
    transition: opacity 0.15s, color 0.15s, border-color 0.15s;
  }
  .cm-md-copyButton:hover { opacity: 1; }
  .cm-md-copyButton svg { width: 14px; height: 14px; pointer-events: none; }
  .cm-md-copyButton.is-copied { opacity: 1; color: #2da44e; border-color: #2da44e; }
`;
