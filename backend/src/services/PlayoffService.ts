// =================================================================
// 电竞赛事模拟系统 - 季后赛服务
// =================================================================

import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { honorHallService } from './HonorHallService';
import {
  PlayoffBracket,
  PlayoffMatch,
  PlayoffQualification,
  PlayoffRound,
  GeneratePlayoffRequest,
  SimulatePlayoffMatchRequest,
  SimulatePlayoffMatchResponse,
  BusinessError,
  ErrorCodes
} from '../types';

export class PlayoffService {
  /**
   * 将赛区代码或ID转换为数据库中的region_id
   * 支持传入赛区代码（'LPL', 'LCK'等）或数字字符串（'1', '2'等）
   */
  private convertRegionCodeToId(regionCode: string): number {
    // 首先尝试直接转换为数字（如果是数字字符串）
    const numericId = parseInt(regionCode, 10);
    if (!isNaN(numericId) && numericId >= 1 && numericId <= 4) {
      return numericId;
    }

    // 如果不是数字，尝试从赛区代码映射
    const mapping: Record<string, number> = {
      'LPL': 1,
      'LCK': 2,
      'LEC': 3,
      'LCS': 4
    };
    const upperCode = regionCode.toUpperCase();
    const mappedId = mapping[upperCode];

    if (mappedId) {
      return mappedId;
    }

    // 如果都不匹配，记录警告并返回默认值
    logger.warn('无效的赛区代码或ID，使用默认值LPL', { regionCode });
    return 1;
  }

  /**
   * 获取赛区所有季后赛
   */
  async getRegionPlayoffs(regionId: string, seasonId: string): Promise<PlayoffBracket[]> {
    try {
      // 将赛区代码转换为数据库ID
      const regionIdNum = this.convertRegionCodeToId(regionId);

      // 1. 查询该赛区在指定赛季的所有季后赛对阵
      const bracketsQuery = `
        SELECT pb.*, c.season_id
        FROM playoff_brackets pb
        JOIN competitions c ON c.id = pb.competition_id
        WHERE pb.region_id = $1 AND c.season_id = $2
        ORDER BY pb.created_at DESC
      `;
      const bracketsResult = await db.query(bracketsQuery, [regionIdNum, seasonId]);

      if (bracketsResult.rows.length === 0) {
        logger.info('该赛区在指定赛季没有季后赛数据', { regionId, seasonId });
        return [];
      }

      // 2. 为每个bracket获取完整信息
      const brackets: PlayoffBracket[] = [];

      for (const bracketRow of bracketsResult.rows) {
        // 获取所有比赛
        const matchesQuery = `
          SELECT * FROM playoff_matches
          WHERE playoff_bracket_id = $1
          ORDER BY round_number, id
        `;
        const matchesResult = await db.query(matchesQuery, [bracketRow.id]);
        const matches = matchesResult.rows.map((row: any) => this.mapRowToMatch(row));

        // 构建轮次信息
        const rounds = this.buildPlayoffRounds(matches);

        // 获取最终排名
        let champion, runnerUp, thirdPlace, fourthPlace;

        if (bracketRow.champion_id) {
          champion = await this.getTeamQualification(bracketRow.champion_id, bracketRow.qualified_teams);
        }
        if (bracketRow.runner_up_id) {
          runnerUp = await this.getTeamQualification(bracketRow.runner_up_id, bracketRow.qualified_teams);
        }
        if (bracketRow.third_place_id) {
          thirdPlace = await this.getTeamQualification(bracketRow.third_place_id, bracketRow.qualified_teams);
        }
        if (bracketRow.fourth_place_id) {
          fourthPlace = await this.getTeamQualification(bracketRow.fourth_place_id, bracketRow.qualified_teams);
        }

        brackets.push({
          id: bracketRow.id,
          competitionId: bracketRow.competition_id,
          seasonId: bracketRow.season_id,
          regionId: bracketRow.region_id.toString(),
          regionName: bracketRow.region_name,
          competitionType: bracketRow.competition_type,
          status: bracketRow.status,
          qualifiedTeams: bracketRow.qualified_teams,
          rounds,
          champion,
          runnerUp,
          thirdPlace,
          fourthPlace,
          pointsDistribution: bracketRow.points_distribution,
          createdAt: bracketRow.created_at,
          updatedAt: bracketRow.updated_at
        });
      }

      logger.info('成功获取赛区季后赛数据', { regionId, seasonId, count: brackets.length });
      return brackets;
    } catch (error: any) {
      logger.error('获取赛区季后赛失败', { error: error.message, regionId, seasonId });
      throw new BusinessError(
        ErrorCodes.PLAYOFF_NOT_FOUND,
        '获取赛区季后赛失败',
        error.message
      );
    }
  }

  /**
   * 检查是否可以生成季后赛
   */
  async checkPlayoffEligibility(competitionId: string, regionId: string): Promise<{
    eligible: boolean;
    reason?: string;
    qualifiedTeams?: any[];
  }> {
    try {
      // 将赛区代码转换为数据库ID
      const regionIdNum = this.convertRegionCodeToId(regionId);

      // 1. 检查常规赛是否结束
      const competitionQuery = `
        SELECT id, status, type FROM competitions WHERE id = $1
      `;
      const compResult = await db.query(competitionQuery, [competitionId]);

      if (compResult.rows.length === 0) {
        logger.error('检查季后赛资格时未找到赛事', {
          competitionId,
          regionId,
          message: '数据库中不存在该赛事ID'
        });
        return {
          eligible: false,
          reason: `赛事不存在 (ID: ${competitionId})`
        };
      }

      const competition = compResult.rows[0];
      if (competition.status !== 'completed') {
        return {
          eligible: false,
          reason: '常规赛尚未结束'
        };
      }

      // 2. 检查是否已有季后赛
      const existingPlayoffQuery = `
        SELECT id FROM playoff_brackets
        WHERE competition_id = $1 AND region_id = $2
      `;
      const existingResult = await db.query(existingPlayoffQuery, [competitionId, regionIdNum]);

      if (existingResult.rows.length > 0) {
        return {
          eligible: false,
          reason: '该赛区季后赛已生成'
        };
      }

      // 3. 获取前4名队伍
      const qualifiedTeams = await this.getQualifiedTeams(competitionId, regionId);

      if (qualifiedTeams.length < 4) {
        return {
          eligible: false,
          reason: `晋级队伍不足4支(当前${qualifiedTeams.length}支)`
        };
      }

      return {
        eligible: true,
        qualifiedTeams
      };
    } catch (error: any) {
      logger.error('检查季后赛资格失败', { error: error.message, competitionId, regionId });
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '检查季后赛资格失败',
        error.message
      );
    }
  }

  /**
   * 获取晋级季后赛的队伍(常规赛前4名)
   */
  async getQualifiedTeams(competitionId: string, regionId: string): Promise<PlayoffQualification[]> {
    try {
      // 将赛区代码转换为数据库ID
      const regionIdNum = this.convertRegionCodeToId(regionId);

      // 从matches表直接计算常规赛积分榜,获取前4名
      // 先尝试从regional_standings表获取,如果没有数据则从matches表计算
      const standingsQuery = `
        SELECT
          rs.team_id as "teamId",
          t.name as "teamName",
          rs.region_id as "regionId",
          rs.position as "regularSeasonRank",
          rs.regular_season_points as "regularSeasonPoints",
          rs.wins,
          rs.losses
        FROM regional_standings rs
        JOIN teams t ON t.id = rs.team_id
        JOIN competitions c ON c.season_id = rs.season_id AND c.type::text = rs.competition_type
        WHERE c.id = $1 AND rs.region_id = $2
        ORDER BY rs.position ASC
        LIMIT 4
      `;

      let result = await db.query(standingsQuery, [competitionId, regionIdNum]);

      // 如果regional_standings没有数据,从matches表实时计算
      if (result.rows.length === 0) {
        logger.info('regional_standings表无数据,从matches表实时计算', { regionId });

        const matchesQuery = `
          WITH team_stats AS (
            -- 统计每支队伍的胜负场数
            SELECT
              t.id as team_id,
              t.name as team_name,
              t.region_id,
              COUNT(DISTINCT m.match_number) as matches_played,
              SUM(CASE
                WHEN m.winner_id = t.id THEN 1
                ELSE 0
              END) as wins,
              SUM(CASE
                WHEN m.winner_id != t.id AND m.winner_id IS NOT NULL THEN 1
                ELSE 0
              END) as losses
            FROM teams t
            JOIN matches m ON (m.team_a_id = t.id OR m.team_b_id = t.id)
            WHERE m.competition_id = $1
              AND m.status = 'completed'
              AND t.region_id = $2
            GROUP BY t.id, t.name, t.region_id
          )
          SELECT
            team_id as "teamId",
            team_name as "teamName",
            region_id as "regionId",
            wins,
            losses,
            matches_played,
            -- 计算胜场积分 (每场胜利3分)
            wins * 3 as "regularSeasonPoints"
          FROM team_stats
          WHERE matches_played > 0
          ORDER BY wins DESC, losses ASC
          LIMIT 4
        `;

        result = await db.query(matchesQuery, [competitionId, regionIdNum]);
      }

      if (result.rows.length < 4) {
        logger.warn('赛区晋级队伍不足4支', { regionId, teamCount: result.rows.length });
      }

      return result.rows.map((row: any, index: number) => ({
        teamId: row.teamId.toString(),
        teamName: row.teamName,
        regionId: row.regionId.toString(),
        seed: index + 1, // 种子位 1-4
        regularSeasonRank: row.regularSeasonRank || (index + 1),
        regularSeasonPoints: row.regularSeasonPoints || 0,
        wins: row.wins || 0,
        losses: row.losses || 0
      }));
    } catch (error: any) {
      logger.error('获取晋级队伍失败', { error: error.message, competitionId, regionId });
      throw new BusinessError(
        ErrorCodes.TEAM_NOT_FOUND,
        '获取晋级队伍失败',
        error.message
      );
    }
  }

  /**
   * 生成季后赛对阵
   */
  async generatePlayoff(request: GeneratePlayoffRequest): Promise<PlayoffBracket> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 将赛区代码转换为数据库ID
      const regionIdNum = this.convertRegionCodeToId(request.regionId);

      // 1. 检查资格
      const eligibility = await this.checkPlayoffEligibility(request.competitionId, request.regionId);
      if (!eligibility.eligible) {
        throw new BusinessError(
          ErrorCodes.REGULAR_SEASON_NOT_COMPLETE,
          eligibility.reason || '无法生成季后赛'
        );
      }

      const qualifiedTeams = eligibility.qualifiedTeams!;

      // 2. 获取赛区名称
      const regionQuery = `SELECT name FROM regions WHERE id = $1`;
      const regionResult = await client.query(regionQuery, [regionIdNum]);
      const regionName = regionResult.rows[0]?.name || '未知赛区';

      // 3. 创建季后赛对阵表
      const bracketId = uuidv4();
      const insertBracketQuery = `
        INSERT INTO playoff_brackets (
          id, competition_id, region_id, region_name, competition_type,
          status, qualified_teams, points_distribution
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const pointsDistribution = {
        champion: 12,
        runnerUp: 10,
        thirdPlace: 8,
        fourthPlace: 6
      };

      await client.query(insertBracketQuery, [
        bracketId,
        request.competitionId,
        regionIdNum,  // 使用转换后的数字ID
        regionName,
        request.competitionType,
        'not_started',
        JSON.stringify(qualifiedTeams),
        JSON.stringify(pointsDistribution)
      ]);

      // 4. 生成双败淘汰赛制的比赛
      const matches = await this.generateDoubleEliminationMatches(
        client,
        bracketId,
        request.competitionId,
        qualifiedTeams
      );

      // 5. 构建轮次信息
      const rounds = this.buildPlayoffRounds(matches);

      await client.query('COMMIT');

      // 6. 返回完整的季后赛对阵
      return {
        id: bracketId,
        competitionId: request.competitionId,
        regionId: request.regionId,
        regionName,
        competitionType: request.competitionType,
        status: 'not_started',
        qualifiedTeams,
        rounds,
        pointsDistribution,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('生成季后赛失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '生成季后赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 生成双败淘汰赛制的比赛
   */
  private async generateDoubleEliminationMatches(
    client: any,
    bracketId: string,
    competitionId: string,
    teams: PlayoffQualification[]
  ): Promise<PlayoffMatch[]> {
    const matches: PlayoffMatch[] = [];

    // 双败淘汰赛制:
    // Round 1: 胜者组第一轮 - 1 vs 2 (BO5)
    const winnersR1Match = await this.createMatch(client, {
      bracketId,
      competitionId,
      roundNumber: 1,
      matchType: 'winners_bracket',
      teamAId: teams[0].teamId,
      teamBId: teams[1].teamId,
      teamAName: teams[0].teamName,
      teamBName: teams[1].teamName,
      teamASeed: teams[0].seed,
      teamBSeed: teams[1].seed
    });
    matches.push(winnersR1Match);

    // Round 1: 败者组第一轮 - 3 vs 4 (BO5)
    const losersR1Match = await this.createMatch(client, {
      bracketId,
      competitionId,
      roundNumber: 1,
      matchType: 'losers_bracket',
      teamAId: teams[2].teamId,
      teamBId: teams[3].teamId,
      teamAName: teams[2].teamName,
      teamBName: teams[3].teamName,
      teamASeed: teams[2].seed,
      teamBSeed: teams[3].seed
    });
    matches.push(losersR1Match);

    // Round 2: 败者组决赛 (待定队伍)
    const losersR2Match = await this.createMatch(client, {
      bracketId,
      competitionId,
      roundNumber: 2,
      matchType: 'losers_bracket',
      teamAId: null,
      teamBId: null
    });
    matches.push(losersR2Match);

    // Round 3: 总决赛 (待定队伍)
    const grandFinalMatch = await this.createMatch(client, {
      bracketId,
      competitionId,
      roundNumber: 3,
      matchType: 'grand_final',
      teamAId: null,
      teamBId: null
    });
    matches.push(grandFinalMatch);

    // 设置比赛去向关系
    // 胜者组第一轮: 胜者->总决赛, 败者->败者组决赛
    await this.updateMatchNextIds(client, winnersR1Match.id, grandFinalMatch.id, losersR2Match.id);

    // 败者组第一轮: 胜者->败者组决赛, 败者->第4名
    await this.updateMatchNextIds(client, losersR1Match.id, losersR2Match.id, null);

    // 败者组决赛: 胜者->总决赛, 败者->第3名
    await this.updateMatchNextIds(client, losersR2Match.id, grandFinalMatch.id, null);

    return matches;
  }

  /**
   * 创建单场比赛
   */
  private async createMatch(client: any, data: {
    bracketId: string;
    competitionId: string;
    roundNumber: number;
    matchType: 'winners_bracket' | 'losers_bracket' | 'grand_final';
    teamAId: string | null;
    teamBId: string | null;
    teamAName?: string;
    teamBName?: string;
    teamASeed?: number;
    teamBSeed?: number;
  }): Promise<PlayoffMatch> {
    const matchId = uuidv4();

    const query = `
      INSERT INTO playoff_matches (
        id, playoff_bracket_id, competition_id, round_number, match_type,
        best_of, team_a_id, team_b_id, team_a_name, team_b_name,
        team_a_seed, team_b_seed, score_a, score_b, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await client.query(query, [
      matchId,
      data.bracketId,
      data.competitionId,
      data.roundNumber,
      data.matchType,
      5, // BO5
      data.teamAId,
      data.teamBId,
      data.teamAName || null,
      data.teamBName || null,
      data.teamASeed || null,
      data.teamBSeed || null,
      0,
      0,
      data.teamAId && data.teamBId ? 'pending' : 'pending'
    ]);

    const row = result.rows[0];
    return this.mapRowToMatch(row);
  }

  /**
   * 更新比赛的去向关系
   */
  private async updateMatchNextIds(
    client: any,
    matchId: string,
    nextMatchId: string | null,
    loserNextMatchId: string | null
  ): Promise<void> {
    const query = `
      UPDATE playoff_matches
      SET next_match_id = $2, loser_next_match_id = $3
      WHERE id = $1
    `;
    await client.query(query, [matchId, nextMatchId, loserNextMatchId]);
  }

  /**
   * 获取季后赛对阵信息
   */
  async getPlayoffBracket(competitionId: string, regionId: string): Promise<PlayoffBracket | null> {
    try {
      // 1. 获取对阵表信息
      const bracketQuery = `
        SELECT * FROM playoff_brackets
        WHERE competition_id = $1 AND region_id = $2
      `;
      const bracketResult = await db.query(bracketQuery, [competitionId, regionId]);

      if (bracketResult.rows.length === 0) {
        return null;
      }

      const bracket = bracketResult.rows[0];

      // 2. 获取所有比赛
      const matchesQuery = `
        SELECT * FROM playoff_matches
        WHERE playoff_bracket_id = $1
        ORDER BY round_number, id
      `;
      const matchesResult = await db.query(matchesQuery, [bracket.id]);
      const matches = matchesResult.rows.map((row: any) => this.mapRowToMatch(row));

      // 3. 构建轮次信息
      const rounds = this.buildPlayoffRounds(matches);

      // 4. 获取最终排名
      let champion, runnerUp, thirdPlace, fourthPlace;

      if (bracket.champion_id) {
        champion = await this.getTeamQualification(bracket.champion_id, bracket.qualified_teams);
      }
      if (bracket.runner_up_id) {
        runnerUp = await this.getTeamQualification(bracket.runner_up_id, bracket.qualified_teams);
      }
      if (bracket.third_place_id) {
        thirdPlace = await this.getTeamQualification(bracket.third_place_id, bracket.qualified_teams);
      }
      if (bracket.fourth_place_id) {
        fourthPlace = await this.getTeamQualification(bracket.fourth_place_id, bracket.qualified_teams);
      }

      return {
        id: bracket.id,
        competitionId: bracket.competition_id,
        regionId: bracket.region_id.toString(),
        regionName: bracket.region_name,
        competitionType: bracket.competition_type,
        status: bracket.status,
        qualifiedTeams: bracket.qualified_teams,
        rounds,
        champion,
        runnerUp,
        thirdPlace,
        fourthPlace,
        pointsDistribution: bracket.points_distribution,
        createdAt: bracket.created_at,
        updatedAt: bracket.updated_at
      };
    } catch (error: any) {
      logger.error('获取季后赛对阵失败', { error: error.message, competitionId, regionId });
      throw new BusinessError(
        ErrorCodes.PLAYOFF_NOT_FOUND,
        '获取季后赛对阵失败',
        error.message
      );
    }
  }

  /**
   * 模拟季后赛单场比赛(BO5)
   */
  async simulatePlayoffMatch(request: SimulatePlayoffMatchRequest): Promise<SimulatePlayoffMatchResponse> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 获取比赛信息
      const matchQuery = `SELECT * FROM playoff_matches WHERE id = $1`;
      const matchResult = await client.query(matchQuery, [request.matchId]);

      if (matchResult.rows.length === 0) {
        throw new BusinessError(ErrorCodes.PLAYOFF_NOT_FOUND, '比赛不存在');
      }

      const matchRow = matchResult.rows[0];

      // 检查比赛是否已完成
      if (matchRow.status === 'completed') {
        throw new BusinessError(ErrorCodes.MATCH_ALREADY_COMPLETED, '比赛已完成');
      }

      // 检查双方队伍是否都已确定
      if (!matchRow.team_a_id || !matchRow.team_b_id) {
        throw new BusinessError(ErrorCodes.PLAYOFF_MATCH_NOT_READY, '比赛队伍尚未确定');
      }

      // 2. 模拟BO5比赛
      const { scoreA, scoreB, winnerId } = await this.simulateBO5Match(
        client,
        matchRow.team_a_id,
        matchRow.team_b_id
      );

      const loserId = winnerId === matchRow.team_a_id ? matchRow.team_b_id : matchRow.team_a_id;

      // 3. 更新比赛结果
      const updateMatchQuery = `
        UPDATE playoff_matches
        SET score_a = $2, score_b = $3, winner_id = $4, status = $5, completed_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      const updatedMatchResult = await client.query(updateMatchQuery, [
        request.matchId,
        scoreA,
        scoreB,
        winnerId,
        'completed'
      ]);

      const updatedMatch = this.mapRowToMatch(updatedMatchResult.rows[0]);

      // 4. 推进到下一轮
      await this.advanceToNextRound(client, matchRow, winnerId, loserId);

      // 5. 获取playoff_bracket的region_id
      const bracketQuery = `SELECT region_id FROM playoff_brackets WHERE id = $1`;
      const bracketResult = await client.query(bracketQuery, [matchRow.playoff_bracket_id]);
      const regionId = bracketResult.rows[0]?.region_id?.toString();

      // 6. 检查季后赛是否完成
      const bracket = await this.getPlayoffBracket(request.competitionId, regionId);
      const isPlayoffComplete = await this.checkPlayoffComplete(client, matchRow.playoff_bracket_id);

      let finalStandings;
      if (isPlayoffComplete) {
        // 更新最终排名
        finalStandings = await this.updateFinalStandings(client, matchRow.playoff_bracket_id);

        // 分配赛事积分
        await this.distributePlayoffPoints(client, matchRow.playoff_bracket_id, finalStandings);
      }

      await client.query('COMMIT');

      return {
        match: updatedMatch,
        bracket: bracket!,
        isPlayoffComplete,
        finalStandings
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('模拟季后赛比赛失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_MATCH_RESULT,
        '模拟季后赛比赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 模拟BO5比赛
   */
  private async simulateBO5Match(
    client: any,
    teamAId: string,
    teamBId: string
  ): Promise<{ scoreA: number; scoreB: number; winnerId: string }> {
    // 获取队伍实力 - 注意：数据库中team_id是INTEGER，但参数是从数据库读取的可能是bigint或integer
    // 统一转换为字符串进行比较
    const teamsQuery = `SELECT id, power_rating, name FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await client.query(teamsQuery, [teamAId, teamBId]);

    logger.debug('查询队伍实力', {
      teamAId,
      teamBId,
      results: teamsResult.rows.map((r: any) => ({ id: r.id, type: typeof r.id, name: r.name }))
    });

    // 统一使用字符串比较
    const teamA = teamsResult.rows.find((t: any) => t.id.toString() === teamAId.toString());
    const teamB = teamsResult.rows.find((t: any) => t.id.toString() === teamBId.toString());

    logger.debug('匹配队伍结果', {
      teamA: teamA ? { name: teamA.name, power: teamA.power_rating } : null,
      teamB: teamB ? { name: teamB.name, power: teamB.power_rating } : null
    });

    // 如果未找到队伍，抛出明确错误
    if (!teamA) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `队伍 ${teamAId} 不存在或未查询到`);
    }
    if (!teamB) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `队伍 ${teamBId} 不存在或未查询到`);
    }

    const powerA = teamA.power_rating || 75;
    const powerB = teamB.power_rating || 75;

    // BO5: 先赢3场者获胜
    let scoreA = 0;
    let scoreB = 0;

    while (scoreA < 3 && scoreB < 3) {
      // 计算单场胜率(基于实力差距)
      const totalPower = powerA + powerB;
      const winProbA = powerA / totalPower;

      // 加入随机因素
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
   * 推进到下一轮
   */
  private async advanceToNextRound(
    client: any,
    match: any,
    winnerId: string,
    loserId: string
  ): Promise<void> {
    // 获取胜者和败者队伍信息
    const teamsQuery = `SELECT id, name FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await client.query(teamsQuery, [winnerId, loserId]);

    logger.debug('推进下一轮', { winnerId, loserId, queryResults: teamsResult.rows });

    // 统一使用字符串比较
    const winner = teamsResult.rows.find((t: any) => t.id.toString() === winnerId.toString());
    const loser = teamsResult.rows.find((t: any) => t.id.toString() === loserId.toString());

    // 检查winner和loser是否存在
    if (!winner) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `获胜队伍 ${winnerId} 不存在`);
    }
    if (!loser) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `失败队伍 ${loserId} 不存在`);
    }

    logger.debug('队伍匹配成功', { winner: winner.name, loser: loser.name });

    // 更新下一场比赛的队伍
    if (match.next_match_id) {
      // 胜者进入下一场
      logger.debug('胜者晋级', { winner: winner.name, nextMatchId: match.next_match_id });
      await this.updateNextMatchTeam(client, match.next_match_id, winnerId, winner.name);
    }

    if (match.loser_next_match_id) {
      // 败者进入败者组
      logger.debug('败者进入败者组', { loser: loser.name, loserNextMatchId: match.loser_next_match_id });
      await this.updateNextMatchTeam(client, match.loser_next_match_id, loserId, loser.name);
    }
  }

  /**
   * 更新下一场比赛的队伍
   */
  private async updateNextMatchTeam(
    client: any,
    nextMatchId: string,
    teamId: string,
    teamName: string
  ): Promise<void> {
    // 检查该比赛的team_a是否为空
    const checkQuery = `SELECT team_a_id, team_b_id FROM playoff_matches WHERE id = $1`;
    const checkResult = await client.query(checkQuery, [nextMatchId]);

    if (checkResult.rows.length === 0) return;

    const nextMatch = checkResult.rows[0];

    if (!nextMatch.team_a_id) {
      // team_a 为空，填入team_a
      await client.query(
        `UPDATE playoff_matches SET team_a_id = $2, team_a_name = $3 WHERE id = $1`,
        [nextMatchId, teamId, teamName]
      );
    } else if (!nextMatch.team_b_id) {
      // team_b 为空，填入team_b
      await client.query(
        `UPDATE playoff_matches SET team_b_id = $2, team_b_name = $3 WHERE id = $1`,
        [nextMatchId, teamId, teamName]
      );
    }
  }

  /**
   * 检查季后赛是否完成
   */
  private async checkPlayoffComplete(client: any, bracketId: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM playoff_matches
      WHERE playoff_bracket_id = $1
    `;
    const result = await client.query(query, [bracketId]);

    const { total, completed } = result.rows[0];
    return parseInt(total) === parseInt(completed);
  }

  /**
   * 更新最终排名
   */
  private async updateFinalStandings(client: any, bracketId: string): Promise<{
    champion: PlayoffQualification;
    runnerUp: PlayoffQualification;
    thirdPlace: PlayoffQualification;
    fourthPlace: PlayoffQualification;
  }> {
    // 获取总决赛结果
    const grandFinalQuery = `
      SELECT * FROM playoff_matches
      WHERE playoff_bracket_id = $1 AND match_type = 'grand_final'
    `;
    const grandFinalResult = await client.query(grandFinalQuery, [bracketId]);
    const grandFinal = grandFinalResult.rows[0];

    const championId = grandFinal.winner_id;
    const runnerUpId = grandFinal.winner_id === grandFinal.team_a_id ? grandFinal.team_b_id : grandFinal.team_a_id;

    // 获取败者组决赛结果
    const losersR2Query = `
      SELECT * FROM playoff_matches
      WHERE playoff_bracket_id = $1 AND match_type = 'losers_bracket' AND round_number = 2
    `;
    const losersR2Result = await client.query(losersR2Query, [bracketId]);
    const losersR2 = losersR2Result.rows[0];

    const thirdPlaceId = losersR2.winner_id === losersR2.team_a_id ? losersR2.team_b_id : losersR2.team_a_id;

    // 获取败者组第一轮结果
    const losersR1Query = `
      SELECT * FROM playoff_matches
      WHERE playoff_bracket_id = $1 AND match_type = 'losers_bracket' AND round_number = 1
    `;
    const losersR1Result = await client.query(losersR1Query, [bracketId]);
    const losersR1 = losersR1Result.rows[0];

    const fourthPlaceId = losersR1.winner_id === losersR1.team_a_id ? losersR1.team_b_id : losersR1.team_a_id;

    // 更新bracket表
    await client.query(`
      UPDATE playoff_brackets
      SET champion_id = $2, runner_up_id = $3, third_place_id = $4, fourth_place_id = $5, status = 'completed'
      WHERE id = $1
    `, [bracketId, championId, runnerUpId, thirdPlaceId, fourthPlaceId]);

    // 获取bracket的qualified_teams
    const bracketQuery = `SELECT qualified_teams FROM playoff_brackets WHERE id = $1`;
    const bracketResult = await client.query(bracketQuery, [bracketId]);
    const qualifiedTeams = bracketResult.rows[0].qualified_teams;

    return {
      champion: await this.getTeamQualification(championId, qualifiedTeams),
      runnerUp: await this.getTeamQualification(runnerUpId, qualifiedTeams),
      thirdPlace: await this.getTeamQualification(thirdPlaceId, qualifiedTeams),
      fourthPlace: await this.getTeamQualification(fourthPlaceId, qualifiedTeams)
    };
  }

  /**
   * 分配季后赛积分
   * 根据策划案规则：冠军12分、亚军10分、季军8分、第4名6分
   */
  private async distributePlayoffPoints(client: any, bracketId: string, standings: any): Promise<void> {
    try {
      // 1. 获取积分配置和赛季信息
      const bracketQuery = `
        SELECT 
          pb.points_distribution, 
          pb.competition_id,
          pb.region_id,
          c.season_id,
          c.type as competition_type,
          s.year as season_year
        FROM playoff_brackets pb
        JOIN competitions c ON pb.competition_id = c.id
        JOIN seasons s ON c.season_id = s.id
        WHERE pb.id = $1
      `;
      const bracketResult = await client.query(bracketQuery, [bracketId]);
      const bracketData = bracketResult.rows[0];
      const pointsDistribution = bracketData.points_distribution;
      const competitionId = bracketData.competition_id;
      const seasonYear = bracketData.season_year;
      const competitionType = bracketData.competition_type; // 'spring' or 'summer'

      // 2. 确定积分类型
      const pointType = competitionType === 'spring' ? 'spring_playoff' : 'summer_playoff';

      // 3. 分配前四名积分
      const distributions = [
        { 
          teamId: standings.champion.teamId, 
          points: pointsDistribution.champion || 12,
          rank: 1,
          description: '季后赛冠军'
        },
        { 
          teamId: standings.runnerUp.teamId, 
          points: pointsDistribution.runnerUp || 10,
          rank: 2,
          description: '季后赛亚军'
        },
        { 
          teamId: standings.thirdPlace.teamId, 
          points: pointsDistribution.thirdPlace || 8,
          rank: 3,
          description: '季后赛季军'
        },
        { 
          teamId: standings.fourthPlace.teamId, 
          points: pointsDistribution.fourthPlace || 6,
          rank: 4,
          description: '季后赛第四名'
        }
      ];

      // 4. 使用数据库函数分配积分
      for (const dist of distributions) {
        await client.query(`
          SELECT award_points_to_team($1, $2, $3, $4, $5, NULL, $6)
        `, [
          dist.teamId,
          seasonYear,
          dist.points,
          pointType,
          competitionId,
          `${dist.description} (+${dist.points}分)`
        ]);

        logger.info('✅ 季后赛积分已分配', {
          teamId: dist.teamId,
          points: dist.points,
          rank: dist.rank,
          description: dist.description,
          seasonYear,
          competitionType
        });
      }

      // 5. TODO: 处理第5-6名积分（常规赛前6但未进季后赛前4的队伍各得3分）
      // 这部分需要在常规赛结束时处理

      // 6. 创建荣誉记录
      const seasonId = bracketData.season_id.toString();
      const competitionIdStr = competitionId.toString();
      
      for (const dist of distributions) {
        await honorHallService.createHonorRecord(
          seasonId,
          competitionIdStr,
          dist.teamId.toString(),
          dist.rank,
          dist.points
        );
      }

      logger.info('🎉 季后赛积分分配和荣誉记录创建完成', {
        bracketId,
        seasonYear,
        competitionType,
        totalPointsAwarded: distributions.reduce((sum, d) => sum + d.points, 0)
      });

    } catch (error: any) {
      logger.error('❌ 季后赛积分分配失败', {
        error: error.message,
        bracketId,
        standings
      });
      throw error;
    }
  }

  /**
   * 获取队伍的晋级资格信息
   */
  private async getTeamQualification(teamId: string, qualifiedTeams: PlayoffQualification[]): Promise<PlayoffQualification> {
    return qualifiedTeams.find(t => t.teamId === teamId.toString())!;
  }

  /**
   * 构建轮次信息
   */
  private buildPlayoffRounds(matches: PlayoffMatch[]): PlayoffRound[] {
    const roundMap = new Map<number, PlayoffMatch[]>();

    // 按轮次分组
    matches.forEach(match => {
      if (!roundMap.has(match.roundNumber)) {
        roundMap.set(match.roundNumber, []);
      }
      roundMap.get(match.roundNumber)!.push(match);
    });

    // 构建轮次
    const rounds: PlayoffRound[] = [];

    roundMap.forEach((roundMatches, roundNumber) => {
      const roundName = this.getRoundName(roundNumber, roundMatches[0].matchType);
      const bracketType = this.getBracketType(roundMatches[0].matchType);
      const status = this.getRoundStatus(roundMatches);

      rounds.push({
        roundNumber,
        roundName,
        bracketType,
        matches: roundMatches,
        status
      });
    });

    return rounds.sort((a, b) => a.roundNumber - b.roundNumber);
  }

  /**
   * 获取轮次名称
   */
  private getRoundName(roundNumber: number, matchType: string): string {
    if (matchType === 'grand_final') return '总决赛';
    if (matchType === 'losers_bracket') {
      return roundNumber === 1 ? '败者组第一轮' : '败者组决赛';
    }
    return '胜者组第一轮';
  }

  /**
   * 获取bracket类型
   */
  private getBracketType(matchType: string): 'winners' | 'losers' | 'grand_final' {
    if (matchType === 'grand_final') return 'grand_final';
    if (matchType === 'losers_bracket') return 'losers';
    return 'winners';
  }

  /**
   * 获取轮次状态
   */
  private getRoundStatus(matches: PlayoffMatch[]): 'pending' | 'in_progress' | 'completed' {
    const allCompleted = matches.every(m => m.status === 'completed');
    if (allCompleted) return 'completed';

    const anyInProgress = matches.some(m => m.status === 'in_progress');
    if (anyInProgress) return 'in_progress';

    return 'pending';
  }

  /**
   * 映射数据库行到比赛对象
   */
  private mapRowToMatch(row: any): PlayoffMatch {
    return {
      id: row.id,
      competitionId: row.competition_id.toString(),
      playoffBracketId: row.playoff_bracket_id,
      roundNumber: row.round_number,
      matchType: row.match_type,
      bestOf: row.best_of,
      teamAId: row.team_a_id?.toString(),
      teamBId: row.team_b_id?.toString(),
      teamAName: row.team_a_name,
      teamBName: row.team_b_name,
      teamASeed: row.team_a_seed,
      teamBSeed: row.team_b_seed,
      scoreA: row.score_a,
      scoreB: row.score_b,
      winnerId: row.winner_id?.toString(),
      status: row.status,
      nextMatchId: row.next_match_id,
      loserNextMatchId: row.loser_next_match_id,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const playoffService = new PlayoffService();
