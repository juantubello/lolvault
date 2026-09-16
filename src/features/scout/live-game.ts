export type LiveGame = {
  opponentPuuids: string[];
};

export interface LiveGameProvider {
  getLiveGame(puuid: string): Promise<LiveGame | null>;
}

class UnavailableLiveGameProvider implements LiveGameProvider {
  async getLiveGame(_puuid: string): Promise<null> {
    return null;
  }
}

const provider: LiveGameProvider = new UnavailableLiveGameProvider();

export function getLiveGameProvider(): LiveGameProvider {
  return provider;
}
