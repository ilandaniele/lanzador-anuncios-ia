const DIACRITICS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;

export const slugify = (text: string, maxLength: number) =>
  text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "-")
    .slice(0, maxLength)
    .replace(EDGE_DASHES, "");
