/** "Kai'Sa" → "kaisa", "Nunu y Willump" → "nunuywillump": buscar sin tildes, mayúsculas ni símbolos. */
export function searchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}
