import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useToast } from '../state/toasts';
import { prepareRequest } from '../lib/request';
import { buildSnippet, SNIPPET_LANGUAGES, type SnippetLanguage } from '../lib/snippet';
import { Code } from '../lib/highlight';
import { copyText } from '../lib/utils';
import { Button, IconButton } from './ui/primitives';
import { Select } from './ui/Select';
import { Icon } from './ui/Icon';

interface CodePanelProps {
  onClose: () => void;
}

export function CodePanel({ onClose }: CodePanelProps) {
  const { state, activeTab, activeEnvironment } = useStore();
  const { notify } = useToast();
  const [language, setLanguage] = useState<SnippetLanguage>('curl');

  const draft = activeTab?.draft;

  const snippet = useMemo(() => {
    if (!draft) return '';
    const prepared = prepareRequest(draft, activeEnvironment, state.settings, 'snippet');
    return buildSnippet(language, prepared);
  }, [draft, activeEnvironment, state.settings, language]);

  return (
    <aside className="code-pane" aria-label="Code snippet">
      <div className="code-pane-head">
        <span className="code-pane-title">
          <Icon name="code" size={13} />
          Code
        </span>
        <div className="code-pane-actions">
          <Select
            ariaLabel="Snippet language"
            value={language}
            options={SNIPPET_LANGUAGES.map((item) => ({ value: item.id as string, label: item.label }))}
            onChange={(next) => setLanguage(next as SnippetLanguage)}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="copy"
            onClick={() => {
              void copyText(snippet).then((copied) =>
                notify({
                  title: copied ? 'Snippet copied' : 'Could not copy',
                  tone: copied ? 'success' : 'error',
                }),
              );
            }}
          >
            Copy
          </Button>
          <IconButton icon="close" label="Close code panel" onClick={onClose} />
        </div>
      </div>
      <div className="code-pane-body">
        <Code code={snippet} language={language} wrap />
      </div>
      <p className="code-pane-note">
        Snippets resolve variables using the active environment and include auth and headers.
      </p>
    </aside>
  );
}
