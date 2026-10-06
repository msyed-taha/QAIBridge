/** A copy of `list` with the item at `index` replaced by `value`. */
export const replaceAt = <T>(list: T[], index: number, value: T): T[] =>
  list.map((item, i) => (i === index ? value : item));

/** "a", "a and b", "a, b and c". */
export const joinWithAnd = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
