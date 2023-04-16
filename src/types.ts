import { CachedMetadata, LinkCache, TAbstractFile } from "obsidian";

declare module "obsidian" {
  interface MetadataCache {
    metadataCache: FileMetadata;
    fileCache: FileCache;

    getBacklinksForFile: (file: TAbstractFile) => {
      data: PathsWithLinks;
    };
  }
}

interface FileCache {
  [filePath: string]: {
    hash: string;
  };
}

interface FileMetadata {
  [fileHash: string]: CachedMetadata;
}

export interface PathsWithLinks {
  [path: string]: LinkCache[];
}

export interface LinkWithDestination {
  link: LinkCache;
  newPath: string;
}

export interface BrokenLinkResult {
  fixable: LinkWithDestination[];
  broken: LinkCache[];
}
