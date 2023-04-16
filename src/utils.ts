import {
  BLOCK_ID,
  FILE_PATH_IN_LINK,
  HEADING,
  NOT_LETTER_OR_NUMBER,
} from "./patterns";
import { LinkWithDestination, PathsWithLinks } from "./types";
import * as obsidian from "obsidian";
import { CachedMetadata, HeadingCache, LinkCache } from "obsidian";

export function getBlockIds(text: string) {
  return [...text.matchAll(BLOCK_ID)].map((match) => match[1]);
}

export function getHeadings(text: string) {
  return [...text.matchAll(HEADING)].map((match) => match[0]);
}

export function normalizeHeading(text: string) {
  return text.replaceAll(NOT_LETTER_OR_NUMBER, "");
}

export function getNormalizedHeadingInLink(link: string) {
  const headingPart = link.split("#")[1];
  if (headingPart) {
    return normalizeHeading(headingPart);
  }
  return null;
}

export function parseLinkText(linkText: string) {
  const { path, subpath } = obsidian.parseLinktext(linkText);
  return {
    path,
    subpath: stripSubpathToken(subpath),
  };
}

export function stripSubpathToken(subpath: string) {
  return subpath.replace(/#\^?/, "");
}

export function replaceFilePathInLink(link: string, newPath: string) {
  return link.replace(FILE_PATH_IN_LINK, `$1${newPath}$2`);
}

export function filterLinksToItemsPresentInText(
  links: PathsWithLinks,
  text: string
) {
  const blockIdsInText = getBlockIds(text);
  const headingsInText = getHeadings(text);

  return Object.entries(links)
    .map(([filePath, links]) => ({
      filePath,
      links: links.filter(
        ({ link: linkText }: LinkCache) =>
          blockIdsInText.some((id) => linkText.includes(id)) ||
          headingsInText.some(
            (heading) =>
              getNormalizedHeadingInLink(linkText) === normalizeHeading(heading)
          )
      ),
    }))
    .filter(({ links }) => links.length > 0);
}

export function redirectLinksInTextToNewPaths(
  linksWithPaths: LinkWithDestination[],
  text: string
) {
  return linksWithPaths
    .slice()
    .sort((a, b) => compareLinkOffsets(a.link, b.link))
    .reverse()
    .reduce(
      (updatedText: string, { newPath, link: { position, original } }) => {
        const start = position.start.offset;
        const end = position.end.offset;

        const updatedLink = replaceFilePathInLink(original, newPath);

        return (
          updatedText.substring(0, start) +
          updatedLink +
          updatedText.substring(end)
        );
      },
      text
    );
}

export function createUpdateNotice(
  results: Array<{ filePath: string; links: LinkCache[] }>
) {
  const fileCount = results.length;
  const linkCount = results.flatMap((f) => f.links).length;

  return `Updated ${linkCount} links in ${fileCount} files`;
}

export function createRepairNotice(fixed: number, broken: number) {
  let result = "";
  if (fixed > 0) {
    result += `Fixed ${fixed} links`;
  }

  if (broken > 0) {
    result += `\nCould not fix ${broken} links`;
  }
  return result;
}

export function compareLinkOffsets(left: LinkCache, right: LinkCache) {
  return left.position.start.offset - right.position.start.offset;
}

export function isSubpathInMetadata(
  subpath: string,
  metadata: CachedMetadata | null | undefined
) {
  if (!metadata) {
    return false;
  }

  const { blocks, headings } = metadata;

  return (
    (blocks && subpath in blocks) ||
    (headings && isSubpathInHeadingCache(subpath, headings))
  );
}

function isSubpathInHeadingCache(
  subpath: string,
  headingCache: HeadingCache[]
) {
  return headingCache.some(
    ({ heading }) => normalizeHeading(heading) === normalizeHeading(subpath)
  );
}
