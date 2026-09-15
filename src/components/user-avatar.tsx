import Image from 'next/image';

import { avatarColorIndex, avatarInitials } from './user-avatar-helpers';

const SIZES = { sm: 28, nav: 48, md: 60, lg: 96 } as const;

/** Foto de perfil o, si no hay, la inicial. Decorativa: el nombre siempre está al lado. */
export function UserAvatar({
  id,
  name,
  src,
  size = 'md',
}: {
  id?: string | number;
  name: string;
  src: string | null;
  size?: keyof typeof SIZES;
}) {
  if (src) {
    return (
      <Image
        alt=""
        className="user-avatar"
        data-size={size}
        height={SIZES[size]}
        src={src}
        unoptimized
        width={SIZES[size]}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="user-avatar user-avatar-initial"
      data-avatar-color={avatarColorIndex(id ?? name)}
      data-size={size}
    >
      {avatarInitials(name)}
    </span>
  );
}
