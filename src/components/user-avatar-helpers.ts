export const AVATAR_COLOR_COUNT = 8;

/** Hasta dos iniciales: la primera letra de las dos primeras palabras del nombre. */
export function avatarInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase('es-AR') ?? '')
    .join('');

  return initials || '?';
}

/** Índice estable para que una identidad conserve su color entre renders y dispositivos. */
export function avatarColorIndex(identity: string | number): number {
  const value = String(identity).normalize('NFKC').toLocaleLowerCase('es-AR');
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0) % AVATAR_COLOR_COUNT;
}
