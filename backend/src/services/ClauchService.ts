// =================================================================
// 电竞赛事模拟系统 - Clauch洲际赛服务
// =================================================================

import { PoolClient } from 'pg';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import {
  BusinessError,
  ErrorCodes
} from '../types';
import { rankingService } from './RankingService';

// =================================================================
// 类型定义
// =================================================================

export interface ClauchQualification {
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  summerRegularRank: number; // 夏季赛常规赛排名1-8
  summerRegularPoints: number; // 夏季赛常规赛积分
  groupName: string; // A-H
}

export interface ClauchGroupStanding {
  teamId: string;
  teamName: string;
  groupName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number; // 小组赛积分
  roundsWon: number;
  roundsLost: number;
  roundDifferential: number;
  position: number;
  qualified: boolean;
}

export interface ClauchMatch {
  id: string;
  clauchBracketId: string;
  stage: 'group_stage' | 'knockout';
  groupName?: string;
  roundInGroup?: number;
  knockoutBracket?: 'east' | 'west';
  knockoutRound?: string;
  matchNumber?: number;
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  bestOf: number;
  scoreA: number;
  scoreB: number;
  winnerId?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  scheduledAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClauchGroup {
  groupName: string;
  teams: ClauchQualification[];
  matches: ClauchMatch[];
  standings: ClauchGroupStanding[];
}

export interface ClauchKnockoutBracket {
  bracket: 'east' | 'west';
  round1: ClauchMatch[]; // 第一轮 (4场)
  semiFinals: ClauchMatch[]; // 半决赛 (2场)
  final: ClauchMatch[]; // 决赛 (1场)
}

export interface ClauchBracket {
  id: string;
  seasonId: string;
  seasonYear: number;
  status: 'not_started' | 'group_stage' | 'knockout_stage' | 'completed';
  currentStage: string;
  qualifiedTeams: ClauchQualification[];
  groups: ClauchGroup[];
  knockoutEast?: ClauchKnockoutBracket;
  knockoutWest?: ClauchKnockoutBracket;
  thirdPlaceMatch?: ClauchMatch;
  grandFinal?: ClauchMatch;
  champion?: ClauchQualification;
  runnerUp?: ClauchQualification;
  thirdPlace?: ClauchQualification;
  fourthPlace?: ClauchQualification;
  pointsDistribution: {
    champion: number;
    runnerUp: number;
    thirdPlace: number;
    fourthPlace: number;
    eastFinalLoser: number;
    westFinalLoser: number;
    eastSemiLoser: number;
    westSemiLoser: number;
    eastRound1Loser: number;
    westRound1Loser: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ClauchEligibilityResponse {
  eligible: boolean;
  reason?: string;
  qualifiedTeams?: ClauchQualification[];
}

export interface GenerateClauchRequest {
  seasonId: string;
}

export interface SimulateClauchMatchRequest {
  matchId: string;
}

export interface SimulateClauchMatchResponse {
  match: ClauchMatch;
  updatedStandings?: ClauchGroupStanding[];
}

export class ClauchService {
  /**
   * 检查是否可以生成Clauch洲际赛
   * 要求: 当前赛季的世界赛已完成
   */
  async checkClauchEligibility(seasonId: string): Promise<ClauchEligibilityResponse> {
    try {
      // 1. 检查赛季是否存在
      const seasonQuery = `SELECT * FROM seasons WHERE id = $1`;
      const seasonResult = await db.query(seasonQuery, [seasonId]);

      if (seasonResult.rows.length === 0) {
        return {
          eligible: false,
          reason: '赛季不存在'
        };
      }

      const season = seasonResult.rows[0];

      // 2. 检查是否已有Clauch洲际赛
      const existingClauchQuery = `SELECT id FROM clauch_brackets WHERE season_id = $1`;
      const existingResult = await db.query(existingClauchQuery, [seasonId]);

      if (existingResult.rows.length > 0) {
        return {
          eligible: false,
          reason: '该赛季Clauch洲际赛已生成'
        };
      }

      // 3. 获取season_code
      const seasonCode = season.season_code;

      // 4. 检查世界赛是否完成（worlds_brackets使用season_code）
      const worldsQuery = `
        SELECT wb.*, wb.status as bracket_status
        FROM worlds_brackets wb
        WHERE wb.season_id = $1
        ORDER BY wb.created_at DESC
        LIMIT 1
      `;

      const worldsResult = await db.query(worldsQuery, [seasonCode]);

      if (worldsResult.rows.length === 0) {
        return {
          eligible: false,
          reason: '该赛季世界赛尚未生成'
        };
      }

      const worlds = worldsResult.rows[0];

      if (worlds.bracket_status !== 'completed') {
        return {
          eligible: false,
          reason: '世界赛尚未完成'
        };
      }

      // 5. 获取各赛区夏季赛常规赛前8名
      const qualifiedTeams = await this.getQualifiedTeams(seasonId);

      if (qualifiedTeams.length !== 32) {
        return {
          eligible: false,
          reason: `参赛队伍数量不足32支(当前${qualifiedTeams.length}支)`
        };
      }

      return {
        eligible: true,
        qualifiedTeams
      };
    } catch (error: any) {
      logger.error('检查Clauch资格失败', { error: error.message, seasonId });
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '检查Clauch资格失败',
        error.message
      );
    }
  }

  /**
   * 获取Clauch资格队伍
   * 规则: 各赛区夏季赛常规赛前8名，共32支队伍
   */
  async getQualifiedTeams(seasonId: string): Promise<ClauchQualification[]> {
    try {
      // 1. 获取所有活跃赛区
      const regionsQuery = `SELECT id, name FROM regions WHERE is_active = true ORDER BY id`;
      const regionsResult = await db.query(regionsQuery);

      if (regionsResult.rows.length < 4) {
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          `活跃赛区不足4个(当前${regionsResult.rows.length}个)`
        );
      }

      const regions = regionsResult.rows.slice(0, 4); // 只取前4个赛区
      const qualifiedTeams: ClauchQualification[] = [];

      // 2. 获取各赛区夏季赛常规赛前8名
      for (const region of regions) {
        // 查找该赛区当前赛季的夏季赛competition
        const competitionQuery = `
          SELECT id, type
          FROM competitions
          WHERE season_id = $1
            AND type = 'summer'
          ORDER BY created_at DESC
          LIMIT 1
        `;

        const competitionResult = await db.query(competitionQuery, [seasonId]);

        if (competitionResult.rows.length === 0) {
          throw new BusinessError(
            ErrorCodes.INVALID_COMPETITION_FORMAT,
            `赛区${region.name}的夏季赛尚未生成`
          );
        }

        const competition = competitionResult.rows[0];

        // 获取该赛区夏季赛常规赛积分榜前8名
        const standingsQuery = `
          SELECT 
            rs.team_id,
            t.name as team_name,
            rs.region_id,
            rs.position as rank,
            rs.regular_season_points as points
          FROM regional_standings rs
          JOIN teams t ON t.id = rs.team_id
          WHERE rs.season_id = $1
            AND rs.region_id = $2
            AND rs.competition_type = 'summer'
          ORDER BY rs.position ASC
          LIMIT 8
        `;

        const standingsResult = await db.query(standingsQuery, [seasonId, region.id]);

        if (standingsResult.rows.length < 8) {
          logger.warn(`赛区${region.name}的夏季赛常规赛积分榜队伍不足8支`, {
            count: standingsResult.rows.length,
            regionId: region.id,
            seasonId
          });
          // 仍然继续，但记录警告
        }

        // 将队伍添加到资格列表
        for (const row of standingsResult.rows) {
          qualifiedTeams.push({
            teamId: row.team_id.toString(),
            teamName: row.team_name,
            regionId: region.id.toString(),
            regionName: region.name,
            summerRegularRank: row.rank,
            summerRegularPoints: row.points || 0,
            groupName: '' // 稍后分配
          });
        }
      }

      return qualifiedTeams;
    } catch (error: any) {
      logger.error('获取Clauch资格队伍失败', { error: error.message, seasonId });
      if (error instanceof BusinessError) {
        throw error;
      }
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '获取Clauch资格队伍失败',
        error.message
      );
    }
  }

  /**
   * 分配小组
   * 规则: 32支队伍分成8个小组(A-H)，每组4队
   * 策略: 每个赛区的8支队伍均匀分配到8个小组，每组每个赛区各1支
   */
  private assignGroups(teams: ClauchQualification[]): ClauchQualification[] {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const teamsWithGroups = [...teams];

    // 按赛区分组
    const teamsByRegion: { [regionId: string]: ClauchQualification[] } = {};
    for (const team of teamsWithGroups) {
      if (!teamsByRegion[team.regionId]) {
        teamsByRegion[team.regionId] = [];
      }
      teamsByRegion[team.regionId].push(team);
    }

    // 为每个赛区的队伍按排名排序
    for (const regionId in teamsByRegion) {
      teamsByRegion[regionId].sort((a, b) => a.summerRegularRank - b.summerRegularRank);
    }

    // 分配小组：每个小组从每个赛区各取1支队伍
    let groupIndex = 0;
    for (let i = 0; i < 8; i++) {
      for (const regionId in teamsByRegion) {
        if (teamsByRegion[regionId][i]) {
          teamsByRegion[regionId][i].groupName = groups[groupIndex % 8];
        }
      }
      groupIndex++;
    }

    return teamsWithGroups;
  }

  /**
   * 生成Clauch洲际赛
   */
  async generateClauch(request: GenerateClauchRequest): Promise<ClauchBracket> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 检查资格
      const eligibility = await this.checkClauchEligibility(request.seasonId);
      if (!eligibility.eligible) {
        throw new BusinessError(
          ErrorCodes.WORLDS_NOT_COMPLETE,
          eligibility.reason || '无法生成Clauch洲际赛'
        );
      }

      let qualifiedTeams = eligibility.qualifiedTeams!;

      // 2. 分配小组
      qualifiedTeams = this.assignGroups(qualifiedTeams);

      // 3. 获取赛季信息
      const seasonQuery = `SELECT year, season_code FROM seasons WHERE id = $1`;
      const seasonResult = await client.query(seasonQuery, [request.seasonId]);
      const seasonYear = seasonResult.rows[0]?.year || new Date().getFullYear();
      const seasonCode = seasonResult.rows[0]?.season_code || 'S1';

      // 4. 创建Clauch competition记录
      const competitionQuery = `
        INSERT INTO competitions (season_id, type, name, status, format, scoring_rules, max_teams, start_date, end_date)
        VALUES ($1, 'clauch', $2, 'active', $3, $4, 32, NOW(), NOW() + INTERVAL '2 months')
        ON CONFLICT (season_id, type) DO UPDATE 
        SET status = 'active', updated_at = NOW()
        RETURNING id
      `;
      const competitionResult = await client.query(competitionQuery, [
        request.seasonId,
        `${seasonCode} Clauch洲际赛`,
        JSON.stringify({ type: 'group_stage_knockout' }),
        JSON.stringify({})
      ]);
      const competitionId = competitionResult.rows[0].id;

      logger.info('Clauch competition创建成功', {
        seasonId: request.seasonId,
        seasonCode,
        competitionId
      });

      // 5. 创建Clauch对阵表
      const pointsDistribution = {
        champion: 20,
        runnerUp: 16,
        thirdPlace: 12,
        fourthPlace: 8,
        eastFinalLoser: 6,
        westFinalLoser: 6,
        eastSemiLoser: 4,
        westSemiLoser: 4,
        eastRound1Loser: 2,
        westRound1Loser: 2
      };

      const insertBracketQuery = `
        INSERT INTO clauch_brackets (
          season_id, season_year, status, current_stage, points_distribution
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const bracketResult = await client.query(insertBracketQuery, [
        request.seasonId,
        seasonYear,
        'not_started',
        'group_stage',
        JSON.stringify(pointsDistribution)
      ]);

      const bracketId = bracketResult.rows[0].id;

      // 6. 插入参赛资格记录
      for (const team of qualifiedTeams) {
        await client.query(
          `INSERT INTO clauch_qualifications (
            clauch_bracket_id, team_id, region_id,
            summer_regular_rank, summer_regular_points, group_name
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            bracketId,
            team.teamId,
            team.regionId,
            team.summerRegularRank,
            team.summerRegularPoints,
            team.groupName
          ]
        );

        // 初始化小组积分榜
        await client.query(
          `INSERT INTO clauch_group_standings (
            clauch_bracket_id, team_id, group_name
          ) VALUES ($1, $2, $3)`,
          [bracketId, team.teamId, team.groupName]
        );
      }

      // 7. 生成小组赛赛程
      await this.generateGroupMatches(client, bracketId, qualifiedTeams);

      // 8. 更新bracket状态为group_stage（小组赛已生成，可以开始比赛）
      await client.query(
        `UPDATE clauch_brackets SET status = $1, current_stage = $2 WHERE id = $3`,
        ['group_stage', 'group_stage', bracketId]
      );

      // 9. 构建分组信息
      const groups = await this.getGroups(client, bracketId);

      await client.query('COMMIT');

      logger.info('Clauch洲际赛生成成功', {
        seasonId: request.seasonId,
        bracketId,
        teamsCount: qualifiedTeams.length
      });

      // 10. 返回完整的Clauch对阵
      return {
        id: bracketId,
        seasonId: request.seasonId,
        seasonYear,
        status: 'group_stage',
        currentStage: 'group_stage',
        qualifiedTeams,
        groups,
        pointsDistribution,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('生成Clauch失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '生成Clauch失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 生成小组赛赛程
   * 规则: 每组4队，BO3单循环，每组6场比赛
   */
  private async generateGroupMatches(
    client: PoolClient,
    bracketId: string,
    qualifiedTeams: ClauchQualification[]
  ): Promise<void> {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    for (const groupName of groups) {
      const groupTeams = qualifiedTeams.filter(t => t.groupName === groupName);

      if (groupTeams.length !== 4) {
        logger.warn(`小组${groupName}的队伍数量不是4支`, { count: groupTeams.length });
        continue;
      }

      // 生成单循环赛程（6场比赛）
      const matches: [number, number][] = [
        [0, 1], [2, 3], // 第1轮
        [0, 2], [1, 3], // 第2轮
        [0, 3], [1, 2]  // 第3轮
      ];

      let roundNumber = 1;
      let matchesInRound = 0;

      for (let i = 0; i < matches.length; i++) {
        const [idx1, idx2] = matches[i];
        const teamA = groupTeams[idx1];
        const teamB = groupTeams[idx2];

        await client.query(
          `INSERT INTO clauch_matches (
            clauch_bracket_id, stage, group_name, round_in_group, best_of,
            team_a_id, team_b_id, team_a_name, team_b_name, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            bracketId,
            'group_stage',
            groupName,
            roundNumber,
            3, // BO3
            teamA.teamId,
            teamB.teamId,
            teamA.teamName,
            teamB.teamName,
            'scheduled'
          ]
        );

        matchesInRound++;
        if (matchesInRound === 2) {
          roundNumber++;
          matchesInRound = 0;
        }
      }
    }

    logger.info('小组赛赛程生成完成', { bracketId, groupsCount: groups.length });
  }

  /**
   * 获取分组信息
   */
  private async getGroups(client: PoolClient, bracketId: string): Promise<ClauchGroup[]> {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const result: ClauchGroup[] = [];

    for (const groupName of groups) {
      // 获取小组队伍
      const teamsQuery = `
        SELECT 
          cq.team_id,
          t.name as team_name,
          cq.region_id,
          r.name as region_name,
          cq.summer_regular_rank,
          cq.summer_regular_points,
          cq.group_name
        FROM clauch_qualifications cq
        JOIN teams t ON t.id = cq.team_id
        JOIN regions r ON r.id = cq.region_id
        WHERE cq.clauch_bracket_id = $1 AND cq.group_name = $2
        ORDER BY cq.summer_regular_rank
      `;
      const teamsResult = await client.query(teamsQuery, [bracketId, groupName]);

      const teams: ClauchQualification[] = teamsResult.rows.map(row => ({
        teamId: row.team_id.toString(),
        teamName: row.team_name,
        regionId: row.region_id.toString(),
        regionName: row.region_name,
        summerRegularRank: row.summer_regular_rank,
        summerRegularPoints: row.summer_regular_points,
        groupName: row.group_name
      }));

      // 获取小组比赛
      const matchesQuery = `
        SELECT * FROM clauch_matches
        WHERE clauch_bracket_id = $1 AND group_name = $2
        ORDER BY round_in_group, id
      `;
      const matchesResult = await client.query(matchesQuery, [bracketId, groupName]);

      const matches: ClauchMatch[] = matchesResult.rows.map(this.mapMatchRow);

      // 获取小组积分榜
      const standingsQuery = `
        SELECT 
          cgs.*,
          t.name as team_name
        FROM clauch_group_standings cgs
        JOIN teams t ON t.id = cgs.team_id
        WHERE cgs.clauch_bracket_id = $1 AND cgs.group_name = $2
        ORDER BY cgs.points DESC, cgs.round_differential DESC
      `;
      const standingsResult = await client.query(standingsQuery, [bracketId, groupName]);

      const standings: ClauchGroupStanding[] = standingsResult.rows.map(row => ({
        teamId: row.team_id.toString(),
        teamName: row.team_name,
        groupName: row.group_name,
        matchesPlayed: row.matches_played,
        wins: row.wins,
        losses: row.losses,
        points: row.points,
        roundsWon: row.rounds_won,
        roundsLost: row.rounds_lost,
        roundDifferential: row.round_differential,
        position: row.position || 0,
        qualified: row.qualified || false
      }));

      result.push({
        groupName,
        teams,
        matches,
        standings
      });
    }

    return result;
  }

  /**
   * 获取Clauch对阵信息
   */
  async getClauchBracket(seasonId: string): Promise<ClauchBracket> {
    try {
      // 1. 获取Clauch对阵表
      const bracketQuery = `SELECT * FROM clauch_brackets WHERE season_id = $1`;
      const bracketResult = await db.query(bracketQuery, [seasonId]);

      if (bracketResult.rows.length === 0) {
        throw new BusinessError(
          ErrorCodes.MSI_NOT_FOUND,
          '该赛季的Clauch洲际赛不存在'
        );
      }

      const bracket = bracketResult.rows[0];
      const client = await db.getClient();

      try {
        // 2. 获取参赛队伍
        const teamsQuery = `
          SELECT 
            cq.team_id,
            t.name as team_name,
            cq.region_id,
            r.name as region_name,
            cq.summer_regular_rank,
            cq.summer_regular_points,
            cq.group_name,
            cq.qualified_to_knockout,
            cq.knockout_bracket
          FROM clauch_qualifications cq
          JOIN teams t ON t.id = cq.team_id
          JOIN regions r ON r.id = cq.region_id
          WHERE cq.clauch_bracket_id = $1
          ORDER BY cq.group_name, cq.summer_regular_rank
        `;
        const teamsResult = await client.query(teamsQuery, [bracket.id]);

        const qualifiedTeams: ClauchQualification[] = teamsResult.rows.map(row => ({
          teamId: row.team_id.toString(),
          teamName: row.team_name,
          regionId: row.region_id.toString(),
          regionName: row.region_name,
          summerRegularRank: row.summer_regular_rank,
          summerRegularPoints: row.summer_regular_points,
          groupName: row.group_name
        }));

        // 3. 获取分组信息
        const groups = await this.getGroups(client, bracket.id);

        // 4. 获取淘汰赛信息（如果已生成）
        let knockoutEast, knockoutWest, thirdPlaceMatch, grandFinal;

        if (bracket.status === 'knockout_stage' || bracket.status === 'completed') {
          knockoutEast = await this.getKnockoutBracket(client, bracket.id, 'east');
          knockoutWest = await this.getKnockoutBracket(client, bracket.id, 'west');

          // 获取季军赛和总决赛
          const specialMatchesQuery = `
            SELECT * FROM clauch_matches
            WHERE clauch_bracket_id = $1 AND knockout_round IN ('third_place', 'grand_final')
          `;
          const specialMatchesResult = await client.query(specialMatchesQuery, [bracket.id]);

          for (const row of specialMatchesResult.rows) {
            const match = this.mapMatchRow(row);
            if (row.knockout_round === 'third_place') {
              thirdPlaceMatch = match;
            } else if (row.knockout_round === 'grand_final') {
              grandFinal = match;
            }
          }
        }

        // 5. 获取最终排名
        let champion, runnerUp, thirdPlace, fourthPlace;

        if (bracket.champion_id) {
          champion = qualifiedTeams.find(t => t.teamId === bracket.champion_id.toString());
        }
        if (bracket.runner_up_id) {
          runnerUp = qualifiedTeams.find(t => t.teamId === bracket.runner_up_id.toString());
        }
        if (bracket.third_place_id) {
          thirdPlace = qualifiedTeams.find(t => t.teamId === bracket.third_place_id.toString());
        }
        if (bracket.fourth_place_id) {
          fourthPlace = qualifiedTeams.find(t => t.teamId === bracket.fourth_place_id.toString());
        }

        return {
          id: bracket.id.toString(),
          seasonId: bracket.season_id.toString(),
          seasonYear: bracket.season_year,
          status: bracket.status,
          currentStage: bracket.current_stage,
          qualifiedTeams,
          groups,
          knockoutEast,
          knockoutWest,
          thirdPlaceMatch,
          grandFinal,
          champion,
          runnerUp,
          thirdPlace,
          fourthPlace,
          pointsDistribution: bracket.points_distribution,
          createdAt: bracket.created_at,
          updatedAt: bracket.updated_at
        };
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('获取Clauch对阵信息失败', { error: error.message, seasonId });
      if (error instanceof BusinessError) {
        throw error;
      }
      throw new BusinessError(
        ErrorCodes.MSI_NOT_FOUND,
        '获取Clauch对阵信息失败',
        error.message
      );
    }
  }

  /**
   * 获取淘汰赛半区信息
   */
  private async getKnockoutBracket(
    client: PoolClient,
    bracketId: string,
    bracket: 'east' | 'west'
  ): Promise<ClauchKnockoutBracket> {
    const round1Query = `
      SELECT * FROM clauch_matches
      WHERE clauch_bracket_id = $1 AND knockout_bracket = $2 AND knockout_round = $3
      ORDER BY match_number
    `;
    const round1Result = await client.query(round1Query, [bracketId, bracket, `${bracket}_round1`]);

    const semiQuery = `
      SELECT * FROM clauch_matches
      WHERE clauch_bracket_id = $1 AND knockout_bracket = $2 AND knockout_round = $3
      ORDER BY match_number
    `;
    const semiResult = await client.query(semiQuery, [bracketId, bracket, `${bracket}_semi`]);

    const finalQuery = `
      SELECT * FROM clauch_matches
      WHERE clauch_bracket_id = $1 AND knockout_bracket = $2 AND knockout_round = $3
    `;
    const finalResult = await client.query(finalQuery, [bracketId, bracket, `${bracket}_final`]);

    return {
      bracket,
      round1: round1Result.rows.map(this.mapMatchRow),
      semiFinals: semiResult.rows.map(this.mapMatchRow),
      final: finalResult.rows.map(this.mapMatchRow)
    };
  }

  /**
   * 模拟小组赛比赛
   */
  async simulateGroupMatch(request: SimulateClauchMatchRequest): Promise<SimulateClauchMatchResponse> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 获取比赛信息
      const matchQuery = `SELECT * FROM clauch_matches WHERE id = $1`;
      const matchResult = await client.query(matchQuery, [request.matchId]);

      if (matchResult.rows.length === 0) {
        throw new BusinessError(ErrorCodes.MATCH_NOT_FOUND, '比赛不存在');
      }

      const matchRow = matchResult.rows[0];

      if (matchRow.status === 'completed') {
        throw new BusinessError(ErrorCodes.MATCH_ALREADY_COMPLETED, '比赛已完成');
      }

      if (matchRow.stage !== 'group_stage') {
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          '该方法仅用于模拟小组赛比赛'
        );
      }

      // 2. 获取队伍战力
      const teamAQuery = `SELECT id, name, power_rating FROM teams WHERE id = $1`;
      const teamBQuery = `SELECT id, name, power_rating FROM teams WHERE id = $1`;

      const teamAResult = await client.query(teamAQuery, [matchRow.team_a_id]);
      const teamBResult = await client.query(teamBQuery, [matchRow.team_b_id]);

      const teamA = teamAResult.rows[0];
      const teamB = teamBResult.rows[0];

      // 3. 模拟BO3比赛
      const { scoreA, scoreB, winnerId } = this.simulateBO3Match(
        teamA.id,
        teamA.power_rating,
        teamB.id,
        teamB.power_rating
      );

      // 4. 更新比赛结果
      await client.query(
        `UPDATE clauch_matches
         SET score_a = $1, score_b = $2, winner_id = $3, status = $4, completed_at = NOW()
         WHERE id = $5`,
        [scoreA, scoreB, winnerId, 'completed', request.matchId]
      );

      // 5. 更新小组积分榜
      await this.updateGroupStandings(
        client,
        matchRow.clauch_bracket_id,
        matchRow.group_name,
        matchRow.team_a_id,
        matchRow.team_b_id,
        scoreA,
        scoreB
      );

      // 6. 获取更新后的积分榜
      const standingsQuery = `
        SELECT 
          cgs.*,
          t.name as team_name
        FROM clauch_group_standings cgs
        JOIN teams t ON t.id = cgs.team_id
        WHERE cgs.clauch_bracket_id = $1 AND cgs.group_name = $2
        ORDER BY cgs.points DESC, cgs.round_differential DESC
      `;
      const standingsResult = await client.query(standingsQuery, [
        matchRow.clauch_bracket_id,
        matchRow.group_name
      ]);

      const updatedStandings: ClauchGroupStanding[] = standingsResult.rows.map(row => ({
        teamId: row.team_id.toString(),
        teamName: row.team_name,
        groupName: row.group_name,
        matchesPlayed: row.matches_played,
        wins: row.wins,
        losses: row.losses,
        points: row.points,
        roundsWon: row.rounds_won,
        roundsLost: row.rounds_lost,
        roundDifferential: row.round_differential,
        position: row.position || 0,
        qualified: row.qualified || false
      }));

      await client.query('COMMIT');

      logger.info('小组赛比赛模拟成功', {
        matchId: request.matchId,
        scoreA,
        scoreB,
        winnerId
      });

      const updatedMatch = this.mapMatchRow({
        ...matchRow,
        score_a: scoreA,
        score_b: scoreB,
        winner_id: winnerId,
        status: 'completed',
        completed_at: new Date()
      });

      return {
        match: updatedMatch,
        updatedStandings
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('模拟小组赛比赛失败', { error: error.message, matchId: request.matchId });

      if (error instanceof BusinessError) {
        throw error;
      }
      throw new BusinessError(
        ErrorCodes.SIMULATION_FAILED,
        '模拟小组赛比赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 模拟BO3比赛
   */
  private simulateBO3Match(
    teamAId: string,
    teamAPower: number,
    teamBId: string,
    teamBPower: number
  ): { scoreA: number; scoreB: number; winnerId: string } {
    let scoreA = 0;
    let scoreB = 0;

    // 模拟最多3局
    for (let i = 0; i < 3; i++) {
      if (scoreA === 2 || scoreB === 2) break;

      const winProbA = teamAPower / (teamAPower + teamBPower);
      const random = Math.random();

      if (random < winProbA) {
        scoreA++;
      } else {
        scoreB++;
      }
    }

    const winnerId = scoreA > scoreB ? teamAId : teamBId;

    return { scoreA, scoreB, winnerId };
  }

  /**
   * 更新小组积分榜
   * 积分规则: 2:0=3分, 2:1=2分, 1:2=1分, 0:2=0分
   */
  private async updateGroupStandings(
    client: PoolClient,
    bracketId: string,
    groupName: string,
    teamAId: string,
    teamBId: string,
    scoreA: number,
    scoreB: number
  ): Promise<void> {
    // 计算积分
    let pointsA = 0;
    let pointsB = 0;

    if (scoreA === 2 && scoreB === 0) {
      pointsA = 3;
      pointsB = 0;
    } else if (scoreA === 2 && scoreB === 1) {
      pointsA = 2;
      pointsB = 1;
    } else if (scoreA === 1 && scoreB === 2) {
      pointsA = 1;
      pointsB = 2;
    } else if (scoreA === 0 && scoreB === 2) {
      pointsA = 0;
      pointsB = 3;
    }

    const winnerId = scoreA > scoreB ? teamAId : teamBId;

    // 更新队伍A
    await client.query(
      `UPDATE clauch_group_standings
       SET matches_played = matches_played + 1,
           wins = wins + $1,
           losses = losses + $2,
           points = points + $3,
           rounds_won = rounds_won + $4,
           rounds_lost = rounds_lost + $5,
           round_differential = round_differential + $6
       WHERE clauch_bracket_id = $7 AND team_id = $8`,
      [
        winnerId === teamAId ? 1 : 0, // wins
        winnerId === teamAId ? 0 : 1, // losses
        pointsA,
        scoreA,
        scoreB,
        scoreA - scoreB,
        bracketId,
        teamAId
      ]
    );

    // 更新队伍B
    await client.query(
      `UPDATE clauch_group_standings
       SET matches_played = matches_played + 1,
           wins = wins + $1,
           losses = losses + $2,
           points = points + $3,
           rounds_won = rounds_won + $4,
           rounds_lost = rounds_lost + $5,
           round_differential = round_differential + $6
       WHERE clauch_bracket_id = $7 AND team_id = $8`,
      [
        winnerId === teamBId ? 1 : 0, // wins
        winnerId === teamBId ? 0 : 1, // losses
        pointsB,
        scoreB,
        scoreA,
        scoreB - scoreA,
        bracketId,
        teamBId
      ]
    );

    // 更新小组排名
    await this.updateGroupRankings(client, bracketId, groupName);
  }

  /**
   * 更新小组排名
   */
  private async updateGroupRankings(
    client: PoolClient,
    bracketId: string,
    groupName: string
  ): Promise<void> {
    // 获取小组积分榜，按积分和净胜局排序
    const standingsQuery = `
      SELECT team_id
      FROM clauch_group_standings
      WHERE clauch_bracket_id = $1 AND group_name = $2
      ORDER BY points DESC, round_differential DESC, wins DESC
    `;
    const standingsResult = await client.query(standingsQuery, [bracketId, groupName]);

    // 更新排名和晋级状态
    for (let i = 0; i < standingsResult.rows.length; i++) {
      const teamId = standingsResult.rows[i].team_id;
      const position = i + 1;
      const qualified = position <= 2; // 前2名晋级

      await client.query(
        `UPDATE clauch_group_standings
         SET position = $1, qualified = $2
         WHERE clauch_bracket_id = $3 AND team_id = $4`,
        [position, qualified, bracketId, teamId]
      );

      // 更新qualifications表的晋级状态
      await client.query(
        `UPDATE clauch_qualifications
         SET qualified_to_knockout = $1
         WHERE clauch_bracket_id = $2 AND team_id = $3`,
        [qualified, bracketId, teamId]
      );
    }
  }

  /**
   * 生成淘汰赛对阵
   * 规则: 每组前2名晋级，共16队，分东西半区各8队
   */
  async generateKnockout(bracketId: string): Promise<void> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 检查小组赛是否完成
      const allMatchesQuery = `
        SELECT COUNT(*) as total, 
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM clauch_matches
        WHERE clauch_bracket_id = $1 AND stage = 'group_stage'
      `;
      const matchesResult = await client.query(allMatchesQuery, [bracketId]);
      const { total, completed } = matchesResult.rows[0];

      if (parseInt(total) !== parseInt(completed)) {
        throw new BusinessError(
          ErrorCodes.GROUP_STAGE_NOT_COMPLETE,
          `小组赛尚未完成(${completed}/${total})`
        );
      }

      // 2. 获取所有晋级队伍（每组前2名）
      const qualifiedQuery = `
        SELECT 
          cgs.team_id,
          t.name as team_name,
          cgs.group_name,
          cgs.position,
          t.power_rating
        FROM clauch_group_standings cgs
        JOIN teams t ON t.id = cgs.team_id
        WHERE cgs.clauch_bracket_id = $1 AND cgs.qualified = true
        ORDER BY cgs.group_name, cgs.position
      `;
      const qualifiedResult = await client.query(qualifiedQuery, [bracketId]);

      if (qualifiedResult.rows.length !== 16) {
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          `晋级队伍数量异常(${qualifiedResult.rows.length}/16)`
        );
      }

      const qualifiedTeams = qualifiedResult.rows;

      // 3. 分配东西半区
      // 策略: A-D组第1名和E-H组第2名进入东半区，E-H组第1名和A-D组第2名进入西半区
      const eastTeams: any[] = [];
      const westTeams: any[] = [];

      for (const team of qualifiedTeams) {
        const groupLetter = team.group_name.charCodeAt(0); // A=65, B=66, ..., H=72
        const isFirstHalf = groupLetter <= 68; // A-D (65-68)

        if ((isFirstHalf && team.position === 1) || (!isFirstHalf && team.position === 2)) {
          eastTeams.push(team);
          await client.query(
            `UPDATE clauch_qualifications
             SET knockout_bracket = 'east'
             WHERE clauch_bracket_id = $1 AND team_id = $2`,
            [bracketId, team.team_id]
          );
        } else {
          westTeams.push(team);
          await client.query(
            `UPDATE clauch_qualifications
             SET knockout_bracket = 'west'
             WHERE clauch_bracket_id = $1 AND team_id = $2`,
            [bracketId, team.team_id]
          );
        }
      }

      // 4. 生成淘汰赛对阵（东西半区各自进行）
      await this.generateKnockoutMatches(client, bracketId, 'east', eastTeams);
      await this.generateKnockoutMatches(client, bracketId, 'west', westTeams);

      // 5. 生成季军赛和总决赛（暂时不分配队伍，等半决赛完成后）
      await client.query(
        `INSERT INTO clauch_matches (
          clauch_bracket_id, stage, knockout_round, best_of, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [bracketId, 'knockout', 'third_place', 5, 'scheduled']
      );

      await client.query(
        `INSERT INTO clauch_matches (
          clauch_bracket_id, stage, knockout_round, best_of, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [bracketId, 'knockout', 'grand_final', 5, 'scheduled']
      );

      // 6. 更新bracket状态
      await client.query(
        `UPDATE clauch_brackets
         SET status = 'knockout_stage', current_stage = 'knockout'
         WHERE id = $1`,
        [bracketId]
      );

      await client.query('COMMIT');

      logger.info('淘汰赛对阵生成成功', {
        bracketId,
        eastTeamsCount: eastTeams.length,
        westTeamsCount: westTeams.length
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('生成淘汰赛对阵失败', { error: error.message, bracketId });

      if (error instanceof BusinessError) {
        throw error;
      }
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '生成淘汰赛对阵失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 生成单个半区的淘汰赛对阵
   */
  private async generateKnockoutMatches(
    client: PoolClient,
    bracketId: string,
    bracket: 'east' | 'west',
    teams: any[]
  ): Promise<void> {
    if (teams.length !== 8) {
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        `半区${bracket}的队伍数量不是8支`
      );
    }

    // 第一轮对阵 (4场)
    // 种子配对: 1-8, 2-7, 3-6, 4-5
    const round1Pairings = [
      [0, 7], // 1st vs 8th
      [1, 6], // 2nd vs 7th
      [2, 5], // 3rd vs 6th
      [3, 4]  // 4th vs 5th
    ];

    for (let i = 0; i < round1Pairings.length; i++) {
      const [idx1, idx2] = round1Pairings[i];
      const teamA = teams[idx1];
      const teamB = teams[idx2];

      await client.query(
        `INSERT INTO clauch_matches (
          clauch_bracket_id, stage, knockout_bracket, knockout_round, match_number, best_of,
          team_a_id, team_b_id, team_a_name, team_b_name, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          bracketId,
          'knockout',
          bracket,
          `${bracket}_round1`,
          i + 1,
          5, // BO5
          teamA.team_id,
          teamB.team_id,
          teamA.team_name,
          teamB.team_name,
          'scheduled'
        ]
      );
    }

    // 半决赛 (2场, 暂不分配队伍)
    for (let i = 0; i < 2; i++) {
      await client.query(
        `INSERT INTO clauch_matches (
          clauch_bracket_id, stage, knockout_bracket, knockout_round, match_number, best_of, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [bracketId, 'knockout', bracket, `${bracket}_semi`, i + 1, 5, 'scheduled']
      );
    }

    // 决赛 (1场, 暂不分配队伍)
    await client.query(
      `INSERT INTO clauch_matches (
        clauch_bracket_id, stage, knockout_bracket, knockout_round, best_of, status
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [bracketId, 'knockout', bracket, `${bracket}_final`, 5, 'scheduled']
    );
  }

  /**
   * 模拟淘汰赛比赛
   */
  async simulateKnockoutMatch(request: SimulateClauchMatchRequest): Promise<ClauchMatch> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 获取比赛信息
      const matchQuery = `SELECT * FROM clauch_matches WHERE id = $1`;
      const matchResult = await client.query(matchQuery, [request.matchId]);

      if (matchResult.rows.length === 0) {
        throw new BusinessError(ErrorCodes.MATCH_NOT_FOUND, '比赛不存在');
      }

      const matchRow = matchResult.rows[0];

      if (matchRow.status === 'completed') {
        throw new BusinessError(ErrorCodes.MATCH_ALREADY_COMPLETED, '比赛已完成');
      }

      if (matchRow.stage !== 'knockout') {
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          '该方法仅用于模拟淘汰赛比赛'
        );
      }

      if (!matchRow.team_a_id || !matchRow.team_b_id) {
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          '比赛对阵尚未确定'
        );
      }

      // 2. 获取队伍战力
      const teamAQuery = `SELECT id, name, power_rating FROM teams WHERE id = $1`;
      const teamBQuery = `SELECT id, name, power_rating FROM teams WHERE id = $1`;

      const teamAResult = await client.query(teamAQuery, [matchRow.team_a_id]);
      const teamBResult = await client.query(teamBQuery, [matchRow.team_b_id]);

      const teamA = teamAResult.rows[0];
      const teamB = teamBResult.rows[0];

      // 3. 模拟BO5比赛
      const { scoreA, scoreB, winnerId } = this.simulateBO5Match(
        teamA.id,
        teamA.power_rating,
        teamB.id,
        teamB.power_rating
      );

      const loserId = winnerId === teamA.id ? teamB.id : teamA.id;

      // 4. 更新比赛结果
      await client.query(
        `UPDATE clauch_matches
         SET score_a = $1, score_b = $2, winner_id = $3, status = $4, completed_at = NOW()
         WHERE id = $5`,
        [scoreA, scoreB, winnerId, 'completed', request.matchId]
      );

      // 5. 更新后续比赛对阵
      await this.updateNextKnockoutMatch(
        client,
        matchRow.clauch_bracket_id,
        matchRow.knockout_round,
        matchRow.match_number,
        winnerId,
        loserId
      );

      // 6. 检查是否所有比赛完成
      await this.checkAndFinalizeTournament(client, matchRow.clauch_bracket_id);

      await client.query('COMMIT');

      logger.info('淘汰赛比赛模拟成功', {
        matchId: request.matchId,
        round: matchRow.knockout_round,
        scoreA,
        scoreB,
        winnerId
      });

      return this.mapMatchRow({
        ...matchRow,
        score_a: scoreA,
        score_b: scoreB,
        winner_id: winnerId,
        status: 'completed',
        completed_at: new Date()
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('模拟淘汰赛比赛失败', { error: error.message, matchId: request.matchId });

      if (error instanceof BusinessError) {
        throw error;
      }
      throw new BusinessError(
        ErrorCodes.SIMULATION_FAILED,
        '模拟淘汰赛比赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 模拟BO5比赛
   */
  private simulateBO5Match(
    teamAId: string,
    teamAPower: number,
    teamBId: string,
    teamBPower: number
  ): { scoreA: number; scoreB: number; winnerId: string } {
    let scoreA = 0;
    let scoreB = 0;

    // 模拟最多5局
    for (let i = 0; i < 5; i++) {
      if (scoreA === 3 || scoreB === 3) break;

      const winProbA = teamAPower / (teamAPower + teamBPower);
      const random = Math.random();

      if (random < winProbA) {
        scoreA++;
      } else {
        scoreB++;
      }
    }

    const winnerId = scoreA > scoreB ? teamAId : teamBId;

    return { scoreA, scoreB, winnerId };
  }

  /**
   * 更新下一场淘汰赛对阵
   */
  private async updateNextKnockoutMatch(
    client: PoolClient,
    bracketId: string,
    currentRound: string,
    matchNumber: number,
    winnerId: string,
    loserId: string
  ): Promise<void> {
    // 获取胜者和败者的队伍信息
    const winnerQuery = `SELECT id, name FROM teams WHERE id = $1`;
    const winnerResult = await client.query(winnerQuery, [winnerId]);
    const winner = winnerResult.rows[0];

    // 根据当前轮次确定下一场比赛
    if (currentRound === 'east_round1' || currentRound === 'west_round1') {
      // 第一轮 -> 半决赛
      const bracket = currentRound.split('_')[0]; // 'east' or 'west'
      const semiMatchNumber = Math.ceil(matchNumber / 2); // 1-2 -> 1, 3-4 -> 2

      const semiQuery = `
        SELECT id, team_a_id, team_b_id
        FROM clauch_matches
        WHERE clauch_bracket_id = $1 AND knockout_round = $2 AND match_number = $3
      `;
      const semiResult = await client.query(semiQuery, [
        bracketId,
        `${bracket}_semi`,
        semiMatchNumber
      ]);

      if (semiResult.rows.length > 0) {
        const semiMatch = semiResult.rows[0];

        // 如果是奇数matchNumber，更新teamA，否则更新teamB
        if (matchNumber % 2 === 1) {
          await client.query(
            `UPDATE clauch_matches
             SET team_a_id = $1, team_a_name = $2
             WHERE id = $3`,
            [winner.id, winner.name, semiMatch.id]
          );
        } else {
          await client.query(
            `UPDATE clauch_matches
             SET team_b_id = $1, team_b_name = $2
             WHERE id = $3`,
            [winner.id, winner.name, semiMatch.id]
          );
        }
      }
    } else if (currentRound === 'east_semi' || currentRound === 'west_semi') {
      // 半决赛 -> 决赛 或 季军赛
      const bracket = currentRound.split('_')[0];

      // 更新决赛对阵
      const finalQuery = `
        SELECT id, team_a_id, team_b_id
        FROM clauch_matches
        WHERE clauch_bracket_id = $1 AND knockout_round = $2
      `;
      const finalResult = await client.query(finalQuery, [bracketId, `${bracket}_final`]);

      if (finalResult.rows.length > 0) {
        const finalMatch = finalResult.rows[0];

        if (matchNumber === 1) {
          await client.query(
            `UPDATE clauch_matches
             SET team_a_id = $1, team_a_name = $2
             WHERE id = $3`,
            [winner.id, winner.name, finalMatch.id]
          );
        } else {
          await client.query(
            `UPDATE clauch_matches
             SET team_b_id = $1, team_b_name = $2
             WHERE id = $3`,
            [winner.id, winner.name, finalMatch.id]
          );
        }
      }

      // 败者进入季军赛池
      // 注意：需要等两个半决赛都完成后才能确定季军赛对阵
    } else if (currentRound === 'east_final' || currentRound === 'west_final') {
      // 决赛 -> 总决赛
      const grandFinalQuery = `
        SELECT id, team_a_id, team_b_id
        FROM clauch_matches
        WHERE clauch_bracket_id = $1 AND knockout_round = 'grand_final'
      `;
      const grandFinalResult = await client.query(grandFinalQuery, [bracketId]);

      if (grandFinalResult.rows.length > 0) {
        const grandFinal = grandFinalResult.rows[0];

        if (currentRound === 'east_final') {
          await client.query(
            `UPDATE clauch_matches
             SET team_a_id = $1, team_a_name = $2
             WHERE id = $3`,
            [winner.id, winner.name, grandFinal.id]
          );
        } else {
          await client.query(
            `UPDATE clauch_matches
             SET team_b_id = $1, team_b_name = $2
             WHERE id = $3`,
            [winner.id, winner.name, grandFinal.id]
          );
        }
      }

      // 败者进入季军赛
      const loserQuery = `SELECT id, name FROM teams WHERE id = $1`;
      const loserResult = await client.query(loserQuery, [loserId]);
      const loser = loserResult.rows[0];

      const thirdPlaceQuery = `
        SELECT id, team_a_id, team_b_id
        FROM clauch_matches
        WHERE clauch_bracket_id = $1 AND knockout_round = 'third_place'
      `;
      const thirdPlaceResult = await client.query(thirdPlaceQuery, [bracketId]);

      if (thirdPlaceResult.rows.length > 0) {
        const thirdPlace = thirdPlaceResult.rows[0];

        if (currentRound === 'east_final') {
          await client.query(
            `UPDATE clauch_matches
             SET team_a_id = $1, team_a_name = $2
             WHERE id = $3`,
            [loser.id, loser.name, thirdPlace.id]
          );
        } else {
          await client.query(
            `UPDATE clauch_matches
             SET team_b_id = $1, team_b_name = $2
             WHERE id = $3`,
            [loser.id, loser.name, thirdPlace.id]
          );
        }
      }
    }
  }

  /**
   * 检查并完成整个赛事
   */
  private async checkAndFinalizeTournament(client: PoolClient, bracketId: string): Promise<void> {
    // 检查总决赛是否完成
    const grandFinalQuery = `
      SELECT * FROM clauch_matches
      WHERE clauch_bracket_id = $1 AND knockout_round = 'grand_final' AND status = 'completed'
    `;
    const grandFinalResult = await client.query(grandFinalQuery, [bracketId]);

    if (grandFinalResult.rows.length === 0) {
      return; // 总决赛尚未完成
    }

    const grandFinal = grandFinalResult.rows[0];

    // 检查季军赛是否完成
    const thirdPlaceQuery = `
      SELECT * FROM clauch_matches
      WHERE clauch_bracket_id = $1 AND knockout_round = 'third_place' AND status = 'completed'
    `;
    const thirdPlaceResult = await client.query(thirdPlaceQuery, [bracketId]);

    if (thirdPlaceResult.rows.length === 0) {
      return; // 季军赛尚未完成
    }

    const thirdPlace = thirdPlaceResult.rows[0];

    // 确定最终排名
    const championId = grandFinal.winner_id;
    const runnerUpId = grandFinal.winner_id === grandFinal.team_a_id ? grandFinal.team_b_id : grandFinal.team_a_id;
    const thirdPlaceId = thirdPlace.winner_id;
    const fourthPlaceId = thirdPlace.winner_id === thirdPlace.team_a_id ? thirdPlace.team_b_id : thirdPlace.team_a_id;

    // 更新bracket状态和排名
    await client.query(
      `UPDATE clauch_brackets
       SET status = 'completed',
           champion_id = $1,
           runner_up_id = $2,
           third_place_id = $3,
           fourth_place_id = $4
       WHERE id = $5`,
      [championId, runnerUpId, thirdPlaceId, fourthPlaceId, bracketId]
    );

    // 分配积分
    await this.distributePoints(client, bracketId);

    logger.info('Clauch洲际赛完成', {
      bracketId,
      championId,
      runnerUpId,
      thirdPlaceId
    });
  }

  /**
   * 分配积分
   */
  private async distributePoints(client: PoolClient, bracketId: string): Promise<void> {
    try {
      // 获取bracket信息
      const bracketQuery = `SELECT * FROM clauch_brackets WHERE id = $1`;
      const bracketResult = await client.query(bracketQuery, [bracketId]);
      const bracket = bracketResult.rows[0];

      const pointsDistribution = bracket.points_distribution;

      // 获取赛季年份
      const seasonQuery = `SELECT year FROM seasons WHERE id = $1`;
      const seasonResult = await client.query(seasonQuery, [bracket.season_id]);
      const seasonYear = seasonResult.rows[0]?.year;
      
      if (!seasonYear) {
        logger.error('未找到赛季信息，跳过积分分配', { seasonId: bracket.season_id });
        return;
      }
      
      // 获取或创建 Clauch competition 记录
      const competitionQuery = `
        SELECT id FROM competitions 
        WHERE season_id = $1 AND type = 'clauch'
        LIMIT 1
      `;
      const competitionResult = await client.query(competitionQuery, [bracket.season_id]);
      
      if (competitionResult.rows.length === 0) {
        // 如果没有 competition 记录，暂时跳过积分分配
        logger.warn('未找到Clauch competition记录，跳过积分分配', { 
          seasonId: bracket.season_id, 
          bracketId 
        });
        return;
      }
      
      const competitionId = competitionResult.rows[0].id;
      
      // 分配冠亚季殿军积分
      if (bracket.champion_id) {
        // honor_records
        await client.query(
          `INSERT INTO honor_records (season_id, competition_id, team_id, position, points, created_at)
           VALUES ($1, $2, $3, 1, $4, NOW())
           ON CONFLICT (competition_id, team_id) 
           DO UPDATE SET position = 1, points = $4, updated_at = NOW()`,
          [bracket.season_id, competitionId, bracket.champion_id, pointsDistribution.champion]
        );
        // score_records
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), 'C洲际赛冠军')`,
          [bracket.champion_id, competitionId, pointsDistribution.champion, seasonYear]
        );
      }

      if (bracket.runner_up_id) {
        // honor_records
        await client.query(
          `INSERT INTO honor_records (season_id, competition_id, team_id, position, points, created_at)
           VALUES ($1, $2, $3, 2, $4, NOW())
           ON CONFLICT (competition_id, team_id) 
           DO UPDATE SET position = 2, points = $4, updated_at = NOW()`,
          [bracket.season_id, competitionId, bracket.runner_up_id, pointsDistribution.runnerUp]
        );
        // score_records
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), 'C洲际赛亚军')`,
          [bracket.runner_up_id, competitionId, pointsDistribution.runnerUp, seasonYear]
        );
      }

      if (bracket.third_place_id) {
        // honor_records
        await client.query(
          `INSERT INTO honor_records (season_id, competition_id, team_id, position, points, created_at)
           VALUES ($1, $2, $3, 3, $4, NOW())
           ON CONFLICT (competition_id, team_id) 
           DO UPDATE SET position = 3, points = $4, updated_at = NOW()`,
          [bracket.season_id, competitionId, bracket.third_place_id, pointsDistribution.thirdPlace]
        );
        // score_records
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), 'C洲际赛季军')`,
          [bracket.third_place_id, competitionId, pointsDistribution.thirdPlace, seasonYear]
        );
      }

      if (bracket.fourth_place_id) {
        // honor_records
        await client.query(
          `INSERT INTO honor_records (season_id, competition_id, team_id, position, points, created_at)
           VALUES ($1, $2, $3, 4, $4, NOW())
           ON CONFLICT (competition_id, team_id) 
           DO UPDATE SET position = 4, points = $4, updated_at = NOW()`,
          [bracket.season_id, competitionId, bracket.fourth_place_id, pointsDistribution.fourthPlace]
        );
        // score_records
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), 'C洲际赛殿军')`,
          [bracket.fourth_place_id, competitionId, pointsDistribution.fourthPlace, seasonYear]
        );
      }

      // 分配东西半区决赛败者积分（5-6名）
      // 注意：honor_records表只记录前4名，第5名及以后只记录到score_records
      const eastFinalQuery = `
        SELECT team_a_id, team_b_id, winner_id 
        FROM clauch_matches 
        WHERE clauch_bracket_id = $1 AND knockout_round = 'east_final' AND status = 'completed'
      `;
      const eastFinalResult = await client.query(eastFinalQuery, [bracketId]);
      if (eastFinalResult.rows.length > 0) {
        const eastFinal = eastFinalResult.rows[0];
        const eastFinalLoserId = eastFinal.winner_id === eastFinal.team_a_id ? eastFinal.team_b_id : eastFinal.team_a_id;
        
        // 只插入score_records，不插入honor_records
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), 'C洲际赛第5名')`,
          [eastFinalLoserId, competitionId, pointsDistribution.eastFinalLoser, seasonYear]
        );
      }
      
      const westFinalQuery = `
        SELECT team_a_id, team_b_id, winner_id 
        FROM clauch_matches 
        WHERE clauch_bracket_id = $1 AND knockout_round = 'west_final' AND status = 'completed'
      `;
      const westFinalResult = await client.query(westFinalQuery, [bracketId]);
      if (westFinalResult.rows.length > 0) {
        const westFinal = westFinalResult.rows[0];
        const westFinalLoserId = westFinal.winner_id === westFinal.team_a_id ? westFinal.team_b_id : westFinal.team_a_id;
        
        // 只插入score_records，不插入honor_records
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), 'C洲际赛第6名')`,
          [westFinalLoserId, competitionId, pointsDistribution.westFinalLoser, seasonYear]
        );
      }

      // 分配东西半区半决赛败者积分（7-10名）
      // 只插入score_records，不插入honor_records
      const eastSemiQuery = `
        SELECT team_a_id, team_b_id, winner_id 
        FROM clauch_matches 
        WHERE clauch_bracket_id = $1 AND knockout_round = 'east_semi' AND status = 'completed'
        ORDER BY id
      `;
      const eastSemiResult = await client.query(eastSemiQuery, [bracketId]);
      let position = 7;
      for (const match of eastSemiResult.rows) {
        const loserId = match.winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
        
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), $5)`,
          [loserId, competitionId, pointsDistribution.eastSemiLoser, seasonYear, `C洲际赛第${position}名`]
        );
        position++;
      }
      
      const westSemiQuery = `
        SELECT team_a_id, team_b_id, winner_id 
        FROM clauch_matches 
        WHERE clauch_bracket_id = $1 AND knockout_round = 'west_semi' AND status = 'completed'
        ORDER BY id
      `;
      const westSemiResult = await client.query(westSemiQuery, [bracketId]);
      for (const match of westSemiResult.rows) {
        const loserId = match.winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
        
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), $5)`,
          [loserId, competitionId, pointsDistribution.westSemiLoser, seasonYear, `C洲际赛第${position}名`]
        );
        position++;
      }

      // 分配东西半区第一轮败者积分（11-18名）
      // 只插入score_records，不插入honor_records
      const eastRound1Query = `
        SELECT team_a_id, team_b_id, winner_id 
        FROM clauch_matches 
        WHERE clauch_bracket_id = $1 AND knockout_round = 'east_round1' AND status = 'completed'
        ORDER BY id
      `;
      const eastRound1Result = await client.query(eastRound1Query, [bracketId]);
      position = 11;
      for (const match of eastRound1Result.rows) {
        const loserId = match.winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
        
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), $5)`,
          [loserId, competitionId, pointsDistribution.eastRound1Loser, seasonYear, `C洲际赛第${position}名`]
        );
        position++;
      }
      
      const westRound1Query = `
        SELECT team_a_id, team_b_id, winner_id 
        FROM clauch_matches 
        WHERE clauch_bracket_id = $1 AND knockout_round = 'west_round1' AND status = 'completed'
        ORDER BY id
      `;
      const westRound1Result = await client.query(westRound1Query, [bracketId]);
      for (const match of westRound1Result.rows) {
        const loserId = match.winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
        
        await client.query(
          `INSERT INTO score_records (team_id, competition_id, points, point_type, season_year, earned_at, description)
           VALUES ($1, $2, $3, 'intercontinental', $4, NOW(), $5)`,
          [loserId, competitionId, pointsDistribution.westRound1Loser, seasonYear, `C洲际赛第${position}名`]
        );
        position++;
      }

      logger.info('Clauch积分分配完成（包含所有排名）', { bracketId });
      
      // 更新team_statistics表的洲际赛积分
      // 从score_records中获取本次C洲际赛的所有积分记录
      logger.info('开始更新team_statistics表', { seasonYear });
      const scoreRecordsQuery = `
        SELECT team_id, SUM(points) as total_points
        FROM score_records
        WHERE competition_id = $1 AND point_type = 'intercontinental'
        GROUP BY team_id
      `;
      const scoreRecordsResult = await client.query(scoreRecordsQuery, [competitionId]);
      const teamPointsList = scoreRecordsResult.rows.map(row => ({
        teamId: row.team_id,
        points: parseInt(row.total_points)
      }));
      
      await this.updateTeamStatistics(client, seasonYear, teamPointsList);
      logger.info('team_statistics表更新完成', { teamsUpdated: teamPointsList.length });
      
      // 更新年度积分排名
      logger.info('开始更新年度积分排名', { seasonId: bracket.season_id });
      await rankingService.updateAnnualRankings(bracket.season_id.toString());
      logger.info('年度积分排名更新完成', { seasonId: bracket.season_id });
    } catch (error: any) {
      logger.error('分配Clauch积分失败', { error: error.message, bracketId });
      throw error;
    }
  }

  /**
   * 更新team_statistics表的洲际赛积分
   */
  private async updateTeamStatistics(
    client: PoolClient,
    seasonYear: number,
    teamPoints: Array<{ teamId: number; points: number }>
  ): Promise<void> {
    for (const { teamId, points } of teamPoints) {
      if (!teamId || !points) continue;
      
      await client.query(
        `UPDATE team_statistics
         SET intercontinental_points = $1,
             total_points = COALESCE(spring_points, 0) + 
                           COALESCE(summer_points, 0) + 
                           COALESCE(playoff_points, 0) + 
                           COALESCE(msi_points, 0) + 
                           COALESCE(worlds_points, 0) + 
                           $1,
             last_updated = NOW()
         WHERE team_id = $2 AND season_year = $3`,
        [points, teamId, seasonYear]
      );
    }
  }

  /**
   * 获取小组积分榜
   */
  async getGroupStandings(bracketId: string, groupName: string): Promise<ClauchGroupStanding[]> {
    try {
      const standingsQuery = `
        SELECT 
          cgs.*,
          t.name as team_name
        FROM clauch_group_standings cgs
        JOIN teams t ON t.id = cgs.team_id
        WHERE cgs.clauch_bracket_id = $1 AND cgs.group_name = $2
        ORDER BY cgs.points DESC, cgs.round_differential DESC, cgs.wins DESC
      `;
      const standingsResult = await db.query(standingsQuery, [bracketId, groupName]);

      return standingsResult.rows.map(row => ({
        teamId: row.team_id.toString(),
        teamName: row.team_name,
        groupName: row.group_name,
        matchesPlayed: row.matches_played,
        wins: row.wins,
        losses: row.losses,
        points: row.points,
        roundsWon: row.rounds_won,
        roundsLost: row.rounds_lost,
        roundDifferential: row.round_differential,
        position: row.position || 0,
        qualified: row.qualified || false
      }));
    } catch (error: any) {
      logger.error('获取小组积分榜失败', { error: error.message, bracketId, groupName });
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '获取小组积分榜失败',
        error.message
      );
    }
  }

  /**
   * 映射数据库行到Match对象
   */
  private mapMatchRow(row: any): ClauchMatch {
    return {
      id: row.id.toString(),
      clauchBracketId: row.clauch_bracket_id.toString(),
      stage: row.stage,
      groupName: row.group_name,
      roundInGroup: row.round_in_group,
      knockoutBracket: row.knockout_bracket,
      knockoutRound: row.knockout_round,
      matchNumber: row.match_number,
      teamAId: row.team_a_id?.toString(),
      teamBId: row.team_b_id?.toString(),
      teamAName: row.team_a_name,
      teamBName: row.team_b_name,
      bestOf: row.best_of,
      scoreA: row.score_a,
      scoreB: row.score_b,
      winnerId: row.winner_id?.toString(),
      status: row.status,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const clauchService = new ClauchService();

