import { Ban, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { UserAvatar } from '@/components/user-avatar';
import type { ActiveBlacklistPlayer } from '@/features/blacklist/blacklist.queries';
import { riotIdKey } from '@/features/blacklist/blacklist-rules';
import type { FriendProfile } from '@/features/friends/friends.queries';
import {
  csPerMinute,
  damageShare,
  findMemberForParticipant,
  killParticipation,
  multiKillLabel,
  performanceBadge,
  sameRiotId,
  sortParticipantsByPosition,
} from '@/features/matches/match-detail';
import {
  formatAverage,
  formatDateTime,
  formatDuration,
  formatKda,
  formatNumber,
  formatPercent,
  positionLabel,
  queueLabel,
} from '@/features/matches/format';
import { kdaRatio, matchOutcome } from '@/features/matches/player-summary';
import type { MatchDetail, MatchParticipant } from '@/features/matches/types';

import { ChampionIcon } from './champion-icon';

type Team = MatchDetail['teams'][number];

function teamLabel(key: string): string {
  if (key.toLocaleUpperCase('en-US') === 'BLUE') return 'Azul';
  if (key.toLocaleUpperCase('en-US') === 'RED') return 'Rojo';
  return key;
}

function scoreLabel(score: number): string {
  return score.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function teamOrder(team: Team): number {
  if (team.key.toLocaleUpperCase('en-US') === 'BLUE') return 0;
  if (team.key.toLocaleUpperCase('en-US') === 'RED') return 1;
  return 2;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="match-detail-stat">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ParticipantRow({
  participant,
  team,
  member,
  isFocus,
  currentUserId,
  championImages,
  maxDamage,
  blacklisted,
}: {
  participant: MatchParticipant;
  team: Team;
  member: FriendProfile | undefined;
  isFocus: boolean;
  currentUserId: number;
  championImages: Map<number, string>;
  maxDamage: number;
  blacklisted: ActiveBlacklistPlayer | undefined;
}) {
  const badge = performanceBadge(participant, team.win);
  const content = (
    <>
      <ChampionIcon
        imageUrl={championImages.get(participant.championId)}
        name={participant.championName}
      />
      <div className="match-player-identity">
        <p className="match-player-champion">
          {participant.championName}
          <span> · nivel {participant.championLevel}</span>
        </p>
        <p className="match-player-riot-id">
          {member ? <UserAvatar id={member.id} name={member.displayName} size="sm" src={member.avatarUrl} /> : null}
          <span>{participant.gameName}#{participant.tagLine}</span>
        </p>
      </div>
      <div className="match-player-kda">
        <strong>{participant.kills}/{participant.deaths}/{participant.assists}</strong>
        <span>KDA {formatKda(kdaRatio(participant.kills, participant.deaths, participant.assists))}</span>
      </div>
      <div className="match-player-secondary">
        <span>{formatNumber(participant.cs)} CS</span>
        <span>{formatNumber(participant.damageDealt)} daño</span>
        <span>{formatNumber(participant.goldEarned)} oro</span>
        <span aria-hidden="true" className="match-damage-bar">
          <span style={{ width: `${(participant.damageDealt / maxDamage) * 100}%` }} />
        </span>
      </div>
      {badge || blacklisted ? (
        <span className="match-player-badges">
          {badge ? <span className="match-performance-badge">{badge}</span> : null}
          {blacklisted ? (
            <span className="match-blacklist-badge" title={blacklisted.reason ?? undefined}>
              <Ban aria-hidden="true" size={12} strokeWidth={2.5} />
              Black list
            </span>
          ) : null}
        </span>
      ) : null}
      {member ? <ChevronRight aria-hidden="true" className="match-player-chevron" size={18} /> : null}
    </>
  );

  const className = 'match-player-row';
  if (member) {
    const href = member.id === currentUserId ? '/perfil' : `/amigos/${member.id}`;
    return (
      <Link className={className} data-focus={isFocus} data-member="true" href={href}>
        {content}
      </Link>
    );
  }

  return <div className={className} data-focus={isFocus}>{content}</div>;
}

export function MatchDetailView({
  detail,
  focusUser,
  currentUserId,
  members,
  championImages,
  activeBlacklist,
}: {
  detail: MatchDetail;
  focusUser: FriendProfile;
  currentUserId: number;
  members: FriendProfile[];
  championImages: Map<number, string>;
  activeBlacklist: Map<string, ActiveBlacklistPlayer>;
}) {
  const teams = [...detail.teams].sort((a, b) => teamOrder(a) - teamOrder(b));
  const participants = teams.flatMap((team) => team.participants);
  const focusRiotId = focusUser.riotGameName && focusUser.riotTagLine
    ? { gameName: focusUser.riotGameName, tagLine: focusUser.riotTagLine }
    : null;
  const focusParticipant = focusRiotId
    ? participants.find((participant) => sameRiotId(participant, focusRiotId))
    : undefined;
  const providerTarget = participants.find((participant) => participant.isTarget);
  const providerTargetMember = providerTarget
    ? findMemberForParticipant(providerTarget, members)
    : undefined;
  // `isTarget` puede venir de un detalle cacheado por otro jugador. Solo sirve de fallback
  // para snapshots viejos cuyo Riot ID ya cambió, no para pisar a otro miembro conocido.
  const target = focusParticipant ?? (
    providerTargetMember && providerTargetMember.id !== focusUser.id ? undefined : providerTarget
  );
  const targetTeam = target
    ? teams.find((team) => team.participants.includes(target))
    : undefined;
  const outcome = matchOutcome({ durationSeconds: detail.durationSeconds, win: targetTeam?.win ?? false });
  const maxDamage = Math.max(1, ...participants.map((participant) => participant.damageDealt));
  const teamDamage = targetTeam?.participants.reduce((sum, participant) => sum + participant.damageDealt, 0) ?? 0;
  const multikill = multiKillLabel(target?.largestMultiKill);

  return (
    <div className="match-detail-view">
      <section aria-labelledby="match-summary-heading" className="match-detail-summary" data-result={outcome.tone}>
        <div>
          <p className="match-detail-outcome" id="match-summary-heading">{outcome.label}</p>
          <p className="match-detail-meta">
            {queueLabel(detail.queue)} · {formatDuration(detail.durationSeconds)} · {formatDateTime(new Date(detail.playedAt))}
          </p>
        </div>
        <div aria-label="Comparación de equipos" className="match-team-comparison">
          {teams.map((team, index) => (
            <div className="match-team-score" key={team.key}>
              {index > 0 ? <span aria-hidden="true" className="match-versus">vs</span> : null}
              <span className="match-team-name">{teamLabel(team.key)}</span>
              <strong>{team.kills} kills</strong>
              <span>{formatNumber(team.goldEarned)} oro</span>
            </div>
          ))}
        </div>
      </section>

      {target && targetTeam ? (
        <section aria-labelledby="focus-player-heading" className="match-focus-card">
          <div className="match-focus-head">
            <ChampionIcon
              imageUrl={championImages.get(target.championId)}
              name={target.championName}
              size="lg"
            />
            <div>
              <h2 id="focus-player-heading">{target.championName}</h2>
              <p>
                {focusUser.displayName} · nivel {target.championLevel}
                {target.position ? ` · ${positionLabel(target.position)}` : ''}
              </p>
            </div>
            {performanceBadge(target, targetTeam.win) ? (
              <span className="match-performance-badge match-performance-badge-large">
                {performanceBadge(target, targetTeam.win)}
              </span>
            ) : null}
          </div>

          <dl className="match-detail-stats">
            <Stat label="KDA">
              {target.kills}/{target.deaths}/{target.assists} · {formatKda(kdaRatio(target.kills, target.deaths, target.assists))}
            </Stat>
            <Stat label="Participación en kills">
              {formatPercent(killParticipation(target.kills, target.assists, targetTeam.kills))}
            </Stat>
            <Stat label="CS">
              {formatNumber(target.cs)} · {formatAverage(csPerMinute(target.cs, detail.durationSeconds))}/min
            </Stat>
            <Stat label="Daño a campeones">
              {formatNumber(target.damageDealt)} · {formatPercent(damageShare(target.damageDealt, teamDamage))} del equipo
            </Stat>
            <Stat label="Daño recibido">{formatNumber(target.damageTaken)}</Stat>
            <Stat label="Oro">{formatNumber(target.goldEarned)}</Stat>
            {target.wardsPlaced !== undefined || target.controlWardsBought !== undefined ? (
              <Stat label="Visión">
                {[
                  target.wardsPlaced !== undefined ? `${formatNumber(target.wardsPlaced)} wards` : null,
                  target.controlWardsBought !== undefined ? `${formatNumber(target.controlWardsBought)} de control` : null,
                ].filter(Boolean).join(' · ')}
              </Stat>
            ) : null}
            {multikill ? <Stat label="Mayor multikill">{multikill}</Stat> : null}
            {target.largestKillingSpree !== undefined ? (
              <Stat label="Mayor racha">{formatNumber(target.largestKillingSpree)} kills</Stat>
            ) : null}
            {target.opScore !== null ? (
              <Stat label="OP Score">
                {scoreLabel(target.opScore)}{target.opScoreRank !== null ? ` · #${target.opScoreRank}` : ''}
              </Stat>
            ) : null}
          </dl>
        </section>
      ) : null}

      <div className="match-teams">
        {teams.map((team) => (
          <section aria-labelledby={`team-${team.key}`} className="match-team" key={team.key}>
            <div className="match-team-header" data-result={team.win ? 'win' : 'loss'}>
              <h2 id={`team-${team.key}`}>Equipo {teamLabel(team.key)}</h2>
              <span>{team.win ? 'Victoria' : 'Derrota'} · {team.kills} kills</span>
            </div>
            <ul className="match-team-list">
              {sortParticipantsByPosition(team.participants).map((participant) => {
                const member = findMemberForParticipant(participant, members);
                return (
                  <li key={participant.puuid}>
                    <ParticipantRow
                      championImages={championImages}
                      blacklisted={activeBlacklist.get(riotIdKey(participant))}
                      currentUserId={currentUserId}
                      isFocus={participant === target}
                      maxDamage={maxDamage}
                      member={member}
                      participant={participant}
                      team={team}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
