'use client';

import { useState, useTransition } from 'react';

import { AVATAR_SIZE_PX } from '@/config';
import { removeAvatarAction, uploadAvatarAction } from '@/features/profile/avatar.actions';

import { UserAvatar } from './user-avatar';

/**
 * Recorta al centro y achica a un JPEG cuadrado. Se hace en el teléfono para subir ~30 KB en
 * vez de una foto de 4 MB y no necesitar librerías de imágenes en el homelab. El navegador ya
 * aplica la orientación EXIF al dibujar, y el selector de fotos de iOS entrega JPEG en vez de HEIC.
 */
async function toSquareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible');
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX,
    );

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob falló'))), 'image/jpeg', 0.85);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarPicker({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    startTransition(async () => {
      let previewUrl: string | null = null;
      try {
        const blob = await toSquareJpeg(file);
        previewUrl = URL.createObjectURL(blob);
        setPreview(previewUrl);

        const formData = new FormData();
        formData.set('avatar', blob, 'avatar.jpg');
        const result = await uploadAvatarAction(formData);
        if (result.error) setError(result.error);
      } catch {
        setError('No pudimos leer esa foto. Probá con otra (JPG o PNG).');
      } finally {
        setPreview(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
    });
  }

  function remove() {
    if (!window.confirm('¿Quitar tu foto de perfil?')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (result.error) setError(result.error);
    });
  }

  return (
    <section aria-label="Foto de perfil" className="avatar-picker" data-pending={pending}>
      <UserAvatar name={name} size="lg" src={preview ?? avatarUrl} />

      <div className="avatar-picker-actions">
        <input
          accept="image/*"
          className="sr-only"
          disabled={pending}
          id="avatar-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ''; // permite volver a elegir la misma foto
            if (file) upload(file);
          }}
          type="file"
        />
        <label className="text-button" htmlFor="avatar-input">
          {avatarUrl ? 'Cambiar foto' : 'Agregar foto'}
        </label>
        {avatarUrl ? (
          <button className="text-button" data-tone="danger" disabled={pending} onClick={remove} type="button">
            Quitar
          </button>
        ) : null}
      </div>

      {pending ? (
        <p className="field-help" role="status">
          Guardando foto…
        </p>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
