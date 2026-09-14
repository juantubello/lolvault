import { assertDevBypassDisabledInProduction } from '@/auth/dev-identity';

try {
  assertDevBypassDisabledInProduction();
} catch (error) {
  console.error(`[lolvault] ${(error as Error).message}`);
  process.exit(1);
}
