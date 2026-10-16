// Names compared as whole words, so "Che" is not "Cher" and "Drake" is not "Drake Bell", while
// "Taylor Swift" still matches "Taylor Swift feat. Someone".
export const sameName = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
};
