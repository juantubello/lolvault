import { getCurrentUser } from '@/auth/current-user';
import { readAvatarFile } from '@/features/profile/avatar-storage';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  // Solo miembros del grupo ven fotos (además de Cloudflare Access adelante).
  const viewer = await getCurrentUser();
  if (!viewer?.displayName) return new Response(null, { status: 401 });

  const userId = Number((await params).userId);
  if (!Number.isInteger(userId) || userId <= 0) return new Response(null, { status: 404 });

  const bytes = await readAvatarFile(userId);
  if (!bytes) return new Response(null, { status: 404 });

  return new Response(bytes, {
    headers: {
      // La URL lleva ?v=<fecha de subida>: una foto nueva es otra URL, así que se puede cachear para siempre.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
