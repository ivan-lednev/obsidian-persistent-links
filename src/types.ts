import { TAbstractFile } from "obsidian";

declare module "obsidian" {
  interface MetadataCache {
    getBacklinksForFile: (file: TAbstractFile) => {
      data: { [fileName: string]: Array<LinkMetadata> };
    };
  }
}

export interface LinkMetadata {
  /**
   * foo#^bar
   */
  link: string;

  /**
   * ![[foo#^bar]]
   */
  original: string;
  position: {
    start: {
      offset: number;
    };
    end: {
      offset: number;
    };
  };
}
