import type { KeyboardEvent } from 'react';

export const INDENT = '  ';

/**
 * Postman-style code editing in plain textareas:
 * - Tab / Shift+Tab indents / outdents the current line (or selection)
 * - Enter auto-indents; adds a level after `{` / `[`, removes one before `}` / `]`
 */
export function codeEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
  const input = event.currentTarget;
  const { value, selectionStart, selectionEnd } = input;

  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();
    insertText(input, INDENT, selectionStart, selectionEnd);
    return;
  }

  if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    if (value.slice(lineStart, lineStart + INDENT.length) === INDENT) {
      const caret = selectionStart - INDENT.length;
      input.setRangeText('', lineStart, lineStart + INDENT.length, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.selectionStart = input.selectionEnd = Math.max(lineStart, caret);
    }
    return;
  }

  if (event.key === 'Enter') {
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const line = value.slice(lineStart, selectionStart);
    const indentMatch = /^[\t ]*/.exec(line);
    let indent = indentMatch ? indentMatch[0] : '';

    const beforeCursor = value.slice(0, selectionStart).trimEnd();
    const afterCursor = value.slice(selectionEnd).trimStart();
    const opensBlock = beforeCursor.endsWith('{') || beforeCursor.endsWith('[');
    const closesBlock = afterCursor.startsWith('}') || afterCursor.startsWith(']');

    if (opensBlock && closesBlock) {
      // Pressing Enter between braces expands them across three lines.
      event.preventDefault();
      insertText(
        input,
        `\n${indent}${INDENT}\n${indent}`,
        selectionStart,
        selectionEnd,
        // place the caret on the middle line
        (next) => {
          next.selectionStart = next.selectionEnd = selectionStart + 1 + indent.length + INDENT.length;
        },
      );
      return;
    }

    if (opensBlock) indent += INDENT;
    event.preventDefault();
    insertText(input, `\n${indent}`, selectionStart, selectionEnd);
    return;
  }
}

function insertText(
  input: HTMLTextAreaElement,
  text: string,
  start: number,
  end: number,
  after?: (input: HTMLTextAreaElement) => void,
): void {
  input.setRangeText(text, start, end, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (after) after(input);
}
