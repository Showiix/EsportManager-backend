// =================================================================
// 电竞赛事模拟系统 - 世界赛服务
// =================================================================

import { PoolClient } from 'pg';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { honorHallService } from './HonorHallService';
import {
  BusinessError,
  ErrorCodes
} from '../types';

// =================================================================
// 类型定义
// =================================================================

export interface WorldsQualification {
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  seed: number; // 1: 冠军(直通淘汰赛), 2: 亚军(小组赛), 3: 季军(小组赛)
  summerPlayoffRank: number; // 夏季赛季后赛排名
  summerPlayoffPoints: number; // 夏季赛季后赛积分
  directToKnockout: boolean; // 是否直接进淘汰赛
  quarterSlot?: number; // 半区位置(1-4), 直通队伍预分配
}

export interface WorldsBracket {
  id: string;
  seasonId: string;
  seasonYear: number;
  status: 'not_started' | 'play_in_draw' | 'group_stage' | 'knockout' | 'completed';
  currentSwissRound?: number; // 当前瑞士轮轮次 (0-3)
  playInTeams: WorldsQualification[]; // 12支队伍
  swissMatches?: WorldsSwissMatch[]; // 所有瑞士轮比赛
  swissStandings?: SwissStandings[];
  knockoutMatches?: WorldsKnockoutMatch[];
  champion?: WorldsQualification;
  runnerUp?: WorldsQualification;
  thirdPlace?: WorldsQualification;
  fourthPlace?: WorldsQualification;
  quarterFinalists?: WorldsQualification[]; // 8强止步队伍(4队)
  groupStageTeams?: WorldsQualification[]; // 小组赛止步队伍(4队)
  pointsDistribution: {
    champion: number;
    runnerUp: number;
    thirdPlace: number;
    fourthPlace: number;
    quarterFinalist: number;
    groupStage: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface SwissStandings {
  id: string;
  worldsBracketId: string;
  teamId: string;
  teamName: string;
  wins: number; // 0-2
  losses: number; // 0-2
  status: 'active' | 'qualified' | 'eliminated';
  qualified: boolean;
  isQuarterSeed: boolean; // 是否为半区种子(前4名)
  quarterSlot?: number; // 半区位置(1-4)
  finalRank?: number;
}

export interface WorldsSwissMatch {
  id: string;
  worldsBracketId: string;
  roundNumber: number; // 1-3
  matchNumber?: number;
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  winnerId?: string;
  scoreA: number;
  scoreB: number;
  bestOf: number; // BO3
  status: 'pending' | 'in_progress' | 'completed';
  scheduledAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorldsKnockoutMatch {
  id: string;
  worldsBracketId: string;
  round: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'THIRD_PLACE' | 'FINAL';
  matchNumber?: number;
  teamAId?: string;
  teamBId?: string;
  teamAName?: string;
  teamBName?: string;
  teamAQuarterSlot?: number;
  teamBQuarterSlot?: number;
  winnerId?: string;
  scoreA: number;
  scoreB: number;
  bestOf: number; // BO5
  status: 'pending' | 'in_progress' | 'completed';
  nextMatchId?: string;
  scheduledAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerateWorldsRequest {
  seasonId: string;
}

export interface WorldsEligibilityResponse {
  eligible: boolean;
  reason?: string;
  qualifiedTeams?: WorldsQualification[];
  directSeeds?: WorldsQualification[]; // 4支直通队伍
  groupStageTeams?: WorldsQualification[]; // 8支小组赛队伍
}

export interface SimulateWorldsMatchRequest {
  matchId: string;
  matchType: 'swiss' | 'knockout';
}

export interface SimulateWorldsMatchResponse {
  match: WorldsSwissMatch | WorldsKnockoutMatch;
  winner: WorldsQualification;
  loser: WorldsQualification;
  isComplete: boolean;
  finalStandings?: any;
}

// =================================================================
// WorldsService 类
// =================================================================

export class WorldsService {
  /**
   * 检查是否可以生成世界赛
   * 要求: 所有4个赛区的夏季赛季后赛都已完成
   */
  async checkWorldsEligibility(seasonId: string): Promise<WorldsEligibilityResponse> {
    try {
      // 1. 检查赛季是否存在
      const seasonQuery = `SELECT * FROM seasons WHERE season_code = $1`;
      const seasonResult = await db.query(seasonQuery, [seasonId]);

      if (seasonResult.rows.length === 0) {
        return {
          eligible: false,
          reason: '赛季不存在'
        };
      }

      // 2. 检查是否已有世界赛
      const existingWorldsQuery = `SELECT id FROM worlds_brackets WHERE season_id = $1`;
      const existingResult = await db.query(existingWorldsQuery, [seasonId]);

      if (existingResult.rows.length > 0) {
        return {
          eligible: false,
          reason: '该赛季世界赛已生成'
        };
      }

      // 3. 获取所有赛区
      const regionsQuery = `SELECT id, name FROM regions WHERE is_active = true ORDER BY id`;
      const regionsResult = await db.query(regionsQuery);

      if (regionsResult.rows.length < 4) {
        return {
          eligible: false,
          reason: `活跃赛区不足4个(当前${regionsResult.rows.length}个)`
        };
      }

      const regions = regionsResult.rows.slice(0, 4); // 只取前4个赛区

      // 4. 检查每个赛区的夏季赛季后赛是否完成
      const directSeeds: WorldsQualification[] = []; // 冠军直通
      const groupStageTeams: WorldsQualification[] = []; // 亚军+季军打小组赛

      for (const region of regions) {
        // 获取该赛区当前赛季的夏季赛季后赛
        const playoffQuery = `
          SELECT pb.*, pb.status as bracket_status
          FROM playoff_brackets pb
          WHERE pb.new_season_id = $1
            AND pb.region_id = $2
            AND pb.competition_type = 'summer'
          ORDER BY pb.created_at DESC
          LIMIT 1
        `;

        const playoffResult = await db.query(playoffQuery, [seasonId, region.id]);

        if (playoffResult.rows.length === 0) {
          return {
            eligible: false,
            reason: `赛区${region.name}的夏季赛季后赛尚未生成`
          };
        }

        const playoff = playoffResult.rows[0];

        if (playoff.bracket_status !== 'completed') {
          return {
            eligible: false,
            reason: `赛区${region.name}的夏季赛季后赛尚未完成`
          };
        }

        // 获取该赛区夏季赛季后赛的前3名
        if (!playoff.champion_id || !playoff.runner_up_id || !playoff.third_place_id) {
          return {
            eligible: false,
            reason: `赛区${region.name}的夏季赛季后赛排名不完整`
          };
        }

        const qualifiedTeams = playoff.qualified_teams;

        // 查找冠亚季军信息
        const champion = qualifiedTeams.find((t: any) => t.teamId === playoff.champion_id.toString());
        const runnerUp = qualifiedTeams.find((t: any) => t.teamId === playoff.runner_up_id.toString());
        const thirdPlace = qualifiedTeams.find((t: any) => t.teamId === playoff.third_place_id.toString());

        if (!champion || !runnerUp || !thirdPlace) {
          return {
            eligible: false,
            reason: `赛区${region.name}的季后赛队伍信息不完整`
          };
        }

        // 冠军直通淘汰赛
        directSeeds.push({
          ...champion,
          regionName: region.name,
          seed: 1,
          summerPlayoffRank: 1,
          summerPlayoffPoints: playoff.points_distribution.champion || 15,
          directToKnockout: true,
          quarterSlot: directSeeds.length + 1 // 预分配半区位置1-4
        });

        // 亚军进小组赛
        groupStageTeams.push({
          ...runnerUp,
          regionName: region.name,
          seed: 2,
          summerPlayoffRank: 2,
          summerPlayoffPoints: playoff.points_distribution.runnerUp || 12,
          directToKnockout: false
        });

        // 季军进小组赛
        groupStageTeams.push({
          ...thirdPlace,
          regionName: region.name,
          seed: 3,
          summerPlayoffRank: 3,
          summerPlayoffPoints: playoff.points_distribution.thirdPlace || 10,
          directToKnockout: false
        });
      }

      const qualifiedTeams = [...directSeeds, ...groupStageTeams];

      logger.info('[Worlds] 世界赛资格检查完成', {
        directSeeds: directSeeds.length,
        groupStageTeams: groupStageTeams.length,
        total: qualifiedTeams.length
      });

      return {
        eligible: true,
        qualifiedTeams,
        directSeeds,
        groupStageTeams
      };
    } catch (error: any) {
      logger.error('检查世界赛资格失败', { error: error.message, seasonId });
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '检查世界赛资格失败',
        error.message
      );
    }
  }

  /**
   * 获取世界赛资格队伍
   */
  async getQualifiedTeams(seasonId: string): Promise<WorldsQualification[]> {
    const eligibility = await this.checkWorldsEligibility(seasonId);
    if (!eligibility.eligible) {
      throw new BusinessError(
        ErrorCodes.ALL_SPRING_PLAYOFFS_NOT_COMPLETE,
        eligibility.reason || '无法获取世界赛资格队伍'
      );
    }
    return eligibility.qualifiedTeams!;
  }

  /**
   * 生成世界赛对阵（入围赛抽签）
   */
  async generateWorlds(request: GenerateWorldsRequest): Promise<WorldsBracket> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 检查资格
      const eligibility = await this.checkWorldsEligibility(request.seasonId);
      if (!eligibility.eligible) {
        throw new BusinessError(
          ErrorCodes.ALL_SPRING_PLAYOFFS_NOT_COMPLETE,
          eligibility.reason || '无法生成世界赛'
        );
      }

      const { qualifiedTeams, directSeeds, groupStageTeams } = eligibility;

      // 2. 获取赛季信息
      // 判断传入的是season_code还是id
      let actualSeasonId: string;
      let seasonYear: number;
      let seasonCode: string;
      
      const isNumeric = /^\d+$/.test(request.seasonId);
      if (isNumeric) {
        // 传入的是ID
        const seasonQuery = `SELECT id, year, season_code FROM seasons WHERE id = $1`;
        const seasonResult = await client.query(seasonQuery, [request.seasonId]);
        if (seasonResult.rows.length === 0) {
          throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `赛季ID ${request.seasonId} 不存在`);
        }
        actualSeasonId = seasonResult.rows[0].id;
        seasonYear = seasonResult.rows[0].year;
        seasonCode = seasonResult.rows[0].season_code;
      } else {
        // 传入的是season_code
        const seasonQuery = `SELECT id, year, season_code FROM seasons WHERE season_code = $1`;
        const seasonResult = await client.query(seasonQuery, [request.seasonId]);
        if (seasonResult.rows.length === 0) {
          throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `赛季代码 ${request.seasonId} 不存在`);
        }
        actualSeasonId = seasonResult.rows[0].id;
        seasonYear = seasonResult.rows[0].year;
        seasonCode = seasonResult.rows[0].season_code;
      }

      logger.info('[Worlds] 赛季信息', {
        requestSeasonId: request.seasonId,
        actualSeasonId,
        seasonCode,
        seasonYear
      });

      // 3. 创建或获取Worlds competition记录
      const competitionQuery = `
        INSERT INTO competitions (season_id, type, name, status, format, scoring_rules, max_teams, start_date, end_date)
        VALUES ($1, 'worlds', $2, 'active', $3, $4, 12, NOW(), NOW() + INTERVAL '2 months')
        ON CONFLICT (season_id, type) DO UPDATE 
        SET status = 'active', updated_at = NOW()
        RETURNING id
      `;
      const competitionResult = await client.query(competitionQuery, [
        actualSeasonId,
        `${seasonCode} 世界赛`,
        JSON.stringify({ type: 'worlds', stages: ['play_in', 'swiss', 'knockout'] }),
        JSON.stringify({})
      ]);
      const competitionId = competitionResult.rows[0].id;
      
      logger.info('[Worlds] competition创建或更新成功', {
        seasonId: actualSeasonId,
        seasonCode,
        competitionId
      });

      // 4. 创建世界赛对阵表
      const insertBracketQuery = `
        INSERT INTO worlds_brackets (
          season_id, season_year, status,
          play_in_teams, points_distribution
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const pointsDistribution = {
        champion: 20,
        runnerUp: 16,
        thirdPlace: 12,
        fourthPlace: 8,
        quarterFinalist: 6,
        groupStage: 4
      };

      const bracketResult = await client.query(insertBracketQuery, [
        seasonCode, // 存储season_code而不是数据库ID
        seasonYear,
        'play_in_draw', // 初始状态：入围赛抽签
        JSON.stringify(qualifiedTeams),
        JSON.stringify(pointsDistribution)
      ]);

      const bracketId = bracketResult.rows[0].id;

      // 5. 初始化瑞士轮积分榜（只为小组赛8支队伍创建）
      await this.initializeSwissStandings(client, bracketId, groupStageTeams!);

      logger.info('[Worlds] 世界赛对阵生成成功', {
        bracketId,
        seasonId: actualSeasonId,
        seasonCode,
        competitionId,
        directSeeds: directSeeds!.length,
        groupStageTeams: groupStageTeams!.length
      });

      await client.query('COMMIT');

      // 6. 返回完整的世界赛对阵
      return {
        id: bracketId,
        seasonId: seasonCode, // 返回season_code供前端使用
        seasonYear,
        status: 'play_in_draw',
        playInTeams: qualifiedTeams!,
        pointsDistribution,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('生成世界赛失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '生成世界赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 初始化瑞士轮积分榜
   */
  private async initializeSwissStandings(
    client: PoolClient,
    bracketId: string,
    groupStageTeams: WorldsQualification[]
  ): Promise<void> {
    for (const team of groupStageTeams) {
      await client.query(`
        INSERT INTO worlds_swiss_standings (
          worlds_bracket_id, team_id, team_name,
          wins, losses, status, qualified, is_quarter_seed
        ) VALUES ($1, $2, $3, 0, 0, 'active', false, false)
      `, [bracketId, team.teamId, team.teamName]);
    }
  }

  /**
   * 获取世界赛对阵信息
   */
  async getWorldsBracket(seasonId: string): Promise<WorldsBracket | null> {
    try {
      // 1. 查询世界赛对阵基本信息（season_id存储的是season_code）
      const bracketQuery = `
        SELECT * FROM worlds_brackets
        WHERE season_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const bracketResult = await db.query(bracketQuery, [seasonId]);

      if (bracketResult.rows.length === 0) {
        return null;
      }

      const bracket = bracketResult.rows[0];

      // 2. 获取瑞士轮积分榜
      const standingsQuery = `
        SELECT * FROM worlds_swiss_standings
        WHERE worlds_bracket_id = $1
        ORDER BY wins DESC, losses ASC
      `;
      const standingsResult = await db.query(standingsQuery, [bracket.id]);

      // 3. 获取淘汰赛比赛
      const knockoutQuery = `
        SELECT * FROM worlds_knockout_matches
        WHERE worlds_bracket_id = $1
        ORDER BY 
          CASE round
            WHEN 'QUARTER_FINAL' THEN 1
            WHEN 'SEMI_FINAL' THEN 2
            WHEN 'THIRD_PLACE' THEN 3
            WHEN 'FINAL' THEN 4
          END,
          match_number
      `;
      const knockoutResult = await db.query(knockoutQuery, [bracket.id]);

      // 4. 获取当前瑞士轮轮次
      const currentRoundQuery = `
        SELECT MAX(round_number) as current_round
        FROM worlds_swiss_matches
        WHERE worlds_bracket_id = $1
      `;
      const currentRoundResult = await db.query(currentRoundQuery, [bracket.id]);
      const currentSwissRound = currentRoundResult.rows[0]?.current_round || 0;

      // 4.5 获取所有瑞士轮比赛
      const swissMatchesQuery = `
        SELECT * FROM worlds_swiss_matches
        WHERE worlds_bracket_id = $1
        ORDER BY round_number, match_number
      `;
      const swissMatchesResult = await db.query(swissMatchesQuery, [bracket.id]);

      // 5. 构造返回数据
      const worldsBracket: WorldsBracket = {
        id: bracket.id.toString(),
        seasonId: bracket.season_id, // 返回season_code供前端使用
        seasonYear: bracket.season_year,
        status: bracket.status,
        currentSwissRound: currentSwissRound, // 当前瑞士轮轮次
        playInTeams: bracket.play_in_teams || [],
        swissMatches: swissMatchesResult.rows.map((row: any) => ({
          id: row.id,
          worldsBracketId: row.worlds_bracket_id.toString(),
          roundNumber: row.round_number,
          matchNumber: row.match_number,
          teamAId: row.team_a_id?.toString(),
          teamBId: row.team_b_id?.toString(),
          teamAName: row.team_a_name,
          teamBName: row.team_b_name,
          winnerId: row.winner_id?.toString(),
          scoreA: row.score_a,
          scoreB: row.score_b,
          bestOf: row.best_of,
          status: row.status,
          scheduledAt: row.scheduled_at,
          completedAt: row.completed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        swissStandings: standingsResult.rows.map((row: any) => ({
          id: row.id.toString(),
          worldsBracketId: row.worlds_bracket_id.toString(),
          teamId: row.team_id.toString(),
          teamName: row.team_name,
          wins: row.wins,
          losses: row.losses,
          status: row.status,
          qualified: row.qualified,
          isQuarterSeed: row.is_quarter_seed,
          quarterSlot: row.quarter_slot,
          finalRank: row.final_rank
        })),
        knockoutMatches: knockoutResult.rows.map((row: any) => ({
          id: row.id.toString(),
          worldsBracketId: row.worlds_bracket_id.toString(),
          round: row.round,
          matchNumber: row.match_number,
          teamAId: row.team_a_id?.toString(),
          teamBId: row.team_b_id?.toString(),
          teamAName: row.team_a_name,
          teamBName: row.team_b_name,
          teamAQuarterSlot: row.team_a_quarter_slot,
          teamBQuarterSlot: row.team_b_quarter_slot,
          winnerId: row.winner_id?.toString(),
          scoreA: row.score_a,
          scoreB: row.score_b,
          bestOf: row.best_of,
          status: row.status,
          nextMatchId: row.next_match_id,
          scheduledAt: row.scheduled_at,
          completedAt: row.completed_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        champion: bracket.champion_id ? 
          bracket.play_in_teams.find((t: any) => t.teamId === bracket.champion_id.toString()) : undefined,
        runnerUp: bracket.runner_up_id ? 
          bracket.play_in_teams.find((t: any) => t.teamId === bracket.runner_up_id.toString()) : undefined,
        thirdPlace: bracket.third_place_id ? 
          bracket.play_in_teams.find((t: any) => t.teamId === bracket.third_place_id.toString()) : undefined,
        fourthPlace: bracket.fourth_place_id ? 
          bracket.play_in_teams.find((t: any) => t.teamId === bracket.fourth_place_id.toString()) : undefined,
        quarterFinalists: bracket.quarter_finalists || [],
        groupStageTeams: bracket.group_stage_teams || [],
        pointsDistribution: bracket.points_distribution || {
          champion: 20,
          runnerUp: 16,
          thirdPlace: 12,
          fourthPlace: 8,
          quarterFinalist: 6,
          groupStage: 4
        },
        createdAt: bracket.created_at,
        updatedAt: bracket.updated_at
      };

      return worldsBracket;
    } catch (error: any) {
      logger.error('获取世界赛对阵信息失败', { error: error.message, seasonId });
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '获取世界赛对阵信息失败',
        error.message
      );
    }
  }

  /**
   * 生成淘汰赛对阵（公开方法）
   */
  async generateKnockout(bracketId: string): Promise<any> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 检查瑞士轮是否完成（至少4队晋级）
      const qualifiedQuery = `
        SELECT COUNT(*) as count
        FROM worlds_swiss_standings
        WHERE worlds_bracket_id = $1 AND status = 'qualified'
      `;
      const qualifiedResult = await client.query(qualifiedQuery, [bracketId]);
      const qualifiedCount = parseInt(qualifiedResult.rows[0].count);

      if (qualifiedCount < 4) {
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          `瑞士轮尚未完成，只有${qualifiedCount}队晋级，需要4队晋级`
        );
      }

      // 2. 检查是否已经生成过淘汰赛
      const existingQuery = `
        SELECT COUNT(*) as count
        FROM worlds_knockout_matches
        WHERE worlds_bracket_id = $1
      `;
      const existingResult = await client.query(existingQuery, [bracketId]);
      const existingCount = parseInt(existingResult.rows[0].count);

      if (existingCount > 0) {
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          '淘汰赛对阵已生成'
        );
      }

      // 3. 生成淘汰赛对阵
      await this.generateKnockoutBracket(client, bracketId);

      // 4. 更新世界赛状态为淘汰赛阶段
      await client.query(`
        UPDATE worlds_brackets SET status = 'knockout' WHERE id = $1
      `, [bracketId]);

      // 5. 获取生成的淘汰赛比赛
      const matchesQuery = `
        SELECT * FROM worlds_knockout_matches
        WHERE worlds_bracket_id = $1
        ORDER BY 
          CASE round
            WHEN 'QUARTER_FINAL' THEN 1
            WHEN 'SEMI_FINAL' THEN 2
            WHEN 'THIRD_PLACE' THEN 3
            WHEN 'FINAL' THEN 4
          END,
          match_number
      `;
      const matchesResult = await client.query(matchesQuery, [bracketId]);

      await client.query('COMMIT');

      logger.info('[Worlds] 淘汰赛生成成功', { bracketId, matchCount: matchesResult.rows.length });

      return {
        matches: matchesResult.rows.map(row => ({
          id: row.id.toString(),
          worldsBracketId: row.worlds_bracket_id.toString(),
          round: row.round,
          matchNumber: row.match_number,
          teamAId: row.team_a_id?.toString(),
          teamBId: row.team_b_id?.toString(),
          teamAName: row.team_a_name,
          teamBName: row.team_b_name,
          teamAQuarterSlot: row.team_a_quarter_slot,
          teamBQuarterSlot: row.team_b_quarter_slot,
          winnerId: row.winner_id?.toString(),
          scoreA: row.score_a,
          scoreB: row.score_b,
          bestOf: row.best_of,
          status: row.status,
          nextMatchId: row.next_match_id
        }))
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('生成淘汰赛失败', { error: error.message, bracketId });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '生成淘汰赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 生成瑞士轮下一轮对阵
   *
   * 瑞士轮规则：
   * - 第1轮：8队随机配对（4场BO3）
   * - 第2轮：同战绩配对（1-0组对决，0-1组对决）
   * - 第3轮：1-1组决战
   * - 2胜晋级，2败淘汰
   */
  async generateSwissRound(bracketId: string): Promise<WorldsSwissMatch[]> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 获取当前积分榜
      const standingsQuery = `
        SELECT * FROM worlds_swiss_standings
        WHERE worlds_bracket_id = $1 AND status = 'active'
        ORDER BY wins DESC, losses ASC
      `;
      const standingsResult = await client.query(standingsQuery, [bracketId]);
      const activeTeams = standingsResult.rows;

      if (activeTeams.length === 0) {
        throw new BusinessError(ErrorCodes.INVALID_COMPETITION_FORMAT, '没有活跃的队伍参加瑞士轮');
      }

      // 2. 确定当前轮次
      const lastRoundQuery = `
        SELECT MAX(round_number) as last_round
        FROM worlds_swiss_matches
        WHERE worlds_bracket_id = $1
      `;
      const lastRoundResult = await client.query(lastRoundQuery, [bracketId]);
      const lastRound = lastRoundResult.rows[0]?.last_round || 0;
      const currentRound = lastRound + 1;

      if (currentRound > 3) {
        throw new BusinessError(ErrorCodes.INVALID_COMPETITION_FORMAT, '瑞士轮已完成3轮');
      }

      logger.info('[Worlds] 生成瑞士轮对阵', { bracketId, round: currentRound, activeTeams: activeTeams.length });

      // 3. 根据轮次生成配对
      let matches: WorldsSwissMatch[] = [];

      if (currentRound === 1) {
        // 第1轮：随机配对
        matches = await this.generateSwissRound1(client, bracketId, activeTeams);
      } else {
        // 第2轮和第3轮：同战绩配对
        matches = await this.generateSwissRoundByRecord(client, bracketId, currentRound, activeTeams);
      }

      await client.query('COMMIT');
      return matches;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('生成瑞士轮对阵失败', { error: error.message, bracketId });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        '生成瑞士轮对阵失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 生成瑞士轮第1轮对阵（随机配对）
   */
  private async generateSwissRound1(
    client: PoolClient,
    bracketId: string,
    teams: any[]
  ): Promise<WorldsSwissMatch[]> {
    const matches: WorldsSwissMatch[] = [];

    // 随机打乱队伍顺序
    const shuffled = [...teams].sort(() => Math.random() - 0.5);

    // 两两配对
    for (let i = 0; i < shuffled.length; i += 2) {
      const teamA = shuffled[i];
      const teamB = shuffled[i + 1];

      const insertQuery = `
        INSERT INTO worlds_swiss_matches (
          worlds_bracket_id, round_number, match_number,
          team_a_id, team_b_id, team_a_name, team_b_name,
          score_a, score_b, best_of, status
        ) VALUES ($1, 1, $2, $3, $4, $5, $6, 0, 0, 3, 'pending')
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        bracketId,
        Math.floor(i / 2) + 1,
        teamA.team_id,
        teamB.team_id,
        teamA.team_name,
        teamB.team_name
      ]);

      matches.push(this.mapRowToSwissMatch(result.rows[0]));
    }

    return matches;
  }

  /**
   * 生成瑞士轮第2/3轮对阵（同战绩配对）
   */
  private async generateSwissRoundByRecord(
    client: PoolClient,
    bracketId: string,
    roundNumber: number,
    teams: any[]
  ): Promise<WorldsSwissMatch[]> {
    const matches: WorldsSwissMatch[] = [];

    // 按战绩分组
    const recordGroups = new Map<string, any[]>();
    teams.forEach(team => {
      const record = `${team.wins}-${team.losses}`;
      if (!recordGroups.has(record)) {
        recordGroups.set(record, []);
      }
      recordGroups.get(record)!.push(team);
    });

    logger.info('[Worlds] 瑞士轮战绩分组', {
      round: roundNumber,
      groups: Array.from(recordGroups.entries()).map(([record, teams]) => ({
        record,
        count: teams.length
      }))
    });

    // 对每个战绩组进行配对
    let matchNumber = 1;
    for (const [record, groupTeams] of recordGroups) {
      // 随机打乱该分组内的队伍
      const shuffled = [...groupTeams].sort(() => Math.random() - 0.5);

      // 两两配对
      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 >= shuffled.length) {
          logger.warn('[Worlds] 瑞士轮配对异常：队伍数量为奇数', { record, remaining: shuffled.length - i });
          break;
        }

        const teamA = shuffled[i];
        const teamB = shuffled[i + 1];

        const insertQuery = `
          INSERT INTO worlds_swiss_matches (
            worlds_bracket_id, round_number, match_number,
            team_a_id, team_b_id, team_a_name, team_b_name,
            score_a, score_b, best_of, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 3, 'pending')
          RETURNING *
        `;

        const result = await client.query(insertQuery, [
          bracketId,
          roundNumber,
          matchNumber++,
          teamA.team_id,
          teamB.team_id,
          teamA.team_name,
          teamB.team_name
        ]);

        matches.push(this.mapRowToSwissMatch(result.rows[0]));
      }
    }

    return matches;
  }

  /**
   * 模拟瑞士轮单场比赛（BO3）
   */
  async simulateSwissMatch(request: SimulateWorldsMatchRequest): Promise<SimulateWorldsMatchResponse> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 获取比赛信息
      const matchQuery = `SELECT * FROM worlds_swiss_matches WHERE id = $1`;
      const matchResult = await client.query(matchQuery, [request.matchId]);

      if (matchResult.rows.length === 0) {
        throw new BusinessError(ErrorCodes.MSI_NOT_FOUND, '比赛不存在');
      }

      const matchRow = matchResult.rows[0];

      // 检查比赛是否已完成
      if (matchRow.status === 'completed') {
        throw new BusinessError(ErrorCodes.MATCH_ALREADY_COMPLETED, '比赛已完成');
      }

      // 检查双方队伍是否都已确定
      if (!matchRow.team_a_id || !matchRow.team_b_id) {
        throw new BusinessError(ErrorCodes.MSI_MATCH_NOT_READY, '比赛队伍尚未确定');
      }

      // 2. 模拟BO3比赛
      const { scoreA, scoreB, winnerId } = await this.simulateBO3Match(
        client,
        matchRow.team_a_id,
        matchRow.team_b_id
      );

      const loserId = winnerId === matchRow.team_a_id ? matchRow.team_b_id : matchRow.team_a_id;

      // 3. 更新比赛结果
      const updateMatchQuery = `
        UPDATE worlds_swiss_matches
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

      const updatedMatch = this.mapRowToSwissMatch(updatedMatchResult.rows[0]);

      // 4. 更新瑞士轮积分榜
      await this.updateSwissStandings(client, matchRow.worlds_bracket_id, winnerId, loserId);

      // 5. 检查该轮是否完成
      const roundCompleteQuery = `
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM worlds_swiss_matches
        WHERE worlds_bracket_id = $1 AND round_number = $2
      `;
      const roundCompleteResult = await client.query(roundCompleteQuery, [
        matchRow.worlds_bracket_id,
        matchRow.round_number
      ]);

      const { total, completed } = roundCompleteResult.rows[0];
      const isRoundComplete = parseInt(total) === parseInt(completed);

      // 6. 如果本轮完成，检查并更新队伍状态（2胜晋级，2败淘汰）
      if (isRoundComplete) {
        await this.checkAndUpdateTeamStatus(client, matchRow.worlds_bracket_id);
      }

      // 7. 检查瑞士轮是否完全完成（4队晋级）
      const qualifiedCountQuery = `
        SELECT COUNT(*) as count
        FROM worlds_swiss_standings
        WHERE worlds_bracket_id = $1 AND status = 'qualified'
      `;
      const qualifiedCountResult = await client.query(qualifiedCountQuery, [matchRow.worlds_bracket_id]);
      const qualifiedCount = parseInt(qualifiedCountResult.rows[0].count);

      const isSwissComplete = qualifiedCount === 4;

      // 8. 瑞士轮完成检测（不自动生成淘汰赛，由用户手动点击按钮触发）
      // 注释原因：保持UI清晰，用户明确控制赛程推进
      // if (isSwissComplete) {
      //   await this.generateKnockoutBracket(client, matchRow.worlds_bracket_id);
      //   await client.query(`
      //     UPDATE worlds_brackets SET status = 'knockout' WHERE id = $1
      //   `, [matchRow.worlds_bracket_id]);
      // }

      // 9. 获取获胜者和败者信息
      const bracketQuery = `SELECT play_in_teams FROM worlds_brackets WHERE id = $1`;
      const bracketResult = await client.query(bracketQuery, [matchRow.worlds_bracket_id]);
      const playInTeams = bracketResult.rows[0].play_in_teams;

      const winner = playInTeams.find((t: any) => t.teamId === winnerId.toString());
      const loser = playInTeams.find((t: any) => t.teamId === loserId.toString());

      await client.query('COMMIT');

      return {
        match: updatedMatch,
        winner,
        loser,
        isComplete: isSwissComplete
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('模拟瑞士轮比赛失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_MATCH_RESULT,
        '模拟瑞士轮比赛失败',
        error.message
      );
    } finally {
      client.release();
    }
  }

  /**
   * 模拟BO3比赛
   */
  private async simulateBO3Match(
    client: PoolClient,
    teamAId: string,
    teamBId: string
  ): Promise<{ scoreA: number; scoreB: number; winnerId: string }> {
    // 获取队伍实力
    const teamsQuery = `SELECT id, power_rating, name FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await client.query(teamsQuery, [teamAId, teamBId]);

    const teamA = teamsResult.rows.find((t: any) => t.id.toString() === teamAId.toString());
    const teamB = teamsResult.rows.find((t: any) => t.id.toString() === teamBId.toString());

    if (!teamA || !teamB) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, '队伍不存在');
    }

    const powerA = teamA.power_rating || 75;
    const powerB = teamB.power_rating || 75;

    // BO3: 先赢2场者获胜
    let scoreA = 0;
    let scoreB = 0;

    while (scoreA < 2 && scoreB < 2) {
      const totalPower = powerA + powerB;
      const winProbA = powerA / totalPower;
      const random = Math.random();

      if (random < winProbA) {
        scoreA++;
      } else {
        scoreB++;
      }
    }

    const winnerId = scoreA > scoreB ? teamAId : teamBId;

    logger.info('[Worlds] BO3比赛结果', {
      teamA: teamA.name,
      teamB: teamB.name,
      scoreA,
      scoreB,
      winner: winnerId === teamAId ? teamA.name : teamB.name
    });

    return { scoreA, scoreB, winnerId };
  }

  /**
   * 更新瑞士轮积分榜
   */
  private async updateSwissStandings(
    client: PoolClient,
    bracketId: string,
    winnerId: string,
    loserId: string
  ): Promise<void> {
    // 更新获胜队伍
    await client.query(`
      UPDATE worlds_swiss_standings
      SET wins = wins + 1, last_updated = NOW()
      WHERE worlds_bracket_id = $1 AND team_id = $2
    `, [bracketId, winnerId]);

    // 更新失败队伍
    await client.query(`
      UPDATE worlds_swiss_standings
      SET losses = losses + 1, last_updated = NOW()
      WHERE worlds_bracket_id = $1 AND team_id = $2
    `, [bracketId, loserId]);
  }

  /**
   * 检查并更新队伍状态（2胜晋级，2败淘汰）
   */
  private async checkAndUpdateTeamStatus(
    client: PoolClient,
    bracketId: string
  ): Promise<void> {
    // 标记2胜队伍为已晋级
    await client.query(`
      UPDATE worlds_swiss_standings
      SET status = 'qualified', qualified = true
      WHERE worlds_bracket_id = $1 AND wins >= 2 AND status = 'active'
    `, [bracketId]);

    // 标记2败队伍为已淘汰
    await client.query(`
      UPDATE worlds_swiss_standings
      SET status = 'eliminated', qualified = false
      WHERE worlds_bracket_id = $1 AND losses >= 2 AND status = 'active'
    `, [bracketId]);
  }

  /**
   * 生成淘汰赛对阵
   *
   * 规则：
   * - 4支直通队伍 + 4支小组赛晋级队伍 = 8强
   * - 8强 → 4强 → 半决赛 → 决赛 + 季军赛
   * - 半区种子保护：1号种子 vs 晋级队, 2号种子 vs 晋级队
   */
  private async generateKnockoutBracket(
    client: PoolClient,
    bracketId: string
  ): Promise<void> {
    // 1. 获取直通队伍（4队，已有quarterSlot）
    const bracketQuery = `SELECT play_in_teams FROM worlds_brackets WHERE id = $1`;
    const bracketResult = await client.query(bracketQuery, [bracketId]);
    const playInTeams = bracketResult.rows[0].play_in_teams;

    const directSeeds = playInTeams.filter((t: any) => t.directToKnockout);

    // 2. 获取小组赛晋级队伍（4队，按胜场数排序分配quarterSlot）
    const qualifiedQuery = `
      SELECT * FROM worlds_swiss_standings
      WHERE worlds_bracket_id = $1 AND status = 'qualified'
      ORDER BY wins DESC, losses ASC
    `;
    const qualifiedResult = await client.query(qualifiedQuery, [bracketId]);
    const groupQualified = qualifiedResult.rows;

    // 3. 为小组赛晋级队伍分配quarterSlot（5-8号位）
    for (let i = 0; i < groupQualified.length; i++) {
      const slot = i + 5; // 5, 6, 7, 8
      await client.query(`
        UPDATE worlds_swiss_standings
        SET is_quarter_seed = true, quarter_slot = $2
        WHERE id = $1
      `, [groupQualified[i].id, slot]);
      // 同步更新内存中的数组
      groupQualified[i].quarter_slot = slot;
      groupQualified[i].is_quarter_seed = true;
    }

    // 4. 构建8强对阵（4场）
    // 配对规则：1 vs 8, 2 vs 7, 3 vs 6, 4 vs 5
    const pairings = [
      [1, 8], // 半区1
      [4, 5], // 半区1
      [2, 7], // 半区2
      [3, 6]  // 半区2
    ];

    const quarterFinalMatches: any[] = [];
    let matchNumber = 1;

    for (const [slotA, slotB] of pairings) {
      // 查找slot对应的队伍（先从直通队伍找，再从瑞士轮晋级队伍找）
      const findTeamBySlot = (slot: number) => {
        // 1. 先从直通队伍找（1-4号位）
        const directTeam = directSeeds.find((t: any) => t.quarterSlot === slot);
        if (directTeam) {
          logger.debug(`[Worlds] Found direct seed for slot ${slot}:`, directTeam.teamName);
          return directTeam;
        }
        
        // 2. 从瑞士轮晋级队伍找（5-8号位）
        const standing = groupQualified.find((s: any) => s.quarter_slot === slot);
        if (!standing) {
          logger.warn(`[Worlds] No standing found for slot ${slot}`);
          return null;
        }
        
        logger.debug(`[Worlds] Found standing for slot ${slot}:`, {
          standing_team_id: standing.team_id,
          standing_team_name: standing.team_name
        });
        
        // 3. 从playInTeams中找到对应的队伍信息
        // 修复：确保ID类型一致比较
        const standingTeamId = String(standing.team_id);
        const team = playInTeams.find((t: any) => String(t.teamId) === standingTeamId);
        
        if (!team) {
          logger.warn(`[Worlds] Team not found in playInTeams for standing team_id: ${standingTeamId}`);
          // 如果在playInTeams中找不到，直接使用standing中的信息
          return {
            teamId: standing.team_id,
            teamName: standing.team_name,
            quarterSlot: slot
          };
        }
        
        logger.debug(`[Worlds] Found team in playInTeams:`, team.teamName);
        return team;
      };

      const teamA = findTeamBySlot(slotA);
      const teamB = findTeamBySlot(slotB);
      
      logger.info(`[Worlds] QF Match ${matchNumber}: ${teamA?.teamName || 'TBD'} vs ${teamB?.teamName || 'TBD'}`);

      const insertQuery = `
        INSERT INTO worlds_knockout_matches (
          worlds_bracket_id, round, match_number,
          team_a_id, team_b_id, team_a_name, team_b_name,
          team_a_quarter_slot, team_b_quarter_slot,
          score_a, score_b, best_of, status
        ) VALUES ($1, 'QUARTER_FINAL', $2, $3, $4, $5, $6, $7, $8, 0, 0, 5, 'pending')
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        bracketId,
        matchNumber++,
        teamA?.teamId,
        teamB?.teamId,
        teamA?.teamName,
        teamB?.teamName,
        slotA,
        slotB
      ]);

      quarterFinalMatches.push(result.rows[0]);
    }

    // 5. 创建半决赛（2场，待定队伍）
    const semiFinalMatches: any[] = [];
    for (let i = 1; i <= 2; i++) {
      const insertQuery = `
        INSERT INTO worlds_knockout_matches (
          worlds_bracket_id, round, match_number,
          score_a, score_b, best_of, status
        ) VALUES ($1, 'SEMI_FINAL', $2, 0, 0, 5, 'pending')
        RETURNING *
      `;
      const result = await client.query(insertQuery, [bracketId, i]);
      semiFinalMatches.push(result.rows[0]);
    }

    // 6. 创建季军赛（1场，待定队伍）
    const thirdPlaceQuery = `
      INSERT INTO worlds_knockout_matches (
        worlds_bracket_id, round, match_number,
        score_a, score_b, best_of, status
      ) VALUES ($1, 'THIRD_PLACE', 1, 0, 0, 5, 'pending')
      RETURNING *
    `;
    const thirdPlaceResult = await client.query(thirdPlaceQuery, [bracketId]);
    const thirdPlaceMatch = thirdPlaceResult.rows[0];

    // 7. 创建决赛（1场，待定队伍）
    const finalQuery = `
      INSERT INTO worlds_knockout_matches (
        worlds_bracket_id, round, match_number,
        score_a, score_b, best_of, status
      ) VALUES ($1, 'FINAL', 1, 0, 0, 5, 'pending')
      RETURNING *
    `;
    const finalResult = await client.query(finalQuery, [bracketId]);
    const finalMatch = finalResult.rows[0];

    // 8. 设置比赛关系
    // 1/4决赛 → 半决赛
    await client.query(`UPDATE worlds_knockout_matches SET next_match_id = $2 WHERE id = $1`, [quarterFinalMatches[0].id, semiFinalMatches[0].id]);
    await client.query(`UPDATE worlds_knockout_matches SET next_match_id = $2 WHERE id = $1`, [quarterFinalMatches[1].id, semiFinalMatches[0].id]);
    await client.query(`UPDATE worlds_knockout_matches SET next_match_id = $2 WHERE id = $1`, [quarterFinalMatches[2].id, semiFinalMatches[1].id]);
    await client.query(`UPDATE worlds_knockout_matches SET next_match_id = $2 WHERE id = $1`, [quarterFinalMatches[3].id, semiFinalMatches[1].id]);

    // 半决赛 → 决赛和季军赛（败者）
    // 注意：季军赛需要在两场半决赛都完成后才能确定队伍

    // 半决赛 → 决赛（胜者）
    await client.query(`UPDATE worlds_knockout_matches SET next_match_id = $2 WHERE id = $1`, [semiFinalMatches[0].id, finalMatch.id]);
    await client.query(`UPDATE worlds_knockout_matches SET next_match_id = $2 WHERE id = $1`, [semiFinalMatches[1].id, finalMatch.id]);

    logger.info('[Worlds] 淘汰赛对阵生成完成', {
      bracketId,
      quarterFinals: 4,
      semiFinals: 2,
      thirdPlace: 1,
      final: 1
    });
  }

  /**
   * 模拟淘汰赛单场比赛（BO5）
   */
  async simulateKnockoutMatch(request: SimulateWorldsMatchRequest): Promise<SimulateWorldsMatchResponse> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. 获取比赛信息
      const matchQuery = `SELECT * FROM worlds_knockout_matches WHERE id = $1`;
      const matchResult = await client.query(matchQuery, [request.matchId]);

      if (matchResult.rows.length === 0) {
        throw new BusinessError(ErrorCodes.MSI_NOT_FOUND, '比赛不存在');
      }

      const matchRow = matchResult.rows[0];

      // 检查比赛是否已完成
      if (matchRow.status === 'completed') {
        throw new BusinessError(ErrorCodes.MATCH_ALREADY_COMPLETED, '比赛已完成');
      }

      // 检查双方队伍是否都已确定
      if (!matchRow.team_a_id || !matchRow.team_b_id) {
        throw new BusinessError(ErrorCodes.MSI_MATCH_NOT_READY, '比赛队伍尚未确定');
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
        UPDATE worlds_knockout_matches
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

      const updatedMatch = this.mapRowToKnockoutMatch(updatedMatchResult.rows[0]);

      // 4. 推进到下一轮
      await this.advanceKnockoutToNextRound(client, matchRow, winnerId, loserId);

      // 5. 检查世界赛是否完成
      const isWorldsComplete = await this.checkWorldsComplete(client, matchRow.worlds_bracket_id);

      // 6. 获取获胜者和败者信息
      const bracketQuery = `SELECT play_in_teams FROM worlds_brackets WHERE id = $1`;
      const bracketResult = await client.query(bracketQuery, [matchRow.worlds_bracket_id]);
      const playInTeams = bracketResult.rows[0].play_in_teams;

      const winner = playInTeams.find((t: any) => t.teamId === winnerId.toString());
      const loser = playInTeams.find((t: any) => t.teamId === loserId.toString());

      let finalStandings;
      if (isWorldsComplete) {
        // 更新最终排名
        finalStandings = await this.updateWorldsFinalStandings(client, matchRow.worlds_bracket_id);

        // 分配赛事积分
        await this.distributeWorldsPoints(client, matchRow.worlds_bracket_id, finalStandings);
      }

      await client.query('COMMIT');

      return {
        match: updatedMatch,
        winner,
        loser,
        isComplete: isWorldsComplete,
        finalStandings
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('模拟淘汰赛比赛失败', { error: error.message, request });

      if (error instanceof BusinessError) {
        throw error;
      }

      throw new BusinessError(
        ErrorCodes.INVALID_MATCH_RESULT,
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
  private async simulateBO5Match(
    client: PoolClient,
    teamAId: string,
    teamBId: string
  ): Promise<{ scoreA: number; scoreB: number; winnerId: string }> {
    const teamsQuery = `SELECT id, power_rating, name FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await client.query(teamsQuery, [teamAId, teamBId]);

    const teamA = teamsResult.rows.find((t: any) => t.id.toString() === teamAId.toString());
    const teamB = teamsResult.rows.find((t: any) => t.id.toString() === teamBId.toString());

    if (!teamA || !teamB) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, '队伍不存在');
    }

    const powerA = teamA.power_rating || 75;
    const powerB = teamB.power_rating || 75;

    // BO5: 先赢3场者获胜
    let scoreA = 0;
    let scoreB = 0;

    while (scoreA < 3 && scoreB < 3) {
      const totalPower = powerA + powerB;
      const winProbA = powerA / totalPower;
      const random = Math.random();

      if (random < winProbA) {
        scoreA++;
      } else {
        scoreB++;
      }
    }

    const winnerId = scoreA > scoreB ? teamAId : teamBId;

    logger.info('[Worlds] BO5比赛结果', {
      teamA: teamA.name,
      teamB: teamB.name,
      scoreA,
      scoreB,
      winner: winnerId === teamAId ? teamA.name : teamB.name
    });

    return { scoreA, scoreB, winnerId };
  }

  /**
   * 推进淘汰赛到下一轮
   */
  private async advanceKnockoutToNextRound(
    client: PoolClient,
    match: any,
    winnerId: string,
    loserId: string
  ): Promise<void> {
    // 获取队伍信息
    const teamsQuery = `SELECT id, name FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await client.query(teamsQuery, [winnerId, loserId]);

    const winner = teamsResult.rows.find((t: any) => t.id.toString() === winnerId.toString());
    const loser = teamsResult.rows.find((t: any) => t.id.toString() === loserId.toString());

    if (!winner || !loser) {
      throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, '队伍不存在');
    }

    // 胜者晋级下一轮
    if (match.next_match_id) {
      await this.updateNextKnockoutMatchTeam(client, match.next_match_id, winnerId, winner.name);
    }

    // 特殊处理：半决赛的败者进入季军赛
    if (match.round === 'SEMI_FINAL') {
      const thirdPlaceQuery = `
        SELECT id FROM worlds_knockout_matches
        WHERE worlds_bracket_id = $1 AND round = 'THIRD_PLACE'
      `;
      const thirdPlaceResult = await client.query(thirdPlaceQuery, [match.worlds_bracket_id]);

      if (thirdPlaceResult.rows.length > 0) {
        const thirdPlaceMatchId = thirdPlaceResult.rows[0].id;
        await this.updateNextKnockoutMatchTeam(client, thirdPlaceMatchId, loserId, loser.name);
      }
    }
  }

  /**
   * 更新下一场淘汰赛的队伍
   */
  private async updateNextKnockoutMatchTeam(
    client: PoolClient,
    nextMatchId: string,
    teamId: string,
    teamName: string
  ): Promise<void> {
    const checkQuery = `SELECT team_a_id, team_b_id FROM worlds_knockout_matches WHERE id = $1`;
    const checkResult = await client.query(checkQuery, [nextMatchId]);

    if (checkResult.rows.length === 0) return;

    const nextMatch = checkResult.rows[0];

    if (!nextMatch.team_a_id) {
      await client.query(
        `UPDATE worlds_knockout_matches SET team_a_id = $2, team_a_name = $3 WHERE id = $1`,
        [nextMatchId, teamId, teamName]
      );
    } else if (!nextMatch.team_b_id) {
      await client.query(
        `UPDATE worlds_knockout_matches SET team_b_id = $2, team_b_name = $3 WHERE id = $1`,
        [nextMatchId, teamId, teamName]
      );
    }
  }

  /**
   * 检查世界赛是否完成
   */
  private async checkWorldsComplete(client: PoolClient, bracketId: string): Promise<boolean> {
    // 检查决赛是否完成
    const finalQuery = `
      SELECT status FROM worlds_knockout_matches
      WHERE worlds_bracket_id = $1 AND round = 'FINAL'
    `;
    const finalResult = await client.query(finalQuery, [bracketId]);

    if (finalResult.rows.length === 0) return false;

    return finalResult.rows[0].status === 'completed';
  }

  /**
   * 更新世界赛最终排名
   */
  private async updateWorldsFinalStandings(client: PoolClient, bracketId: string): Promise<any> {
    // 获取决赛结果
    const finalQuery = `SELECT * FROM worlds_knockout_matches WHERE worlds_bracket_id = $1 AND round = 'FINAL'`;
    const finalResult = await client.query(finalQuery, [bracketId]);
    const final = finalResult.rows[0];

    const championId = final.winner_id;
    const runnerUpId = final.winner_id === final.team_a_id ? final.team_b_id : final.team_a_id;

    // 获取季军赛结果
    const thirdPlaceQuery = `SELECT * FROM worlds_knockout_matches WHERE worlds_bracket_id = $1 AND round = 'THIRD_PLACE'`;
    const thirdPlaceResult = await client.query(thirdPlaceQuery, [bracketId]);
    const thirdPlace = thirdPlaceResult.rows[0];

    const thirdPlaceId = thirdPlace.winner_id;
    const fourthPlaceId = thirdPlace.winner_id === thirdPlace.team_a_id ? thirdPlace.team_b_id : thirdPlace.team_a_id;

    // 获取8强止步队伍（4队）
    const quarterFinalistsQuery = `
      SELECT team_a_id, team_b_id, winner_id FROM worlds_knockout_matches
      WHERE worlds_bracket_id = $1 AND round = 'QUARTER_FINAL'
    `;
    const quarterFinalistsResult = await client.query(quarterFinalistsQuery, [bracketId]);
    const quarterFinalists: string[] = [];
    quarterFinalistsResult.rows.forEach((match: any) => {
      const loserId = match.winner_id === match.team_a_id ? match.team_b_id : match.team_a_id;
      quarterFinalists.push(loserId.toString());
    });

    // 获取小组赛止步队伍（4队）
    const groupStageQuery = `
      SELECT team_id FROM worlds_swiss_standings
      WHERE worlds_bracket_id = $1 AND status = 'eliminated'
    `;
    const groupStageResult = await client.query(groupStageQuery, [bracketId]);
    const groupStageTeams = groupStageResult.rows.map((row: any) => row.team_id.toString());

    // 获取bracket的play_in_teams
    const bracketQuery = `SELECT play_in_teams FROM worlds_brackets WHERE id = $1`;
    const bracketResult = await client.query(bracketQuery, [bracketId]);
    const playInTeams = bracketResult.rows[0].play_in_teams;

    const champion = playInTeams.find((t: any) => t.teamId === championId.toString());
    const runnerUp = playInTeams.find((t: any) => t.teamId === runnerUpId.toString());
    const third = playInTeams.find((t: any) => t.teamId === thirdPlaceId.toString());
    const fourth = playInTeams.find((t: any) => t.teamId === fourthPlaceId.toString());

    const quarterFinalistsTeams = quarterFinalists.map(id => playInTeams.find((t: any) => t.teamId === id));
    const groupStageTeamsData = groupStageTeams.map(id => playInTeams.find((t: any) => t.teamId === id));

    // 更新bracket表
    await client.query(`
      UPDATE worlds_brackets
      SET champion_id = $2, runner_up_id = $3, third_place_id = $4, fourth_place_id = $5,
          quarter_finalists = $6, group_stage_teams = $7, status = 'completed'
      WHERE id = $1
    `, [
      bracketId,
      championId,
      runnerUpId,
      thirdPlaceId,
      fourthPlaceId,
      JSON.stringify(quarterFinalistsTeams),
      JSON.stringify(groupStageTeamsData)
    ]);

    logger.info('[Worlds] 世界赛排名更新完成', {
      champion: champion?.teamName,
      runnerUp: runnerUp?.teamName,
      thirdPlace: third?.teamName,
      fourthPlace: fourth?.teamName
    });

    return {
      champion,
      runnerUp,
      thirdPlace: third,
      fourthPlace: fourth,
      quarterFinalists: quarterFinalistsTeams,
      groupStageTeams: groupStageTeamsData
    };
  }

  /**
   * 分配世界赛积分
   * 根据策划案规则：冠军20分、亚军16分、季军12分、殿军8分、8强6分、小组赛4分
   */
  private async distributeWorldsPoints(client: PoolClient, bracketId: string, standings: any): Promise<void> {
    try {
      // 1. 获取积分配置和赛季信息
      const bracketQuery = `
        SELECT 
          wb.points_distribution,
          wb.season_id,
          s.year as season_year,
          s.season_code,
          s.id as db_season_id
        FROM worlds_brackets wb
        JOIN seasons s ON wb.season_id = s.season_code
        WHERE wb.id = $1
      `;
      const bracketResult = await client.query(bracketQuery, [bracketId]);
      const bracketData = bracketResult.rows[0];
      const pointsDistribution = bracketData.points_distribution;
      const seasonYear = bracketData.season_year;
      const pointType = 'worlds';

      // 2. 分配前四名积分
      const distributions = [
        { 
          teamId: standings.champion.teamId, 
          points: pointsDistribution.champion || 20,
          rank: 1,
          description: '世界赛冠军'
        },
        { 
          teamId: standings.runnerUp.teamId, 
          points: pointsDistribution.runnerUp || 16,
          rank: 2,
          description: '世界赛亚军'
        },
        { 
          teamId: standings.thirdPlace.teamId, 
          points: pointsDistribution.thirdPlace || 12,
          rank: 3,
          description: '世界赛季军'
        },
        { 
          teamId: standings.fourthPlace.teamId, 
          points: pointsDistribution.fourthPlace || 8,
          rank: 4,
          description: '世界赛殿军'
        }
      ];

      // 3. 添加8强止步队伍（4队，各6分）
      const quarterFinalistPoints = pointsDistribution.quarterFinalist || 6;
      standings.quarterFinalists.forEach((team: any, index: number) => {
        distributions.push({
          teamId: team.teamId,
          points: quarterFinalistPoints,
          rank: 5 + index,
          description: '世界赛8强'
        });
      });

      // 4. 添加小组赛止步队伍（4队，各4分）
      const groupStagePoints = pointsDistribution.groupStage || 4;
      standings.groupStageTeams.forEach((team: any, index: number) => {
        distributions.push({
          teamId: team.teamId,
          points: groupStagePoints,
          rank: 9 + index,
          description: '世界赛小组赛'
        });
      });

      // 5. 使用数据库函数分配积分
      for (const dist of distributions) {
        await client.query(`
          SELECT award_points_to_team($1, $2, $3, $4, NULL, NULL, $5)
        `, [
          dist.teamId,
          seasonYear,
          dist.points,
          pointType,
          `${dist.description} (+${dist.points}分)`
        ]);

        logger.info('✅ 世界赛积分已分配', {
          teamId: dist.teamId,
          points: dist.points,
          rank: dist.rank,
          description: dist.description,
          seasonYear
        });
      }

      // 6. 创建荣誉记录（只为前4名创建）
      // 使用之前查询的db_season_id来查找competition
      const honorQuery = `
        SELECT c.id as competition_id, c.season_id
        FROM competitions c
        WHERE c.season_id = $1 AND c.type = 'worlds'
      `;
      const honorResult = await client.query(honorQuery, [bracketData.db_season_id]);
      
      if (honorResult.rows.length > 0) {
        const { competition_id, season_id } = honorResult.rows[0];
        
        for (const dist of distributions.slice(0, 4)) { // 只记录前4名
          await honorHallService.createHonorRecord(
            season_id.toString(),
            competition_id.toString(),
            dist.teamId.toString(),
            dist.rank,
            dist.points
          );
        }
        
        logger.info('✅ 世界赛荣誉记录创建完成', {
          bracketId,
          seasonId: season_id,
          competitionId: competition_id
        });
      } else {
        logger.warn('⚠️ 未找到对应的Worlds competition，跳过荣誉记录创建', {
          bracketId,
          seasonId: bracketData.season_id,
          dbSeasonId: bracketData.db_season_id
        });
      }

      logger.info('🎉 世界赛积分分配完成', {
        bracketId,
        seasonYear,
        totalPointsAwarded: distributions.reduce((sum, d) => sum + d.points, 0),
        teamsCount: distributions.length
      });

    } catch (error: any) {
      logger.error('❌ 世界赛积分分配失败', {
        error: error.message,
        bracketId,
        standings
      });
      throw error;
    }
  }

  /**
   * 更新世界赛状态
   */
  async updateWorldsStatus(bracketId: string, status: string): Promise<any> {
    try {
      const query = `
        UPDATE worlds_brackets
        SET status = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      const result = await db.query(query, [bracketId, status]);

      if (result.rows.length === 0) {
        throw new BusinessError(ErrorCodes.MSI_NOT_FOUND, '世界赛不存在');
      }

      logger.info('[Worlds] 更新世界赛状态', { bracketId, status });
      return { id: bracketId, status };
    } catch (error: any) {
      logger.error('更新世界赛状态失败', { error: error.message, bracketId, status });
      
      if (error instanceof BusinessError) {
        throw error;
      }
      
      throw new BusinessError(
        ErrorCodes.MSI_NOT_FOUND,
        '更新世界赛状态失败',
        error.message
      );
    }
  }

  /**
   * 获取瑞士轮积分榜
   */
  async getSwissStandings(bracketId: string): Promise<SwissStandings[]> {
    try {
      const query = `
        SELECT * FROM worlds_swiss_standings
        WHERE worlds_bracket_id = $1
        ORDER BY wins DESC, losses ASC
      `;
      const result = await db.query(query, [bracketId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        worldsBracketId: row.worlds_bracket_id,
        teamId: row.team_id.toString(),
        teamName: row.team_name,
        wins: row.wins,
        losses: row.losses,
        status: row.status,
        qualified: row.qualified,
        isQuarterSeed: row.is_quarter_seed,
        quarterSlot: row.quarter_slot,
        finalRank: row.final_rank
      }));
    } catch (error: any) {
      logger.error('获取瑞士轮积分榜失败', { error: error.message, bracketId });
      throw new BusinessError(
        ErrorCodes.MSI_NOT_FOUND,
        '获取瑞士轮积分榜失败',
        error.message
      );
    }
  }

  /**
   * 映射数据库行到瑞士轮比赛对象
   */
  private mapRowToSwissMatch(row: any): WorldsSwissMatch {
    return {
      id: row.id,
      worldsBracketId: row.worlds_bracket_id,
      roundNumber: row.round_number,
      matchNumber: row.match_number,
      teamAId: row.team_a_id?.toString(),
      teamBId: row.team_b_id?.toString(),
      teamAName: row.team_a_name,
      teamBName: row.team_b_name,
      winnerId: row.winner_id?.toString(),
      scoreA: row.score_a,
      scoreB: row.score_b,
      bestOf: row.best_of,
      status: row.status,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * 映射数据库行到淘汰赛比赛对象
   */
  private mapRowToKnockoutMatch(row: any): WorldsKnockoutMatch {
    return {
      id: row.id,
      worldsBracketId: row.worlds_bracket_id,
      round: row.round,
      matchNumber: row.match_number,
      teamAId: row.team_a_id?.toString(),
      teamBId: row.team_b_id?.toString(),
      teamAName: row.team_a_name,
      teamBName: row.team_b_name,
      teamAQuarterSlot: row.team_a_quarter_slot,
      teamBQuarterSlot: row.team_b_quarter_slot,
      winnerId: row.winner_id?.toString(),
      scoreA: row.score_a,
      scoreB: row.score_b,
      bestOf: row.best_of,
      status: row.status,
      nextMatchId: row.next_match_id,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const worldsService = new WorldsService();
