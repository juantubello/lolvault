import {
  DraftDataSourceError,
  isDraftDataSourceError,
  type DraftRole,
} from '@/features/draft/types';

import { createLolalyticsClient } from './lolalytics-client';
import { parseQwikScalingData, type QwikScalingBucket } from './qwik-data';

export type DraftScalingSource = {
  readonly name: string;
  getScaling(input: {
    championKey: number;
    championId: string;
    role: DraftRole;
    patchWindow: string;
  }): Promise<QwikScalingBucket[]>;
};

export function createLolalyticsScalingSource(options: {
  client?: Pick<ReturnType<typeof createLolalyticsClient>, 'getQData'>;
} = {}): DraftScalingSource {
  const client = options.client ?? createLolalyticsClient();
  return {
    name: 'lolalytics-q-data',
    async getScaling(input) {
      try {
        const parsed = parseQwikScalingData(await client.getQData(input));
        if (!parsed.ok) {
          throw new DraftDataSourceError(
            `Respuesta q-data de Lolalytics inválida: ${parsed.message}`,
            'invalid-response',
          );
        }
        return parsed.series;
      } catch (error) {
        if (isDraftDataSourceError(error)) throw error;
        const detail = error instanceof Error ? `: ${error.message}` : '';
        throw new DraftDataSourceError(
          `Respuesta q-data de Lolalytics inválida${detail}`,
          'invalid-response',
        );
      }
    },
  };
}
