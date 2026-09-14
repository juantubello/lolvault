/** Una identidad validada en el borde, antes de resolver el usuario local. */
export type Identity = {
  /** Claim `sub` de Access, o `dev:<email>` durante desarrollo. */
  externalIdentity: string;
  email: string;
  source: 'access-jwt' | 'dev';
};
