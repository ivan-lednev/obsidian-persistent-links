import { Notice, Plugin, TFile } from "obsidian";
import { isInstanceOf, isNotNull, isNotVoid } from "typed-assert";
import { LinkMetadata } from "./types";
import {
  getBlockIds,
  getHeadings,
  getNormalizedHeadingInLink,
  normalizeHeading,
  replaceFilePathInLink,
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

  private handleEditorPaste = async (event: ClipboardEvent) => {
    if (!this.sourceFile) {
      return;
    }

    const clipboardContents = event?.clipboardData?.getData("text");

    if (!clipboardContents) {
      return;
    }

    const blockIds = getBlockIds(clipboardContents);
    const headings = getHeadings(clipboardContents);

    if (blockIds.length === 0 && headings.length === 0) {
      return;
    }

    this.onceAfterActiveFileCacheUpdate(() => {
      this.redirectLinksFromSourceToActiveFile(blockIds, headings);
    });
  };

  private async redirectLinksFromSourceToActiveFile(
    blockIds: string[],
    headings: string[]
  ) {
    isNotVoid(this.sourceFile);

    const backlinks = this.app.metadataCache.getBacklinksForFile(
      this.sourceFile
    ).data;

    const results = await Promise.all(
      Object.entries(backlinks)
        .map(([filePath, links]) => ({
          filePath,
          links: links.filter(
            ({ link: linkText }) =>
              blockIds.some((id) => linkText.includes(id)) ||
              headings.some(
                (heading) =>
                  getNormalizedHeadingInLink(linkText) ===
                  normalizeHeading(heading)
              )
          ),
        }))
        .filter(({ links }) => links.length > 0)
        .map(async ({ filePath, links }) => {
          const contents = await this.readFile(filePath);
          const updatedContents = this.updateLinks(
            links,
            this.getPathToActiveFileFrom(filePath),
            contents
          );

          await this.updateFile(filePath, updatedContents);

          return { filePath, links };
        })
    );

    const fileCount = results.length;
    const linkCount = results.flatMap((f) => f.links).length;

    new Notice(`Updated ${linkCount} links in ${fileCount} files`);
  }

  private onceAfterActiveFileCacheUpdate(action: () => void) {
    const activeFile = this.app.workspace.getActiveFile();
    const registeredCallback = (file: TFile) => {
      if (file !== activeFile) {
        return;
      }

      try {
        action();
      } finally {
        this.app.metadataCache.off("changed", registeredCallback);
      }
    };
    this.app.metadataCache.on("changed", registeredCallback);
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

  private updateLinks(links: LinkMetadata[], newPath: string, text: string) {
    return links
      .slice()
      .reverse()
      .reduce((updatedText: string, { position, original }: LinkMetadata) => {
        const start = position.start.offset;
        const end = position.end.offset;

        const updated = replaceFilePathInLink(original, newPath);

        return `${updatedText.substring(
          0,
          start
        )}${updated}${updatedText.substring(end)}`;
      }, text);
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
