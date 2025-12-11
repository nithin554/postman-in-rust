import React from 'react';
import './KeyValuePair.css';

export type Entry = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

type KeyValuePairProps = {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
};

const KeyValuePair = ({ entries, setEntries }: KeyValuePairProps) => {
  const handleEntryChange = (id: string, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
    setEntries(prev =>
      prev.map(entry => (entry.id === id ? { ...entry, [field]: value } : entry))
    );
  };

  const addEntry = () => {
    setEntries(prev => [
      ...prev,
      { id: crypto.randomUUID(), key: '', value: '', enabled: true },
    ]);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(entry => entry.id !== id));
  };

  return (
    <div className="key-value-editor">
      {entries.map(entry => (
        <div key={entry.id} className="key-value-row">
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={e => handleEntryChange(entry.id, 'enabled', e.target.checked)}
          />
          <input
            type="text"
            placeholder="Key"
            value={entry.key}
            onChange={e => handleEntryChange(entry.id, 'key', e.target.value)}
          />
          <input
            type="text"
            placeholder="Value"
            value={entry.value}
            onChange={e => handleEntryChange(entry.id, 'value', e.target.value)}
          />
          <button onClick={() => removeEntry(entry.id)}>&times;</button>
        </div>
      ))}
      <button onClick={addEntry} className="add-btn">
        Add
      </button>
    </div>
  );
};

export default KeyValuePair;
