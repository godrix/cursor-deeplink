import * as vscode from 'vscode';
import * as path from 'path';
import { getCommandsPath, isAllowedExtension } from './utils';

/**
 * Represents a command file in the tree view
 */
export interface CommandFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
}

/**
 * Tree data provider for user commands folder
 */
export class UserCommandsTreeProvider implements vscode.TreeDataProvider<CommandFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommandFileItem | undefined | null | void> = new vscode.EventEmitter<CommandFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CommandFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

  /**
   * Refreshes the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for a given element
   */
  getTreeItem(element: CommandFileItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
    treeItem.resourceUri = element.uri;
    treeItem.command = {
      command: 'cursor-deeplink.openUserCommand',
      title: 'Open Command',
      arguments: [element.uri]
    };
    treeItem.contextValue = 'userCommandFile';
    treeItem.iconPath = vscode.ThemeIcon.File;
    return treeItem;
  }

  /**
   * Gets the children of the tree (all command files in user folder)
   */
  async getChildren(element?: CommandFileItem): Promise<CommandFileItem[]> {
    // This is a flat tree, so no children for individual items
    if (element) {
      return [];
    }

    try {
      // Get user commands folder path
      const userCommandsPath = getCommandsPath(undefined, true);
      const folderUri = vscode.Uri.file(userCommandsPath);

      // Check if folder exists, create if it doesn't
      try {
        await vscode.workspace.fs.stat(folderUri);
      } catch {
        // Folder doesn't exist, create it
        await vscode.workspace.fs.createDirectory(folderUri);
        return [];
      }

      // Read directory contents
      const entries = await vscode.workspace.fs.readDirectory(folderUri);

      // Get allowed extensions from configuration
      const config = vscode.workspace.getConfiguration('cursorDeeplink');
      const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

      // Filter files by allowed extensions
      const commandFiles: CommandFileItem[] = [];
      for (const [name, type] of entries) {
        // Only include files (not directories)
        if (type === vscode.FileType.File) {
          const filePath = path.join(userCommandsPath, name);
          // Check if extension is allowed
          if (isAllowedExtension(filePath, allowedExtensions)) {
            const fileUri = vscode.Uri.file(filePath);
            commandFiles.push({
              uri: fileUri,
              fileName: name,
              filePath: filePath
            });
          }
        }
      }

      // Sort files alphabetically
      commandFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));

      return commandFiles;
    } catch (error) {
      // Handle errors (folder doesn't exist, permission denied, etc.)
      console.error('Error reading user commands folder:', error);
      return [];
    }
  }
}

