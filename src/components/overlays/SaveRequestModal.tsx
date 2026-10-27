import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionNode, TabState } from '../../types';
import { findParentId } from '../../lib/tree';
import { deriveRequestName } from '../../lib/utils';
import { useStore } from '../../state/store';
import { useToast } from '../../state/toasts';
import { Button, Field, IconButton, Modal, TextInput } from '../ui/primitives';
import { Icon } from '../ui/Icon';

interface SaveRequestModalProps {
  open: boolean;
  tab: TabState | null;
  onClose: () => void;
}

interface FolderOption {
  id: string;
  label: string;
  depth: number;
}

function folderOptions(nodes: CollectionNode[], depth = 0): FolderOption[] {
  return nodes.flatMap((node) => {
    if (node.type !== 'folder') return [];
    return [
      { id: node.id, label: node.name, depth },
      ...folderOptions(node.children ?? [], depth + 1),
    ];
  });
}

export function SaveRequestModal({ open, tab, onClose }: SaveRequestModalProps) {
  const { state, actions } = useStore();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !tab) {
      initializedFor.current = null;
      return;
    }
    if (initializedFor.current === tab.id) return;
    initializedFor.current = tab.id;
    const savedRef = tab.savedRef;
    setName(tab.name && tab.name !== 'Untitled request' ? tab.name : deriveRequestName(tab.draft.url));
    setCollectionId(savedRef?.collectionId ?? state.collections[0]?.id ?? null);
    setCreatingCollection(state.collections.length === 0);

    let parent: string | null = null;
    if (savedRef) {
      const collection = state.collections.find(
        (candidate) => candidate.id === savedRef.collectionId,
      );
      if (collection) parent = findParentId(collection.nodes, savedRef.nodeId) ?? null;
    }
    setParentId(parent);
  }, [open, tab, state.collections]);

  const collection = useMemo(
    () => state.collections.find((candidate) => candidate.id === collectionId) ?? null,
    [state.collections, collectionId],
  );

  const folders = useMemo(
    () => (collection ? folderOptions(collection.nodes) : []),
    [collection],
  );

  const overwriteId =
    tab?.savedRef && tab.savedRef.collectionId === collectionId
      ? tab.savedRef.nodeId
      : null;

  const commit = (asNew: boolean) => {
    if (!tab) return;
    if (!name.trim()) {
      notify({ title: 'Name the request before saving', tone: 'warning' });
      return;
    }
    if (!collectionId) {
      notify({ title: 'Choose a collection', tone: 'warning' });
      return;
    }
    actions.saveTab(tab.id, {
      collectionId,
      parentId,
      name: name.trim(),
      existingNodeId: asNew ? null : overwriteId,
    });
    onClose();
  };

  const createCollection = () => {
    const created = actions.createCollection(newCollectionName || 'New collection');
    setCollectionId(created.id);
    setParentId(null);
    setCreatingCollection(false);
    setNewCollectionName('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="save"
      title="Save request"
      subtitle="Keep this request in a collection so you can find it later."
      width={540}
      footer={
        <div className="modal-footer-split">
          <span className="muted small">{overwriteId ? 'Updating the saved request' : 'Creates a new request'}</span>
          <div className="modal-footer-actions">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {overwriteId ? (
              <Button variant="default" onClick={() => commit(true)}>
                Save as new
              </Button>
            ) : null}
            <Button variant="primary" icon="save" onClick={() => commit(false)}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="form-stack">
        <Field label="Request name">
          <TextInput
            value={name}
            autoFocus
            placeholder="List users"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(false);
            }}
          />
        </Field>

        <Field label="Collection">
          {creatingCollection ? (
            <div className="inline-create">
              <TextInput
                value={newCollectionName}
                placeholder="Collection name"
                onChange={(event) => setNewCollectionName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createCollection();
                }}
              />
              <Button size="sm" variant="primary" icon="check" onClick={createCollection}>
                Create
              </Button>
              {state.collections.length > 0 ? (
                <IconButton
                  icon="close"
                  label="Cancel new collection"
                  onClick={() => setCreatingCollection(false)}
                />
              ) : null}
            </div>
          ) : (
            <div className="inline-create">
              <div className="select-wrap">
                <select
                  value={collectionId ?? ''}
                  onChange={(event) => {
                    setCollectionId(event.target.value || null);
                    setParentId(null);
                  }}
                >
                  {state.collections.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" size={13} />
              </div>
              <Button size="sm" variant="default" icon="plus" onClick={() => setCreatingCollection(true)}>
                New
              </Button>
            </div>
          )}
        </Field>

        {collection ? (
          <Field label="Folder" hint={folders.length === 0 ? 'This collection has no folders yet.' : undefined}>
            <div className="select-wrap">
              <select
                value={parentId ?? ''}
                onChange={(event) => setParentId(event.target.value || null)}
                disabled={folders.length === 0}
              >
                <option value="">Top level</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {`${'  '.repeat(folder.depth)}${folder.depth > 0 ? '└ ' : ''}${folder.label}`}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" size={13} />
            </div>
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
