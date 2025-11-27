import * as vscode from 'vscode';
import * as path from 'path';
import { generateDeeplink } from './deeplinkGenerator';
import { importDeeplink } from './deeplinkImporter';
import { getFileTypeFromPath, isAllowedExtension, getUserHomePath, getCommandsPath, getCommandsFolderName } from './utils';
import { DeeplinkCodeLensProvider } from './codelensProvider';

/**
 * Helper function to generate deeplink with validations
 */
async function generateDeeplinkWithValidation(
  uri: vscode.Uri | undefined,
  forcedType?: 'command' | 'rule' | 'prompt'
): Promise<void> {
  // If no URI, try to get from active editor
  let filePath: string;
  
  if (uri) {
    filePath = uri.fsPath;
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No file selected');
      return;
    }
    filePath = editor.document.uri.fsPath;
  }

  // Validate extension
  const config = vscode.workspace.getConfiguration('cursorDeeplink');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md']);
  
  if (!isAllowedExtension(filePath, allowedExtensions)) {
    vscode.window.showErrorMessage(
      `File extension is not in the allowed extensions list: ${allowedExtensions.join(', ')}`
    );
    return;
  }

  // Generate deeplink
  const deeplink = await generateDeeplink(filePath, forcedType);
  if (deeplink) {
    // Copy to clipboard
    await vscode.env.clipboard.writeText(deeplink);
    vscode.window.showInformationMessage('Deeplink copied to clipboard!');
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Register CodeLens Provider for all files
  const codeLensProvider = new DeeplinkCodeLensProvider();
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    '*',
    codeLensProvider
  );

  // Generic command to generate deeplink (opens selector)
  const generateCommand = vscode.commands.registerCommand(
    'cursor-deeplink.generate',
    async (uri?: vscode.Uri) => {
      const fileType = await vscode.window.showQuickPick(
        [
          { label: 'Command', value: 'command' as const },
          { label: 'Rule', value: 'rule' as const },
          { label: 'Prompt', value: 'prompt' as const }
        ],
        {
          placeHolder: 'Select the deeplink type'
        }
      );

      if (fileType) {
        await generateDeeplinkWithValidation(uri, fileType.value);
      }
    }
  );

  // Specific command to generate command deeplink
  const generateCommandSpecific = vscode.commands.registerCommand(
    'cursor-deeplink.generate-command',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'command');
    }
  );

  // Specific command to generate rule deeplink
  const generateRuleSpecific = vscode.commands.registerCommand(
    'cursor-deeplink.generate-rule',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'rule');
    }
  );

  // Specific command to generate prompt deeplink
  const generatePromptSpecific = vscode.commands.registerCommand(
    'cursor-deeplink.generate-prompt',
    async (uri?: vscode.Uri) => {
      await generateDeeplinkWithValidation(uri, 'prompt');
    }
  );

  // Command to import deeplink
  const importCommand = vscode.commands.registerCommand(
    'cursor-deeplink.import',
    async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Paste the Cursor deeplink',
        placeHolder: 'cursor://anysphere.cursor-deeplink/... or https://cursor.com/link/...',
        validateInput: (value) => {
          if (!value) {
            return 'Please enter a deeplink';
          }
          if (!value.includes('cursor-deeplink') && !value.includes('cursor.com/link')) {
            return 'Invalid URL. Must be a Cursor deeplink';
          }
          return null;
        }
      });

      if (url) {
        await importDeeplink(url);
      }
    }
  );

  // Command to save command file as user command (in ~/.cursor/commands)
  const saveAsUserCommand = vscode.commands.registerCommand(
    'cursor-deeplink.save-as-user-command',
    async (uri?: vscode.Uri) => {
      try {
        // Get file URI
        let fileUri: vscode.Uri;
        if (uri) {
          fileUri = uri;
        } else {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage('No file selected');
            return;
          }
          fileUri = editor.document.uri;
        }

        const filePath = fileUri.fsPath;
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Verify file is in commands folder (either .cursor/commands/ or .claude/commands/)
        if (!normalizedPath.includes('/.cursor/commands/') && !normalizedPath.includes('/.claude/commands/')) {
          vscode.window.showErrorMessage('This command can only be used on files in .cursor/commands/ or .claude/commands/ folder');
          return;
        }

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage('No workspace open');
          return;
        }

        // Read file content
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        const fileName = path.basename(filePath);

        // Determine destination path using configuration (~/.cursor/commands or ~/.claude/commands)
        const userCommandsPath = getCommandsPath(undefined, true);
        const destinationUri = vscode.Uri.file(path.join(userCommandsPath, fileName));

        // Check if file already exists in destination
        let fileExists = false;
        try {
          await vscode.workspace.fs.stat(destinationUri);
          fileExists = true;
        } catch {
          // File doesn't exist, that's fine
        }

        if (fileExists) {
          const overwrite = await vscode.window.showWarningMessage(
            `File ${fileName} already exists in ~/.cursor/commands. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        // Create destination folder if it doesn't exist
        const folderUri = vscode.Uri.file(userCommandsPath);
        try {
          await vscode.workspace.fs.stat(folderUri);
        } catch {
          // Folder doesn't exist, create it
          await vscode.workspace.fs.createDirectory(folderUri);
        }

        // Write file to destination
        await vscode.workspace.fs.writeFile(destinationUri, fileContent);

        vscode.window.showInformationMessage(`Command saved to ~/.cursor/commands/${fileName}`);

        // Ask if user wants to remove the original file
        const removeOriginal = await vscode.window.showWarningMessage(
          'Do you want to remove the original file from the workspace?',
          'Yes',
          'No'
        );

        if (removeOriginal === 'Yes') {
          try {
            await vscode.workspace.fs.delete(fileUri);
            vscode.window.showInformationMessage('Original file removed from workspace');
          } catch (error) {
            vscode.window.showErrorMessage(`Error removing original file: ${error}`);
          }
        }

        // Open the saved file
        const document = await vscode.workspace.openTextDocument(destinationUri);
        await vscode.window.showTextDocument(document);
      } catch (error) {
        vscode.window.showErrorMessage(`Error saving as user command: ${error}`);
      }
    }
  );

  context.subscriptions.push(
    codeLensDisposable,
    generateCommand,
    generateCommandSpecific,
    generateRuleSpecific,
    generatePromptSpecific,
    importCommand,
    saveAsUserCommand
  );
}

export function deactivate() {}

