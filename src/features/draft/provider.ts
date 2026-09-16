import { createLolalyticsProvider } from '@/features/draft/lolalytics/lolalytics-provider';
import type { DraftDataSource } from '@/features/draft/types';

const globalForProvider = globalThis as unknown as {
  __lolvaultDraftDataSource?: DraftDataSource;
};

/** Único lugar que conoce la implementación concreta usada por la ingesta de Draft. */
export function getDraftDataSource(): DraftDataSource {
  return (globalForProvider.__lolvaultDraftDataSource ??= createLolalyticsProvider());
}
