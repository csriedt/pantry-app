export const newSeed = (): number => Date.now() % 2_147_483_647;

export const sampleSeeded = <T>(
  items: readonly T[],
  count: number,
  seed: number,
): T[] => {
  if (count >= items.length) return [...items];

  const pool = [...items];
  let state = seed;
  for (let i = pool.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const j = state % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, Math.max(0, count));
};
