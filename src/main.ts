import { Notice, Plugin, TFile } from "obsidian";
import { isInstanceOf, isNotNull, isNotVoid } from "typed-assert";
import { LinkMetadata } from "./types";
import {
  createNotification,
  filterLinksToItemsPresentInText,
  redirectLinksInTextToNewPath,
} from "./utils";

export default class PersistentLinksPlugin extends Plugin {
  sourceFile: TFile | null | undefined;

  async onload() {
    const body = document.querySelector("body");
    isNotNull(body);

    this.registerDomEvent(body, "cut", () => {
      this.sourceFile = this.app.workspace.getActiveFile();
    });

    this.app.workspace.on("editor-paste", this.handleEditorPaste);
  }

  onunload() {
    this.app.workspace.off("editor-paste", this.handleEditorPaste);
  }

  private handleEditorPaste = async (event: ClipboardEvent) => {
    if (!this.sourceFile) {
      return;
    }

    const clipboardContents = event?.clipboardData?.getData("text");

    if (!clipboardContents) {
      return;
    }

    const backlinksToUpdate = filterLinksToItemsPresentInText(
      this.getBacklinksForSourceFile(),
      clipboardContents
    );

    if (backlinksToUpdate.length === 0) {
      return;
    }

    this.runAfterMetadataUpdateIn(this.getActiveFile(), async () => {
      await this.redirectLinksToActiveFile(backlinksToUpdate);

      new Notice(createNotification(backlinksToUpdate));
    });
  };

  private getBacklinksForSourceFile() {
    isNotVoid(this.sourceFile);

    return this.app.metadataCache.getBacklinksForFile(this.sourceFile).data;
  }

  private async redirectLinksToActiveFile(
    links: Array<{ filePath: string; links: LinkMetadata[] }>
  ) {
    return Promise.all(
      links.map(async ({ filePath, links }) => {
        const contents = await this.readFile(filePath);
        const updatedContents = redirectLinksInTextToNewPath(
          links,
          this.getPathToActiveFileFrom(filePath),
          contents
        );

        return this.updateFile(filePath, updatedContents);
      })
    );
  }

  private runAfterMetadataUpdateIn(targetFile: TFile, action: () => void) {
    const callback = (file: TFile) => {
      if (file !== targetFile) {
        return;
      }

      try {
        action();
      } finally {
        this.app.metadataCache.off("changed", callback);
      }
    };

    this.app.metadataCache.on("changed", callback);
  }

  private getFile(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    isInstanceOf(file, TFile);
    return file;
  }

  private async readFile(path: string) {
    return this.app.vault.read(this.getFile(path));
  }

  private async updateFile(path: string, newContents: string) {
    return this.app.vault.modify(this.getFile(path), newContents);
  }

  private getPathToActiveFileFrom(sourcePath: string) {
    return this.app.metadataCache.fileToLinktext(
      this.getActiveFile(),
      sourcePath
    );
  }

  private getActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();
    isNotNull(activeFile);
    return activeFile;
  }
}
