import { useMemo } from 'react';
import type { KeyValue } from '../../types';
import { emptyRow } from '../../lib/utils';
import { IconButton } from './primitives';
import { Icon } from './Icon';

interface KeyValueRowsProps {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  secretToggle?: boolean;
  addLabel?: string;
  emptyHint?: string;
}

function isEmpty(row: KeyValue): boolean {
  return !row.key.trim() && !row.value.trim();
}

function clean(rows: KeyValue[]): KeyValue[] {
  const next = [...rows];
  while (next.length > 1 && isEmpty(next[next.length - 1])) next.pop();
  return next.length === 0 ? [emptyRow()] : next;
}

export function KeyValueRows({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  secretToggle = false,
  addLabel = 'Add row',
  emptyHint,
}: KeyValueRowsProps) {
  const display = useMemo(() => {
    const last = rows[rows.length - 1];
    if (!last || !isEmpty(last)) return [...rows, emptyRow()];
    return rows;
  }, [rows]);

  const update = (index: number, patch: Partial<KeyValue>) => {
    const next = display.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
    onChange(clean(next));
  };

  const remove = (index: number) => {
    onChange(clean(display.filter((_, rowIndex) => rowIndex !== index)));
  };

  return (
    <div className="kv">
      <div className="kv-head">
        <span className="kv-check" />
        <span>{keyPlaceholder}</span>
        <span>{valuePlaceholder}</span>
        <span className="kv-actions" />
      </div>
      {display.map((row, index) => {
        const hidden = secretToggle && row.secret && row.value.length > 0;
        return (
          <div className="kv-row" key={row.id}>
            <label className="kv-check" title="Include this row">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(event) => update(index, { enabled: event.target.checked })}
              />
            </label>
            <input
              className="kv-input kv-key"
              value={row.key}
              placeholder={keyPlaceholder}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update(index, { key: event.target.value })}
            />
            <input
              className="kv-input"
              value={row.value}
              placeholder={valuePlaceholder}
              spellCheck={false}
              autoComplete="off"
              type={hidden ? 'password' : 'text'}
              onChange={(event) => update(index, { value: event.target.value })}
            />
            <span className="kv-actions">
              {secretToggle ? (
                <IconButton
                  icon={row.secret ? 'lock' : 'eye'}
                  label={row.secret ? 'Treat as plain text' : 'Hide value'}
                  size={13}
                  className={row.secret ? 'is-active' : undefined}
                  onClick={() => update(index, { secret: !row.secret })}
                />
              ) : null}
              <IconButton
                icon="close"
                label="Remove row"
                size={13}
                onClick={() => remove(index)}
              />
            </span>
          </div>
        );
      })}
      <div className="kv-foot">
        <button
          type="button"
          className="kv-add"
          onClick={() => onChange(clean([...display, emptyRow()]))}
        >
          <Icon name="plus" size={12} />
          {addLabel}
        </button>
        {emptyHint ? <span className="kv-hint">{emptyHint}</span> : null}
      </div>
    </div>
  );
}
