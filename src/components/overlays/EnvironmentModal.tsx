import { useEffect, useState } from 'react';
import type { Environment, KeyValue } from '../../types';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toasts';
import { Button, Field, Modal, TextInput } from '../ui/primitives';
import { KeyValueRows } from '../ui/KeyValueRows';

interface EnvironmentModalProps {
  open: boolean;
  environment: Environment | null;
  onClose: () => void;
}

export function EnvironmentModal({
  open,
  environment,
  onClose,
}: EnvironmentModalProps) {
  const { actions } = useStore();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [variables, setVariables] = useState<KeyValue[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(environment?.name ?? '');
    setVariables(environment?.variables ?? []);
  }, [open, environment]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      notify({ title: 'Give the environment a name', tone: 'warning' });
      return;
    }

    if (environment) {
      actions.updateEnvironment({ ...environment, name: trimmed, variables });
      notify({ title: 'Environment updated', tone: 'success' });
    } else {
      const created = actions.createEnvironment(trimmed);
      actions.updateEnvironment({ ...created, name: trimmed, variables });
      actions.setActiveEnvironment(created.id);
      notify({ title: 'Environment created', tone: 'success' });
    }
    onClose();
  };

  const remove = () => {
    if (!environment) return;
    if (!window.confirm(`Delete the “${environment.name}” environment?`)) return;
    actions.deleteEnvironment(environment.id);
    notify({ title: 'Environment deleted', tone: 'info' });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="globe"
      title={environment ? 'Edit environment' : 'New environment'}
      subtitle="Variables are referenced anywhere as {{name}}."
      width={620}
      footer={
        <div className="modal-footer-split">
          {environment ? (
            <Button variant="ghost" icon="trash" onClick={remove} className="btn-danger-ghost">
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="modal-footer-actions">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" onClick={save}>
              {environment ? 'Save changes' : 'Create environment'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="form-stack">
        <Field label="Name">
          <TextInput
            value={name}
            autoFocus
            placeholder="Staging"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
            }}
          />
        </Field>

        <div className="section-label">
          <span>Variables</span>
          <span className="muted">{variables.length} total</span>
        </div>

        <KeyValueRows
          rows={variables}
          onChange={setVariables}
          keyPlaceholder="Variable"
          valuePlaceholder="Value"
          secretToggle
          addLabel="Add variable"
          emptyHint="Use the lock to mask sensitive values."
        />

        <p className="form-note">
          Tip: Courier also supports dynamic values like{' '}
          <code>{'{{$timestamp}}'}</code>, <code>{'{{$uuid}}'}</code> and{' '}
          <code>{'{{$randomInt}}'}</code>.
        </p>
      </div>
    </Modal>
  );
}
