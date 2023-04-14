export const HEADING = /^#+\s.+$/gm;
export const BLOCK_ID = /\s+(\^[a-zA-Z0-9-]+)$/gm;
export const NOT_LETTER_OR_NUMBER = /[^\p{Letter}\p{Number}]/gu;
export const FILE_PATH_IN_LINK = /(\[\[).*(#)/;

