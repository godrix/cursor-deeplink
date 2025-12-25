import * as vscode from 'vscode';
import { isHttpRequestFile } from './utils';

interface RequestSection {
  title: string;
  titleLine: number;
  startLine: number;
  endLine: number;
}

export class HttpCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    // Update CodeLens when files change
    vscode.workspace.onDidChangeConfiguration(() => {
      this._onDidChangeCodeLenses.fire();
    });
    
    // Update CodeLens when documents change
    vscode.workspace.onDidChangeTextDocument(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  /**
   * Parses the document to find request sections (marked with ##)
   */
  private parseRequestSections(document: vscode.TextDocument): RequestSection[] {
    const sections: RequestSection[] = [];
    const lines = document.getText().split('\n');
    
    let currentSection: RequestSection | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if line is a section header (## Title)
      const headerMatch = line.match(/^##\s+(.+)$/);
      if (headerMatch) {
        // Save previous section if exists
        if (currentSection) {
          currentSection.endLine = i - 1;
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          title: headerMatch[1].trim(),
          titleLine: i,
          startLine: i,
          endLine: lines.length - 1 // Will be updated when next section is found
        };
      }
    }
    
    // Add last section if exists
    if (currentSection) {
      currentSection.endLine = lines.length - 1;
      sections.push(currentSection);
    }
    
    return sections;
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    this.codeLenses = [];

    const filePath = document.uri.fsPath;
    
    // Check if the file is an HTTP request file
    if (!isHttpRequestFile(filePath)) {
      return [];
    }

    // Parse sections from document
    const sections = this.parseRequestSections(document);
    
    if (sections.length > 0) {
      // Create CodeLens for each section
      for (const section of sections) {
        const codeLens = new vscode.CodeLens(
          new vscode.Range(section.titleLine, 0, section.titleLine, 0),
          {
            title: `Send Request: ${section.title}`,
            command: 'cursor-commands-toys.sendHttpRequest',
            arguments: [document.uri, section.startLine, section.endLine, section.title]
          }
        );
        this.codeLenses.push(codeLens);
      }
    } else {
      // No sections found, create a single CodeLens for the entire file
      const codeLens = new vscode.CodeLens(
        new vscode.Range(0, 0, 0, 0),
        {
          title: 'Send Request',
          command: 'cursor-commands-toys.sendHttpRequest',
          arguments: [document.uri]
        }
      );
      this.codeLenses.push(codeLens);
    }

    return this.codeLenses;
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }
}

