import {
  BLOCK_ID,
  FILE_PATH_IN_LINK,
  HEADING,
  NOT_LETTER_OR_NUMBER,
} from "./patterns";
import { LinkMetadata, PathsWithLinks } from "./types";

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
        ({ link: linkText }: LinkMetadata) =>
          blockIdsInText.some((id) => linkText.includes(id)) ||
          headingsInText.some(
            (heading) =>
              getNormalizedHeadingInLink(linkText) === normalizeHeading(heading)
          )
      ),
    }))
    .filter(({ links }) => links.length > 0);
}

export function redirectLinksInTextToNewPath(
  links: LinkMetadata[],
  newPath: string,
  text: string
) {
  return links
    .slice()
    .reverse()
    .reduce((updatedText: string, { position, original }: LinkMetadata) => {
      const start = position.start.offset;
      const end = position.end.offset;

      const updatedLink = replaceFilePathInLink(original, newPath);

      return (
        updatedText.substring(0, start) +
        updatedLink +
        updatedText.substring(end)
      );
    }, text);
}

export function createNotification(
  results: Array<{ filePath: string; links: LinkMetadata[] }>
) {
  const fileCount = results.length;
  const linkCount = results.flatMap((f) => f.links).length;

  return `Updated ${linkCount} links in ${fileCount} files`;
}
