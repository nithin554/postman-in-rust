import { exportJsonFile, importJsonFile } from './api';
import { parseImportFile, workspaceToJson, type ImportResult } from './postman';
import type { WorkspaceFile } from '../types';

export async function importFromFile(): Promise<ImportResult | null> {
  const file = await importJsonFile();
  if (!file) return null;
  return parseImportFile(file.contents);
}

export async function exportWorkspaceFile(workspace: WorkspaceFile): Promise<string | null> {
  return exportJsonFile('courier-workspace.json', workspaceToJson(workspace));
}
