export function groupBy<Item, Key>(
  items: Iterable<Item>,
  keyOf: (item: Item) => Key,
): Map<Key, Item[]> {
  const groups = new Map<Key, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}
