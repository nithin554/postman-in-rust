import type { CollectionNode } from '../types';
import { uid } from './utils';

export function findNode(
  nodes: CollectionNode[],
  id: string,
): CollectionNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === 'folder' && node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function insertNode(
  nodes: CollectionNode[],
  parentId: string | null,
  node: CollectionNode,
): CollectionNode[] {
  if (!parentId) return [...nodes, node];
  return nodes.map((current) => {
    if (current.type !== 'folder') return current;
    if (current.id === parentId) {
      return { ...current, children: [...(current.children ?? []), node] };
    }
    return {
      ...current,
      children: insertNode(current.children ?? [], parentId, node),
    };
  });
}

export function updateNode(
  nodes: CollectionNode[],
  id: string,
  updater: (node: CollectionNode) => CollectionNode,
): CollectionNode[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    if (node.type === 'folder' && node.children) {
      return { ...node, children: updateNode(node.children, id, updater) };
    }
    return node;
  });
}

export function removeNode(
  nodes: CollectionNode[],
  id: string,
): CollectionNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) =>
      node.type === 'folder' && node.children
        ? { ...node, children: removeNode(node.children, id) }
        : node,
    );
}

export function findParentId(
  nodes: CollectionNode[],
  id: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const node of nodes) {
    if (node.id === id) return parentId;
    if (node.type === 'folder' && node.children) {
      const found = findParentId(node.children, id, node.id);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function duplicateNodeDeep(node: CollectionNode): CollectionNode {
  if (node.type === 'folder') {
    return {
      ...node,
      id: uid(),
      name: `${node.name} copy`,
      children: (node.children ?? []).map(duplicateNodeDeep),
    };
  }
  return {
    ...node,
    id: uid(),
    name: `${node.name} copy`,
    request: node.request ? structuredClone(node.request) : undefined,
  };
}

export function countRequests(nodes: CollectionNode[]): number {
  return nodes.reduce((total, node) => {
    if (node.type === 'request') return total + 1;
    return total + countRequests(node.children ?? []);
  }, 0);
}

export interface FlatRequest {
  collectionId: string;
  node: CollectionNode;
}

export function filterNodes(
  nodes: CollectionNode[],
  query: string,
): CollectionNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;

  return nodes.flatMap((node) => {
    const nameMatches = node.name.toLowerCase().includes(needle);
    if (node.type === 'request') {
      const urlMatches = node.request?.url.toLowerCase().includes(needle) ?? false;
      return nameMatches || urlMatches ? [node] : [];
    }

    const children = filterNodes(node.children ?? [], query);
    if (nameMatches) return [node];
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

export function collectRequests(
  nodes: CollectionNode[],
  collectionId: string,
): FlatRequest[] {
  const requests: FlatRequest[] = [];
  const walk = (list: CollectionNode[]) => {
    list.forEach((node) => {
      if (node.type === 'request') {
        requests.push({ collectionId, node });
      } else {
        walk(node.children ?? []);
      }
    });
  };
  walk(nodes);
  return requests;
}

export function updateNodeName(name: string): string {
  return name.trim() || 'Untitled';
}
