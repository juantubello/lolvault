import Image from 'next/image';

const SIZES = { sm: 28, md: 60, lg: 96 } as const;

/** Foto de perfil o, si no hay, la inicial. Decorativa: el nombre siempre está al lado. */
export function UserAvatar({
  name,
  src,
  size = 'md',
}: {
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
    <span aria-hidden="true" className="user-avatar user-avatar-initial" data-size={size}>
      {name.trim().charAt(0).toLocaleUpperCase('es-AR') || '?'}
    </span>
  );
}
