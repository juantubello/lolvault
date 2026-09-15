import { formatDateTime, formatDuration, formatNumber, queueLabel } from '@/features/matches/format';
import type { MatchDetail } from '@/features/matches/types';

import { ChampionIcon } from './champion-icon';

/**
 * "La foto" de una partida: los dos equipos con campeón, jugador, KDA y daño hecho/recibido.
 * Es una tabla (se lee sin color); la barra de daño es un refuerzo de un solo tono.
 */
export function MatchSnapshot({
  detail,
  championImages,
}: {
  detail: MatchDetail;
  championImages: Map<number, string>;
}) {
  const participants = detail.teams.flatMap((team) => team.participants);
  const maxDamage = Math.max(1, ...participants.map((participant) => participant.damageDealt));

  return (
    <div className="match-snapshot">
      <p className="match-meta">
        {queueLabel(detail.queue)} · {formatDuration(detail.durationSeconds)} · {formatDateTime(new Date(detail.playedAt))}
      </p>

      {detail.teams.map((team) => (
        <div className="snapshot-team" key={team.key}>
          <p className="snapshot-team-title" data-result={team.win ? 'win' : 'loss'}>
            {team.win ? 'Victoria' : 'Derrota'} · {team.kills} kills
          </p>
          <div className="snapshot-scroll">
            <table className="snapshot-table">
              <caption className="sr-only">
                Equipo {team.win ? 'ganador' : 'perdedor'}: campeón, jugador, KDA y daño
              </caption>
              <thead>
                <tr>
                  <th scope="col">Jugador</th>
                  <th scope="col">KDA</th>
                  <th scope="col">Daño hecho</th>
                  <th scope="col">Recibido</th>
                </tr>
              </thead>
              <tbody>
                {team.participants.map((participant) => (
                  <tr data-target={participant.isTarget} key={participant.puuid}>
                    <th scope="row">
                      <span className="snapshot-player">
                        <ChampionIcon
                          imageUrl={championImages.get(participant.championId)}
                          name={participant.championName}
                          size="sm"
                        />
                        <span>
                          <span className="snapshot-champion">{participant.championName}</span>
                          <span className="snapshot-name">{participant.gameName}</span>
                        </span>
                      </span>
                    </th>
                    <td className="snapshot-number">
                      {participant.kills}/{participant.deaths}/{participant.assists}
                    </td>
                    <td className="snapshot-number">
                      {formatNumber(participant.damageDealt)}
                      <span aria-hidden="true" className="damage-bar">
                        <span style={{ width: `${(participant.damageDealt / maxDamage) * 100}%` }} />
                      </span>
                    </td>
                    <td className="snapshot-number">{formatNumber(participant.damageTaken)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
