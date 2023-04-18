import { Editor, LinkCache, Notice, Plugin, TFile } from "obsidian";
import { isInstanceOf, isNotNull, isNotVoid } from "typed-assert";
import { BrokenLinkResult } from "./types";
import {
  createRepairNotice,
  createUpdateNotice,
  filterLinksToItemsPresentInText,
  isSubpathInMetadata,
  parseLinkText,
  redirectLinksInTextToNewPaths,
} from "./utils";

export default class PersistentLinksPlugin extends Plugin {
  sourceFile: TFile | null | undefined;

  async onload() {
    this.addCommand({
      id: "repair-links-in-file",
      name: "Repair links in file",
      editorCallback: (editor) => {
        this.repairLinksInFile(editor);
      },
    });

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

  private repairLinksInFile(editor: Editor) {
    const activeFileCache = this.app.metadataCache.getFileCache(
      this.getActiveFile()
    );

    if (!activeFileCache) {
      new Notice("Nothing to fix");
      return;
    }

    const { links = [], embeds = [] } = activeFileCache;

    const { fixable, broken } = this.findNewPathsForBrokenLinks([
      ...links,
      ...embeds,
    ]);

    if (fixable.length > 0) {
      editor.setValue(
        redirectLinksInTextToNewPaths(fixable, editor.getValue())
      );
    }

    new Notice(createRepairNotice(fixable.length, broken.length));
  }

  private findNewPathsForBrokenLinks(links: LinkCache[]) {
    return links
      .map((link) => ({ link, ...parseLinkText(link.link) }))
      .filter(({ subpath }) => subpath)
      .filter(this.isLinkPathBroken)
      .map(({ link, subpath }) => ({
        link,
        newPath: this.findFileWithSubpathInCache(subpath),
      }))
      .reduce(
        (result: BrokenLinkResult, { link, newPath }) => {
          newPath
            ? result.fixable.push({ link, newPath })
            : result.broken.push(link);
          return result;
        },
        { fixable: [], broken: [] }
      );
  }

  private findFileWithSubpathInCache(subpath: string) {
    const found = Object.entries(this.app.metadataCache.fileCache).find(
      ([, { hash }]) =>
        isSubpathInMetadata(subpath, this.app.metadataCache.metadataCache[hash])
    );

    if (!found) {
      return null;
    }

    const newPath = this.getFileFromPathRelativeToActiveFile(found[0]);

    isNotNull(
      newPath,
      "Metadata cache contained a path that has the required subpath but doesn't point to a file"
    );

    return this.app.metadataCache.fileToLinktext(
      newPath,
      this.getActiveFile().path
    );
  }

  private getFileFromPathRelativeToActiveFile(path: string) {
    return this.app.metadataCache.getFirstLinkpathDest(
      path,
      this.getActiveFile().path
    );
  }

  private isLinkPathBroken = ({
    path,
    subpath,
  }: {
    path: string;
    subpath: string;
  }) => {
    const toFile = this.getFileFromPathRelativeToActiveFile(path);

    if (toFile === null) {
      return true;
    }

    return !isSubpathInMetadata(
      subpath,
      this.app.metadataCache.getFileCache(toFile)
    );
  };

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

      new Notice(createUpdateNotice(backlinksToUpdate));
    });
  };

  private getBacklinksForSourceFile() {
    isNotVoid(this.sourceFile);

    return this.app.metadataCache.getBacklinksForFile(this.sourceFile).data;
  }

  private async redirectLinksToActiveFile(
    links: Array<{ filePath: string; links: LinkCache[] }>
  ) {
    return Promise.all(
      links.map(async ({ filePath, links }) => {
        const contents = await this.readFile(filePath);
        const activeFilePath = this.getPathToActiveFileFrom(filePath);
        const linksWithNewPath = links.map((link) => ({
          link,
          newPath: activeFilePath,
        }));
        const updatedContents = redirectLinksInTextToNewPaths(
          linksWithNewPath,
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
