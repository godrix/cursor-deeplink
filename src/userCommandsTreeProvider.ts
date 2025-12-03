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
   * Recursively reads directory contents and finds all command files
   * @param basePath The base commands folder path (e.g., ~/.cursor/commands/)
   * @param currentPath The current directory being processed
   * @param allowedExtensions Array of allowed file extensions
   * @returns Array of CommandFileItem with relative paths in fileName
   */
  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string,
    allowedExtensions: string[]
  ): Promise<CommandFileItem[]> {
    const commandFiles: CommandFileItem[] = [];
    const currentUri = vscode.Uri.file(currentPath);

    try {
      // Read directory contents
      const entries = await vscode.workspace.fs.readDirectory(currentUri);

      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);

        if (type === vscode.FileType.File) {
          // Check if extension is allowed
          if (isAllowedExtension(itemPath, allowedExtensions)) {
            // Calculate relative path from basePath
            const relativePath = path.relative(basePath, itemPath);
            // Normalize path separators for cross-platform compatibility
            const normalizedRelativePath = relativePath.replace(/\\/g, '/');
            
            const fileUri = vscode.Uri.file(itemPath);
            commandFiles.push({
              uri: fileUri,
              fileName: normalizedRelativePath,
              filePath: itemPath
            });
          }
        } else if (type === vscode.FileType.Directory) {
          // Recursively search in subdirectories
          const subFiles = await this.readDirectoryRecursive(basePath, itemPath, allowedExtensions);
          commandFiles.push(...subFiles);
        }
      }
    } catch (error) {
      // Handle errors (permission denied, etc.) silently for subdirectories
      console.error(`Error reading directory ${currentPath}:`, error);
    }

    return commandFiles;
  }

  /**
   * Gets the children of the tree (all command files in user folder, including subfolders)
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

      // Get allowed extensions from configuration
      const config = vscode.workspace.getConfiguration('cursorDeeplink');
      const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

      // Recursively read all command files
      const commandFiles = await this.readDirectoryRecursive(
        userCommandsPath,
        userCommandsPath,
        allowedExtensions
      );

      // Sort files alphabetically by relative path
      commandFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));

      return commandFiles;
    } catch (error) {
      // Handle errors (folder doesn't exist, permission denied, etc.)
      console.error('Error reading user commands folder:', error);
      return [];
    }
  }
}

