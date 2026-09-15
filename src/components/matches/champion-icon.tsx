import Image from 'next/image';

const SIZES = { sm: 28, md: 40, lg: 64 } as const;

/** Foto de campeón (Data Dragon) o la inicial si todavía no está sincronizado. Decorativa. */
export function ChampionIcon({
  name,
  imageUrl,
  size = 'md',
}: {
  name: string;
  imageUrl: string | undefined;
  size?: keyof typeof SIZES;
}) {
  if (imageUrl) {
    return (
      <Image
        alt=""
        className="champion-icon"
        data-size={size}
        height={SIZES[size]}
        src={imageUrl}
        unoptimized
        width={SIZES[size]}
      />
    );
  }

  return (
    <span aria-hidden="true" className="champion-icon" data-size={size}>
      {name.charAt(0)}
    </span>
  );
}
