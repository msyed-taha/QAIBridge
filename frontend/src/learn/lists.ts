/** A copy of `list` with the item at `index` replaced by `value`. */
export const replaceAt = <T>(list: T[], index: number, value: T): T[] =>
  list.map((item, i) => (i === index ? value : item));

/** A shuffled copy of `items` (Fisher–Yates), every order equally likely. */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "a", "a and b", "a, b and c". */
export const joinWithAnd = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
