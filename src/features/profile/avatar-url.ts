/** URL versionada de la foto: cambia al subir otra, así el navegador no muestra la vieja del caché. */
export function avatarUrl(user: { id: number; avatarUpdatedAt: Date | null }): string | null {
  return user.avatarUpdatedAt ? `/avatars/${user.id}?v=${user.avatarUpdatedAt.getTime()}` : null;
}
