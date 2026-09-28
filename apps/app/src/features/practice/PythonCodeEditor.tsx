import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';

interface PythonCodeEditorProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
}

const remoraEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'rgb(var(--rm-surface-muted))',
    color: 'rgb(var(--rm-fg))',
    fontSize: '0.875rem',
  },
  '&.cm-focused': {
    outline: '2px solid rgb(var(--rm-primary))',
    outlineOffset: '-2px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--rm-font-mono)',
    lineHeight: '1.5rem',
    minHeight: '18rem',
  },
  '.cm-content': {
    caretColor: 'rgb(var(--rm-primary))',
    padding: '1.25rem 0',
  },
  '.cm-line': { padding: '0 1rem' },
  '.cm-gutters': {
    backgroundColor: 'rgb(var(--rm-surface))',
    color: 'rgb(var(--rm-fg-subtle))',
    borderRight: '1px solid rgb(var(--rm-border))',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'rgb(var(--rm-primary-subtle) / 0.55)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgb(var(--rm-primary) / 0.24) !important',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--rm-primary))' },
});

const remoraHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.bool, tags.null],
    color: 'rgb(var(--rm-primary))',
  },
  { tag: [tags.string, tags.special(tags.string)], color: 'rgb(var(--rm-success))' },
  { tag: [tags.number, tags.atom], color: 'rgb(var(--rm-accent))' },
  { tag: [tags.comment, tags.meta], color: 'rgb(var(--rm-fg-subtle))', fontStyle: 'italic' },
  {
    tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
    fontWeight: '600',
  },
  { tag: tags.invalid, color: 'rgb(var(--rm-danger))', textDecoration: 'underline' },
]);

export function PythonCodeEditor({ value, disabled, onChange, onRun }: PythonCodeEditorProps) {
  const extensions = useMemo(
    () => [
      python(),
      syntaxHighlighting(remoraHighlightStyle),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'Код решения' }),
      keymap.of([indentWithTab]),
    ],
    [],
  );

  return (
    <CodeMirror
      value={value}
      basicSetup={{
        autocompletion: false,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        lineNumbers: true,
      }}
      extensions={extensions}
      theme={remoraEditorTheme}
      editable={!disabled}
      readOnly={disabled}
      onChange={onChange}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          if (!disabled && value.trim()) onRun();
        }
      }}
    />
  );
}
