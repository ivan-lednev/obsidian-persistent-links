import {
  BLOCK_ID,
  FILE_PATH_IN_LINK,
  HEADING,
  NOT_LETTER_OR_NUMBER,
} from "./patterns";

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
