// =================================================================
// 电竞赛事模拟系统 - Super洲际超级杯服务
// =================================================================

import { PoolClient } from 'pg';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { honorHallService } from './HonorHallService';
import {
  BusinessError,
  ErrorCodes
} from '../types';

// Super洲际赛相关类型
export interface SuperQualification {
  teamId: number;
  teamName: string;
  regionId: number;
  regionName: string;
  season1Year: number;
  season2Year: number;
  season1Points: number;
  season2Points: number;
  totalPoints: number;
  rank: number;
  group: 'legendary' | 'challenger' | 'fighter';
  fighterSubGroup?: 'A' | 'B';
}

export interface SuperBracket {
  id: number;
  season1Id: number;
  season2Id: number;
  season1Code: string;
  season2Code: string;
  season1Year: number;
  season2Year: number;
  superYear: number;
  status: string;
  qualifiedTeams: SuperQualification[];
  legendaryGroup: SuperQualification[];
  challengerGroup: SuperQualification[];
  fighterGroup: SuperQualification[];
  fighterGroupA: SuperQualification[];
  fighterGroupB: SuperQualification[];
  rounds: SuperRound[];
  pointsDistribution: any;
  createdAt: string;
  updatedAt: string;
}

export interface SuperMatch {
  id: number;
  superId: number;
  matchNumber: number;
  matchType: string;
  stage: string;
  bestOf: number;
  bracketType?: string;
  groupName?: string;
  teamAId?: number;
  teamBId?: number;
  teamAName?: string;
  teamBName?: string;
  scoreA?: number;
  scoreB?: number;
  winnerId?: number;
  winnerName?: string;
  status: string;
  nextMatchId?: number;
  loserNextMatchId?: number;
}

export interface SuperRound {
  id: number;
  superId: number;
  roundNumber: number;
  roundName: string;
  stage: string;
  status: string;
  matches: SuperMatch[];
}

export interface FighterStanding {
  teamId: number;
  teamName: string;
  regionName: string;
  group: 'A' | 'B';
  matchesPlayed: number;
  wins: number;
  losses: number;
  record: string;
  position: number;
  qualified: boolean;
}

export interface GenerateSuperRequest {
  season1Code: string;
  season2Code: string;
}

export interface SimulateSuperMatchRequest {
  matchId: string;
  superId: string;
}

export interface SimulateSuperMatchResponse {
  match: SuperMatch;
  winner: SuperQualification;
  loser: SuperQualification;
  nextMatch?: SuperMatch;
  loserNextMatch?: SuperMatch;
  isSuperComplete: boolean;
  isStageComplete: boolean;
  updatedStandings?: FighterStanding[];
  finalStandings?: any;
}

export interface SuperEligibilityResponse {
  eligible: boolean;
  reason?: string;
  season1Code: string;
  season2Code: string;
  season1Completed: boolean;
  season2Completed: boolean;
  qualifiedTeams?: SuperQualification[];
}

export class SuperService {
  /**
   * 检查是否可以生成Super洲际赛
   * 要求: 两个连续赛季的世界赛都已完成
   */
  async checkSuperEligibility(season1Code: string, season2Code: string): Promise<SuperEligibilityResponse> {
    try {
      logger.info(`[SuperService] 检查Super资格: ${season1Code}-${season2Code}`);

      // 1. 获取两个赛季信息
      const seasonsQuery = `
        SELECT id, season_code, year, status, current_phase
        FROM seasons
        WHERE season_code IN ($1, $2)
        ORDER BY year ASC
      `;
      const seasonsResult = await db.query(seasonsQuery, [season1Code, season2Code]);

      if (seasonsResult.rows.length !== 2) {
        return {
          eligible: false,
          reason: '找不到指定的两个赛季',
          season1Code,
          season2Code,
          season1Completed: false,
          season2Completed: false
        };
      }

      const season1 = seasonsResult.rows[0];
      const season2 = seasonsResult.rows[1];

      // 2. 检查是否已有Super赛事
      const existingSuperQuery = `
        SELECT id FROM super_brackets
        WHERE season1_id = $1 AND season2_id = $2
      `;
      const existingResult = await db.query(existingSuperQuery, [season1.id, season2.id]);

      if (existingResult.rows.length > 0) {
        return {
          eligible: false,
          reason: `${season1Code}-${season2Code} Super赛事已生成`,
          season1Code,
          season2Code,
          season1Completed: true,
          season2Completed: true
        };
      }

      // 3. 检查两个赛季的世界赛是否都完成
      const worldsQuery = `
        SELECT season_id, status
        FROM worlds_brackets
        WHERE season_id IN ($1, $2)
      `;
      const worldsResult = await db.query(worldsQuery, [season1.season_code, season2.season_code]);

      const season1Worlds = worldsResult.rows.find(w => w.season_id === season1.season_code);
      const season2Worlds = worldsResult.rows.find(w => w.season_id === season2.season_code);

      const season1Completed = season1Worlds?.status === 'completed';
      const season2Completed = season2Worlds?.status === 'completed';

      if (!season1Completed) {
        return {
          eligible: false,
          reason: `${season1Code}世界赛尚未完成`,
          season1Code,
          season2Code,
          season1Completed,
          season2Completed
        };
      }

      if (!season2Completed) {
        return {
          eligible: false,
          reason: `${season2Code}世界赛尚未完成`,
          season1Code,
          season2Code,
          season1Completed,
          season2Completed
        };
      }

      // 4. 获取晋级队伍
      const qualifiedTeams = await this.calculateTwoYearRankings(season1.id, season2.id);

      if (qualifiedTeams.length < 16) {
        return {
          eligible: false,
          reason: `晋级队伍不足16支(当前${qualifiedTeams.length}支)`,
          season1Code,
          season2Code,
          season1Completed,
          season2Completed
        };
      }

      return {
        eligible: true,
        season1Code,
        season2Code,
        season1Completed,
        season2Completed,
        qualifiedTeams: qualifiedTeams.slice(0, 16)
      };

    } catch (error) {
      logger.error('[SuperService] 检查Super资格失败:', error);
      throw error;
    }
  }

  /**
   * 计算两年积分排名
   */
  private async calculateTwoYearRankings(season1Id: number, season2Id: number): Promise<SuperQualification[]> {
    try {
      // 获取两个赛季的年份
      const seasonsQuery = `
        SELECT id, year, season_code
        FROM seasons
        WHERE id IN ($1, $2)
        ORDER BY year ASC
      `;
      const seasonsResult = await db.query(seasonsQuery, [season1Id, season2Id]);
      const season1 = seasonsResult.rows[0];
      const season2 = seasonsResult.rows[1];

      // 获取所有队伍的两年积分
      const pointsQuery = `
        WITH season1_points AS (
          SELECT
            ar.team_id,
            COALESCE(ar.total_points, 0) as points
          FROM annual_rankings ar
          JOIN seasons s ON ar.season_id = s.id
          WHERE s.year = $1
        ),
        season2_points AS (
          SELECT
            ar.team_id,
            COALESCE(ar.total_points, 0) as points
          FROM annual_rankings ar
          JOIN seasons s ON ar.season_id = s.id
          WHERE s.year = $2
        )
        SELECT
          t.id as team_id,
          t.name as team_name,
          t.region_id,
          r.name as region_name,
          COALESCE(s1.points, 0) as season1_points,
          COALESCE(s2.points, 0) as season2_points,
          (COALESCE(s1.points, 0) + COALESCE(s2.points, 0)) as total_points
        FROM teams t
        JOIN regions r ON r.id = t.region_id
        LEFT JOIN season1_points s1 ON s1.team_id = t.id
        LEFT JOIN season2_points s2 ON s2.team_id = t.id
        WHERE (COALESCE(s1.points, 0) + COALESCE(s2.points, 0)) > 0
        ORDER BY total_points DESC, season2_points DESC, season1_points DESC
        LIMIT 16
      `;

      const result = await db.query(pointsQuery, [season1.year, season2.year]);

      // 转换为SuperQualification格式并分组
      const qualifications: SuperQualification[] = result.rows.map((row, index) => {
        const rank = index + 1;
        let group: 'legendary' | 'challenger' | 'fighter';
        let fighterSubGroup: 'A' | 'B' | undefined;

        if (rank <= 4) {
          group = 'legendary';
        } else if (rank <= 8) {
          group = 'challenger';
        } else {
          group = 'fighter';
          // Fighter组分A/B组（9-12为A组，13-16为B组）
          fighterSubGroup = rank <= 12 ? 'A' : 'B';
        }

        return {
          teamId: row.team_id,
          teamName: row.team_name,
          regionId: row.region_id,
          regionName: row.region_name,
          season1Year: season1.year,
          season2Year: season2.year,
          season1Points: parseInt(row.season1_points) || 0,
          season2Points: parseInt(row.season2_points) || 0,
          totalPoints: parseInt(row.total_points) || 0,
          rank,
          group,
          fighterSubGroup
        };
      });

      return qualifications;

    } catch (error) {
      logger.error('[SuperService] 计算两年积分排名失败:', error);
      throw error;
    }
  }

  /**
   * 生成Super洲际赛
   */
  async generateSuper(request: GenerateSuperRequest, client?: PoolClient): Promise<SuperBracket> {
    const useClient = client || db;
    const shouldCommit = !client;

    try {
      logger.info(`[SuperService] 开始生成Super赛事: ${request.season1Code}-${request.season2Code}`);

      if (shouldCommit) await useClient.query('BEGIN');

      // 1. 检查资格
      const eligibility = await this.checkSuperEligibility(request.season1Code, request.season2Code);
      if (!eligibility.eligible) {
        throw new BusinessError(eligibility.reason || 'Super赛事生成条件不满足', ErrorCodes.BUSINESS_ERROR);
      }

      // 2. 获取赛季信息
      const seasonsQuery = `
        SELECT id, season_code, year
        FROM seasons
        WHERE season_code IN ($1, $2)
        ORDER BY year ASC
      `;
      const seasonsResult = await useClient.query(seasonsQuery, [request.season1Code, request.season2Code]);
      const season1 = seasonsResult.rows[0];
      const season2 = seasonsResult.rows[1];

      // 3. 获取晋级队伍
      const qualifiedTeams = eligibility.qualifiedTeams!;

      // 分组
      const legendaryGroup = qualifiedTeams.filter(t => t.group === 'legendary');
      const challengerGroup = qualifiedTeams.filter(t => t.group === 'challenger');
      const fighterGroup = qualifiedTeams.filter(t => t.group === 'fighter');
      const fighterGroupA = fighterGroup.filter(t => t.fighterSubGroup === 'A');
      const fighterGroupB = fighterGroup.filter(t => t.fighterSubGroup === 'B');

      // 4. 创建Super主记录
      const insertBracketQuery = `
        INSERT INTO super_brackets (
          season1_id, season2_id, season1_code, season2_code,
          season1_year, season2_year, super_year,
          status, qualified_teams, legendary_group, challenger_group,
          fighter_group, fighter_group_a, fighter_group_b
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const bracketResult = await useClient.query(insertBracketQuery, [
        season1.id,
        season2.id,
        season1.season_code,
        season2.season_code,
        season1.year,
        season2.year,
        season2.year, // Super赛在第二年举办
        'not_started',
        JSON.stringify(qualifiedTeams),
        JSON.stringify(legendaryGroup),
        JSON.stringify(challengerGroup),
        JSON.stringify(fighterGroup),
        JSON.stringify(fighterGroupA),
        JSON.stringify(fighterGroupB)
      ]);

      const bracket = bracketResult.rows[0];
      const superId = bracket.id;

      logger.info(`[SuperService] Super赛事主记录创建成功, ID: ${superId}`);

      // 5. 生成第一阶段：Fighter组预选赛
      await this.generateFighterGroupMatches(superId, fighterGroupA, fighterGroupB, useClient);

      // 6. 初始化Fighter组积分榜
      await this.initializeFighterStandings(superId, fighterGroup, useClient);

      if (shouldCommit) await useClient.query('COMMIT');

      logger.info(`[SuperService] ✅ Super赛事生成成功`);

      // 返回完整的Super对阵
      return await this.getSuperBracket(request.season1Code, request.season2Code);

    } catch (error) {
      if (shouldCommit) await useClient.query('ROLLBACK');
      logger.error('[SuperService] 生成Super失败:', error);
      throw error;
    }
  }

  /**
   * 生成Fighter组预选赛比赛
   */
  private async generateFighterGroupMatches(
    superId: number,
    groupA: SuperQualification[],
    groupB: SuperQualification[],
    client: PoolClient
  ): Promise<void> {
    try {
      logger.info(`[SuperService] 生成Fighter组预选赛比赛`);

      // 创建轮次
      const roundQuery = `
        INSERT INTO super_rounds (super_id, round_number, round_name, stage, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;

      const roundResult = await client.query(roundQuery, [
        superId, 1, 'Fighter组预选赛', 'fighter_group', 'pending'
      ]);

      // 生成A组的单循环比赛（每队与其他3队各打1场，共6场）
      let matchNumber = 1;
      const groupAMatches = this.generateRoundRobinMatches(groupA, 'A');
      for (const match of groupAMatches) {
        await this.createSuperMatch(superId, matchNumber++, 'fighter_group_a', 'fighter_group', match, 1, 'Fighter A组', client);
      }

      // 生成B组的单循环比赛
      const groupBMatches = this.generateRoundRobinMatches(groupB, 'B');
      for (const match of groupBMatches) {
        await this.createSuperMatch(superId, matchNumber++, 'fighter_group_b', 'fighter_group', match, 1, 'Fighter B组', client);
      }

      logger.info(`[SuperService] Fighter组预选赛比赛生成完成，共${matchNumber - 1}场`);

    } catch (error) {
      logger.error('[SuperService] 生成Fighter组比赛失败:', error);
      throw error;
    }
  }

  /**
   * 生成单循环赛程
   */
  private generateRoundRobinMatches(teams: SuperQualification[], group: string): Array<{teamA: SuperQualification, teamB: SuperQualification}> {
    const matches: Array<{teamA: SuperQualification, teamB: SuperQualification}> = [];
    
    // 单循环：每队与其他队各打1场
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          teamA: teams[i],
          teamB: teams[j]
        });
      }
    }

    return matches;
  }

  /**
   * 创建Super比赛记录
   */
  private async createSuperMatch(
    superId: number,
    matchNumber: number,
    matchType: string,
    stage: string,
    matchup: { teamA: SuperQualification, teamB: SuperQualification },
    bestOf: number,
    groupName: string,
    client: PoolClient
  ): Promise<void> {
    const insertQuery = `
      INSERT INTO super_matches (
        super_id, match_number, match_type, stage, best_of,
        group_name, team_a_id, team_b_id, team_a_name, team_b_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await client.query(insertQuery, [
      superId,
      matchNumber,
      matchType,
      stage,
      bestOf,
      groupName,
      matchup.teamA.teamId,
      matchup.teamB.teamId,
      matchup.teamA.teamName,
      matchup.teamB.teamName,
      'scheduled'
    ]);
  }

  /**
   * 初始化Fighter组积分榜
   */
  private async initializeFighterStandings(
    superId: number,
    fighterGroup: SuperQualification[],
    client: PoolClient
  ): Promise<void> {
    try {
      for (const team of fighterGroup) {
        const insertQuery = `
          INSERT INTO super_fighter_standings (
            super_id, team_id, team_name, region_name, group_name
          )
          VALUES ($1, $2, $3, $4, $5)
        `;

        await client.query(insertQuery, [
          superId,
          team.teamId,
          team.teamName,
          team.regionName,
          team.fighterSubGroup
        ]);
      }

      logger.info(`[SuperService] Fighter组积分榜初始化完成`);
    } catch (error) {
      logger.error('[SuperService] 初始化Fighter组积分榜失败:', error);
      throw error;
    }
  }

  /**
   * 获取Super对阵信息
   */
  async getSuperBracket(season1Code: string, season2Code: string): Promise<SuperBracket> {
    try {
      logger.info(`[SuperService] 获取Super对阵: ${season1Code}-${season2Code}`);

      // 获取Super主记录
      const bracketQuery = `
        SELECT sb.*, 
               s1.season_code as s1_code, s1.year as s1_year,
               s2.season_code as s2_code, s2.year as s2_year
        FROM super_brackets sb
        JOIN seasons s1 ON s1.id = sb.season1_id
        JOIN seasons s2 ON s2.id = sb.season2_id
        WHERE s1.season_code = $1 AND s2.season_code = $2
      `;

      const bracketResult = await db.query(bracketQuery, [season1Code, season2Code]);

      if (bracketResult.rows.length === 0) {
        throw new BusinessError('未找到Super赛事', ErrorCodes.NOT_FOUND);
      }

      const bracket = bracketResult.rows[0];
      const superId = bracket.id;

      // 获取所有比赛
      const matchesQuery = `
        SELECT *
        FROM super_matches
        WHERE super_id = $1
        ORDER BY match_number ASC
      `;
      const matchesResult = await db.query(matchesQuery, [superId]);

      // 获取轮次信息
      const roundsQuery = `
        SELECT *
        FROM super_rounds
        WHERE super_id = $1
        ORDER BY round_number ASC
      `;
      const roundsResult = await db.query(roundsQuery, [superId]);

      // 组装轮次和比赛数据
      const rounds = roundsResult.rows.map(round => ({
        id: round.id,
        superId: round.super_id,
        roundNumber: round.round_number,
        roundName: round.round_name,
        stage: round.stage,
        status: round.status,
        matches: matchesResult.rows.filter(m => m.stage === round.stage).map(this.formatMatch)
      }));

      // 获取Fighter组积分榜
      const standingsQuery = `
        SELECT *
        FROM super_fighter_standings
        WHERE super_id = $1
        ORDER BY group_name, position ASC
      `;
      const standingsResult = await db.query(standingsQuery, [superId]);

      // 格式化返回数据
      return {
        id: bracket.id,
        season1Id: bracket.season1_id,
        season2Id: bracket.season2_id,
        season1Code: bracket.season1_code,
        season2Code: bracket.season2_code,
        season1Year: bracket.season1_year,
        season2Year: bracket.season2_year,
        superYear: bracket.super_year,
        status: bracket.status,
        qualifiedTeams: bracket.qualified_teams || [],
        legendaryGroup: bracket.legendary_group || [],
        challengerGroup: bracket.challenger_group || [],
        fighterGroup: bracket.fighter_group || [],
        fighterGroupA: bracket.fighter_group_a || [],
        fighterGroupB: bracket.fighter_group_b || [],
        champion: bracket.champion,
        runnerUp: bracket.runner_up,
        thirdPlace: bracket.third_place,
        fourthPlace: bracket.fourth_place,
        rounds,
        fighterStandings: standingsResult.rows.map(s => ({
          id: s.id,
          superId: s.super_id,
          teamId: String(s.team_id),
          teamName: s.team_name,
          regionName: s.region_name,
          group: s.group_name,
          matchesPlayed: s.matches_played,
          wins: s.wins,
          losses: s.losses,
          record: s.record,
          position: s.position,
          qualified: s.qualified
        })),
        createdAt: bracket.created_at,
        updatedAt: bracket.updated_at
      };

    } catch (error) {
      logger.error('[SuperService] 获取Super对阵失败:', error);
      throw error;
    }
  }

  /**
   * 格式化比赛数据
   */
  private formatMatch(match: any): SuperMatch {
    return {
      id: match.id,
      superId: match.super_id,
      matchNumber: match.match_number,
      matchType: match.match_type,
      stage: match.stage,
      bestOf: match.best_of,
      bracketType: match.bracket_type,
      groupName: match.group_name,
      teamAId: match.team_a_id,
      teamBId: match.team_b_id,
      teamAName: match.team_a_name,
      teamBName: match.team_b_name,
      scoreA: match.score_a,
      scoreB: match.score_b,
      winnerId: match.winner_id,
      winnerName: match.winner_name,
      status: match.status,
      nextMatchId: match.next_match_id,
      loserNextMatchId: match.loser_next_match_id
    };
  }

  /**
   * 获取晋级队伍列表
   */
  async getQualifiedTeams(season1Code: string, season2Code: string): Promise<SuperQualification[]> {
    try {
      // 获取赛季ID
      const seasonsQuery = `
        SELECT id FROM seasons
        WHERE season_code IN ($1, $2)
        ORDER BY year ASC
      `;
      const seasonsResult = await db.query(seasonsQuery, [season1Code, season2Code]);

      if (seasonsResult.rows.length !== 2) {
        throw new BusinessError('找不到指定的赛季', ErrorCodes.NOT_FOUND);
      }

      const season1Id = seasonsResult.rows[0].id;
      const season2Id = seasonsResult.rows[1].id;

      return await this.calculateTwoYearRankings(season1Id, season2Id);

    } catch (error) {
      logger.error('[SuperService] 获取晋级队伍失败:', error);
      throw error;
    }
  }

  /**
   * 模拟Super比赛
   */
  async simulateSuperMatch(request: SimulateSuperMatchRequest): Promise<SimulateSuperMatchResponse> {
    try {
      logger.info(`[SuperService] 模拟Super比赛: matchId=${request.matchId}`);

      await db.query('BEGIN');

      // 1. 获取比赛信息
      const matchQuery = `SELECT * FROM super_matches WHERE id = $1`;
      const matchResult = await db.query(matchQuery, [request.matchId]);

      if (matchResult.rows.length === 0) {
        throw new BusinessError('比赛不存在', ErrorCodes.NOT_FOUND);
      }

      const match = matchResult.rows[0];

      // 2. 检查比赛是否已完成
      if (match.status === 'completed') {
        throw new BusinessError('比赛已完成', ErrorCodes.BUSINESS_ERROR);
      }

      // 2.5 如果是总决赛，检查季军赛是否已完成
      if (match.match_type?.includes('grand_final')) {
        const thirdPlaceQuery = `
          SELECT status FROM super_matches
          WHERE super_id = $1 AND match_type LIKE '%third_place%'
        `;
        const thirdPlaceResult = await db.query(thirdPlaceQuery, [match.super_id]);
        
        if (thirdPlaceResult.rows.length > 0 && thirdPlaceResult.rows[0].status !== 'completed') {
          throw new BusinessError('请先完成季军赛', ErrorCodes.BUSINESS_ERROR);
        }
      }

      // 3. 模拟比赛结果（基于战力值）
      const result = await this.simulateMatchResult(match.team_a_id, match.team_b_id, match.best_of);

      // 4. 更新比赛记录
      const updateMatchQuery = `
        UPDATE super_matches
        SET score_a = $1, score_b = $2, winner_id = $3, winner_name = $4,
            status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = $5
        RETURNING *
      `;

      const updatedMatchResult = await db.query(updateMatchQuery, [
        result.scoreA,
        result.scoreB,
        result.winnerId,
        result.winnerName,
        request.matchId
      ]);

      const updatedMatch = updatedMatchResult.rows[0];

      // 5. 更新积分榜（如果是Fighter组）
      let updatedStandings: FighterStanding[] | undefined;
      if (match.match_type === 'fighter_group_a' || match.match_type === 'fighter_group_b') {
        await this.updateFighterStandings(match.super_id, match.id, result);
        updatedStandings = await this.getFighterStandings(match.super_id);
      }

      // 5.5 检查是否需要生成晋级赛（挑战者组定位赛完成后）
      if (match.stage === 'challenger_stage' && match.match_type?.startsWith('challenger_positioning')) {
        await this.checkAndGenerateAdvancementMatches(match.super_id);
      }

      // 5.6 检查是否需要生成败者组决赛（预备战胜者组和败者组完成后）
      if (match.stage === 'preparation_stage' && (match.match_type === 'prep_winners_match' || match.match_type === 'prep_losers_match')) {
        await this.checkAndGenerateLosersFinal(match.super_id);
      }

      // 5.7 检查是否需要生成冠军赛次轮（首轮完成后）
      if (match.stage === 'championship_stage' && match.match_type?.startsWith('championship_r1')) {
        await this.checkAndGenerateChampionshipRound2(match.super_id);
      }

      // 5.8 检查是否需要生成季军赛和总决赛（次轮完成后）
      if (match.stage === 'championship_stage' && match.match_type?.startsWith('championship_r2')) {
        await this.checkAndGenerateFinals(match.super_id);
      }

      // 6. 检查阶段是否完成
      const isStageComplete = await this.checkStageComplete(match.super_id, match.stage);
      let isSuperComplete = await this.checkSuperComplete(match.super_id);

      await db.query('COMMIT');

      // 7. 在事务提交后，检查是否需要完成冠军赛阶段（总决赛和季军赛都完成后）
      if (match.stage === 'championship_stage' && (match.match_type?.includes('grand_final') || match.match_type?.includes('third_place'))) {
        await this.checkAndCompleteChampionship(match.super_id);
        // 重新检查Super是否完成
        isSuperComplete = await this.checkSuperComplete(match.super_id);
      }

      // 8. 构造响应
      const winner = await this.getTeamQualification(result.winnerId, match.super_id);
      const loser = await this.getTeamQualification(result.loserId, match.super_id);

      return {
        match: this.formatMatch(updatedMatch),
        winner,
        loser,
        isSuperComplete,
        isStageComplete,
        updatedStandings
      };

    } catch (error) {
      await db.query('ROLLBACK');
      logger.error('[SuperService] 模拟比赛失败:', error);
      throw error;
    }
  }

  /**
   * 模拟比赛结果
   */
  private async simulateMatchResult(teamAId: number, teamBId: number, bestOf: number): Promise<any> {
    // 获取战队战力
    const teamsQuery = `SELECT id, name, power_rating FROM teams WHERE id IN ($1, $2)`;
    const teamsResult = await db.query(teamsQuery, [teamAId, teamBId]);

    const teamA = teamsResult.rows.find(t => t.id === teamAId);
    const teamB = teamsResult.rows.find(t => t.id === teamBId);

    if (!teamA || !teamB) {
      throw new BusinessError('队伍不存在', ErrorCodes.NOT_FOUND);
    }

    // 基于战力值计算获胜概率
    const powerA = teamA.power_rating || 75;
    const powerB = teamB.power_rating || 75;
    const totalPower = powerA + powerB;
    const teamAWinProb = powerA / totalPower;

    // 模拟BO比赛
    const targetWins = Math.ceil(bestOf / 2);
    let scoreA = 0;
    let scoreB = 0;

    while (scoreA < targetWins && scoreB < targetWins) {
      const rand = Math.random();
      if (rand < teamAWinProb) {
        scoreA++;
      } else {
        scoreB++;
      }
    }

    const winnerId = scoreA > scoreB ? teamAId : teamBId;
    const loserId = scoreA > scoreB ? teamBId : teamAId;
    const winnerName = scoreA > scoreB ? teamA.name : teamB.name;

    return { scoreA, scoreB, winnerId, loserId, winnerName };
  }

  /**
   * 更新Fighter组积分榜
   */
  private async updateFighterStandings(superId: number, matchId: number, result: any): Promise<void> {
    // 获取比赛信息
    const matchQuery = `SELECT * FROM super_matches WHERE id = $1`;
    const matchResult = await db.query(matchQuery, [matchId]);
    const match = matchResult.rows[0];

    // 更新胜者积分
    await db.query(`
      UPDATE super_fighter_standings
      SET wins = wins + 1, matches_played = matches_played + 1,
          record = (wins + 1) || '-' || losses
      WHERE super_id = $1 AND team_id = $2
    `, [superId, result.winnerId]);

    // 更新败者积分
    await db.query(`
      UPDATE super_fighter_standings
      SET losses = losses + 1, matches_played = matches_played + 1,
          record = wins || '-' || (losses + 1)
      WHERE super_id = $1 AND team_id = $2
    `, [superId, result.loserId]);

    // 更新排名
    await this.updateFighterRankings(superId);
  }

  /**
   * 更新Fighter组排名
   */
  private async updateFighterRankings(superId: number): Promise<void> {
    // 为每个组分别排名
    for (const group of ['A', 'B']) {
      const standingsQuery = `
        SELECT id, wins, losses
        FROM super_fighter_standings
        WHERE super_id = $1 AND group_name = $2
        ORDER BY wins DESC, losses ASC
      `;
      
      const standingsResult = await db.query(standingsQuery, [superId, group]);

      for (let i = 0; i < standingsResult.rows.length; i++) {
        const standing = standingsResult.rows[i];
        await db.query(`
          UPDATE super_fighter_standings
          SET position = $1, qualified = $2
          WHERE id = $3
        `, [i + 1, i === 0, standing.id]);
      }
    }
  }

  /**
   * 获取Fighter组积分榜
   */
  private async getFighterStandings(superId: number): Promise<FighterStanding[]> {
    const query = `
      SELECT *
      FROM super_fighter_standings
      WHERE super_id = $1
      ORDER BY group_name, position
    `;

    const result = await db.query(query, [superId]);

    return result.rows.map(row => ({
      teamId: row.team_id,
      teamName: row.team_name,
      regionName: row.region_name,
      group: row.group_name,
      matchesPlayed: row.matches_played,
      wins: row.wins,
      losses: row.losses,
      record: row.record,
      position: row.position,
      qualified: row.qualified
    }));
  }

  /**
   * 检查阶段是否完成
   */
  private async checkStageComplete(superId: number, stage: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as total, 
             COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM super_matches
      WHERE super_id = $1 AND stage = $2
    `;

    const result = await db.query(query, [superId, stage]);
    const { total, completed } = result.rows[0];

    return parseInt(total) === parseInt(completed);
  }

  /**
   * 检查Super是否完成
   */
  private async checkSuperComplete(superId: number): Promise<boolean> {
    const query = `SELECT status FROM super_brackets WHERE id = $1`;
    const result = await db.query(query, [superId]);

    return result.rows[0]?.status === 'completed';
  }

  /**
   * 获取队伍的SuperQualification信息
   */
  private async getTeamQualification(teamId: number, superId: number): Promise<SuperQualification> {
    const bracketQuery = `SELECT qualified_teams FROM super_brackets WHERE id = $1`;
    const bracketResult = await db.query(bracketQuery, [superId]);

    const qualifiedTeams = bracketResult.rows[0].qualified_teams;
    const team = qualifiedTeams.find((t: any) => t.teamId === teamId);

    if (!team) {
      throw new BusinessError('队伍不在参赛名单中', ErrorCodes.NOT_FOUND);
    }

    return team;
  }

  /**
   * 开始下一阶段
   */
  async startNextStage(superId: string): Promise<SuperBracket> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      logger.info(`[SuperService] 开始推进到下一阶段: superId=${superId}`);

      // 1. 获取当前Super状态
      const bracketQuery = `SELECT * FROM super_brackets WHERE id = $1`;
      const bracketResult = await client.query(bracketQuery, [superId]);

      if (bracketResult.rows.length === 0) {
        throw new BusinessError('Super赛事不存在', ErrorCodes.NOT_FOUND);
      }

      const bracket = bracketResult.rows[0];
      const currentStatus = bracket.status;

      logger.info(`[SuperService] 当前状态: ${currentStatus}`);

      // 2. 根据当前状态推进
      let newStatus: string;

      switch (currentStatus) {
        case 'not_started':
          // Fighter组比赛已生成，更新状态为进行中
          newStatus = 'fighter_group';
          await client.query(`UPDATE super_brackets SET status = $1 WHERE id = $2`, [newStatus, superId]);
          break;

        case 'fighter_group':
          // Fighter组结束，生成挑战者组
          await this.completeFighterStage(parseInt(superId), client);
          newStatus = 'challenger_stage';
          await client.query(`UPDATE super_brackets SET status = $1 WHERE id = $2`, [newStatus, superId]);
          break;

        case 'challenger_stage':
          // 挑战者组结束，生成预备战
          await this.completeChallengerStage(parseInt(superId), client);
          newStatus = 'preparation_stage';
          await client.query(`UPDATE super_brackets SET status = $1 WHERE id = $2`, [newStatus, superId]);
          break;

        case 'preparation_stage':
          // 预备战结束，生成冠军赛
          await this.completePreparationStage(parseInt(superId), client);
          newStatus = 'championship_stage';
          await client.query(`UPDATE super_brackets SET status = $1 WHERE id = $2`, [newStatus, superId]);
          break;

        case 'championship_stage':
          // 冠军赛结束，分配积分
          await this.completeChampionshipStage(parseInt(superId), client);
          newStatus = 'completed';
          await client.query(`UPDATE super_brackets SET status = $1 WHERE id = $2`, [newStatus, superId]);
          break;

        default:
          throw new BusinessError('无法推进到下一阶段', ErrorCodes.BUSINESS_ERROR);
      }

      await client.query('COMMIT');

      logger.info(`[SuperService] ✅ 成功推进到: ${newStatus}`);

      // 返回更新后的数据
      const updatedBracket = await this.getSuperBracket(bracket.season1_code, bracket.season2_code);
      return updatedBracket;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('[SuperService] 推进阶段失败:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 完成Fighter组阶段
   */
  private async completeFighterStage(superId: number, client: PoolClient): Promise<void> {
    logger.info(`[SuperService] 完成Fighter组阶段`);

    // 1. 获取积分榜确定晋级队伍
    const standingsQuery = `
      SELECT * FROM super_fighter_standings
      WHERE super_id = $1
      ORDER BY group_name, wins DESC, (wins - losses) DESC
    `;
    const standingsResult = await client.query(standingsQuery, [superId]);

    const groupAStandings = standingsResult.rows.filter(s => s.group_name === 'A');
    const groupBStandings = standingsResult.rows.filter(s => s.group_name === 'B');

    if (groupAStandings.length === 0 || groupBStandings.length === 0) {
      throw new BusinessError('Fighter组数据不完整', ErrorCodes.BUSINESS_ERROR);
    }

    const groupAWinner = groupAStandings[0];
    const groupBWinner = groupBStandings[0];

    // 2. 更新bracket记录
    const updateQuery = `
      UPDATE super_brackets
      SET fighter_qualifiers = $1
      WHERE id = $2
    `;

    const qualifiers = [
      { teamId: groupAWinner.team_id, teamName: groupAWinner.team_name, from: 'Fighter A组冠军' },
      { teamId: groupBWinner.team_id, teamName: groupBWinner.team_name, from: 'Fighter B组冠军' }
    ];

    await client.query(updateQuery, [JSON.stringify(qualifiers), superId]);

    logger.info(`[SuperService] Fighter组晋级队伍: ${groupAWinner.team_name}, ${groupBWinner.team_name}`);

    // 3. 生成挑战者组比赛
    await this.generateChallengerStageMatches(superId, client);
  }

  /**
   * 生成挑战者组比赛
   */
  private async generateChallengerStageMatches(superId: number, client: PoolClient): Promise<void> {
    logger.info(`[SuperService] 生成挑战者组比赛`);


    // 创建轮次记录
    const roundQuery = `
      INSERT INTO super_rounds (super_id, round_number, round_name, stage, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    await client.query(roundQuery, [
      superId, 2, '挑战者组阶段', 'challenger_stage', 'pending'
    ]);

    // 获取挑战者组队伍（4支）
    const bracketQuery = `SELECT challenger_group, fighter_qualifiers FROM super_brackets WHERE id = $1`;
    const bracketResult = await client.query(bracketQuery, [superId]);
    const challengerGroup = bracketResult.rows[0].challenger_group;
    const fighterQualifiers = bracketResult.rows[0].fighter_qualifiers;

    // 挑战者定位赛（4支队伍，2场BO5）
    // 5vs6, 7vs8
    const roundNumber = 2;
    await this.createSuperMatch(superId, 13, 'challenger_positioning_1', 'challenger_stage', 
      { teamA: challengerGroup[0], teamB: challengerGroup[1] }, 5, '挑战者定位赛1', client);
    
    await this.createSuperMatch(superId, 14, 'challenger_positioning_2', 'challenger_stage',
      { teamA: challengerGroup[2], teamB: challengerGroup[3] }, 5, '挑战者定位赛2', client);

    logger.info(`[SuperService] 挑战者定位赛生成完成`);
  }

  /**
   * 检查并生成晋级赛（定位赛完成后）
   */
  private async checkAndGenerateAdvancementMatches(superId: number): Promise<void> {
    // 检查定位赛是否都完成
    const positioningMatchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'challenger_stage' 
        AND match_type LIKE 'challenger_positioning%'
      ORDER BY match_number
    `;
    const positioningResult = await db.query(positioningMatchesQuery, [superId]);

    // 如果定位赛还没完成，直接返回
    if (positioningResult.rows.length !== 2) return;
    if (positioningResult.rows.some(m => m.status !== 'completed')) return;

    // 检查晋级赛是否已经生成
    const advancementMatchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'challenger_stage' 
        AND match_type LIKE 'advancement_match%'
    `;
    const existingAdvancement = await db.query(advancementMatchesQuery, [superId]);
    if (existingAdvancement.rows.length > 0) return; // 已经生成过了

    logger.info(`[SuperService] 定位赛完成，生成晋级赛`);

    // 获取定位赛败者
    const match1 = positioningResult.rows[0];
    const match2 = positioningResult.rows[1];

    const loser1Id = match1.winner_id === match1.team_a_id ? match1.team_b_id : match1.team_a_id;
    const loser1Name = match1.winner_id === match1.team_a_id ? match1.team_b_name : match1.team_a_name;
    
    const loser2Id = match2.winner_id === match2.team_a_id ? match2.team_b_id : match2.team_a_id;
    const loser2Name = match2.winner_id === match2.team_a_id ? match2.team_b_name : match2.team_a_name;

    // 获取Fighter组晋级者
    const bracketQuery = `SELECT fighter_qualifiers FROM super_brackets WHERE id = $1`;
    const bracketResult = await db.query(bracketQuery, [superId]);
    const fighterQualifiers = bracketResult.rows[0].fighter_qualifiers;

    // 生成晋级赛：定位赛败者 vs Fighter组晋级者
    const insertQuery = `
      INSERT INTO super_matches (
        super_id, match_number, match_type, stage, best_of,
        group_name, team_a_id, team_b_id, team_a_name, team_b_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    // 晋级赛1: 定位赛败者1 vs Fighter组晋级者1
    await db.query(insertQuery, [
      superId, 15, 'advancement_match_1', 'challenger_stage', 5,
      '晋级赛1', loser1Id, fighterQualifiers[0].teamId, loser1Name, fighterQualifiers[0].teamName, 'scheduled'
    ]);

    // 晋级赛2: 定位赛败者2 vs Fighter组晋级者2
    await db.query(insertQuery, [
      superId, 16, 'advancement_match_2', 'challenger_stage', 5,
      '晋级赛2', loser2Id, fighterQualifiers[1].teamId, loser2Name, fighterQualifiers[1].teamName, 'scheduled'
    ]);

    // 更新bracket记录挑战者组败者
    const challengerLosers = [
      { teamId: loser1Id, teamName: loser1Name },
      { teamId: loser2Id, teamName: loser2Name }
    ];
    
    const updateQuery = `UPDATE super_brackets SET challenger_losers = $1 WHERE id = $2`;
    await db.query(updateQuery, [JSON.stringify(challengerLosers), superId]);

    logger.info(`[SuperService] ✅ 晋级赛生成完成`);
  }

  /**
   * 完成挑战者组阶段
   */
  private async completeChallengerStage(superId: number, client: PoolClient): Promise<void> {
    logger.info(`[SuperService] 完成挑战者组阶段`);

    // 获取挑战者定位赛结果
    const matchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 AND stage = 'challenger_stage'
      ORDER BY match_number
    `;
    const matchesResult = await client.query(matchesQuery, [superId]);

    if (matchesResult.rows.length < 4) {
      throw new BusinessError('挑战者组比赛未完成', ErrorCodes.BUSINESS_ERROR);
    }

    // 解析结果
    const positioning1 = matchesResult.rows[0]; // 5vs6
    const positioning2 = matchesResult.rows[1]; // 7vs8
    const advancement1 = matchesResult.rows[2]; // 挑战者败者 vs Fighter冠军
    const advancement2 = matchesResult.rows[3]; // 挑战者败者 vs Fighter冠军

    // 确定晋级预备战的队伍
    const challengerWinners = [
      { teamId: positioning1.winner_id, teamName: positioning1.winner_name, from: '挑战者5' },
      { teamId: positioning2.winner_id, teamName: positioning2.winner_name, from: '挑战者7' }
    ];

    const advancementWinners = [
      { teamId: advancement1.winner_id, teamName: advancement1.winner_name, from: '晋级赛1' },
      { teamId: advancement2.winner_id, teamName: advancement2.winner_name, from: '晋级赛2' }
    ];

    await client.query(`
      UPDATE super_brackets
      SET challenger_winners = $1, advancement_winners = $2
      WHERE id = $3
    `, [JSON.stringify(challengerWinners), JSON.stringify(advancementWinners), superId]);

    // 生成预备战比赛
    await this.generatePreparationStageMatches(superId, client);
  }

  /**
   * 生成预备战比赛
   */
  private async generatePreparationStageMatches(superId: number, client: PoolClient): Promise<void> {
    logger.info(`[SuperService] 生成预备战比赛`);

    // 创建轮次记录
    const roundQuery = `
      INSERT INTO super_rounds (super_id, round_number, round_name, stage, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    await client.query(roundQuery, [
      superId, 3, '预备战阶段', 'preparation_stage', 'pending'
    ]);

    // 预备战：4支队伍（2个定位赛胜者 + 2个晋级赛胜者）
    // 胜者组：定位赛胜者之间对决
    // 败者组：晋级赛胜者之间对决
    const bracketQuery = `SELECT challenger_winners, advancement_winners FROM super_brackets WHERE id = $1`;
    const bracketResult = await client.query(bracketQuery, [superId]);
    const challengerWinners = bracketResult.rows[0].challenger_winners; // 定位赛胜者
    const advancementWinners = bracketResult.rows[0].advancement_winners; // 晋级赛胜者

    // 胜者组比赛：2支定位赛胜者对决
    await this.createSuperMatch(superId, 17, 'prep_winners_match', 'preparation_stage',
      { teamA: challengerWinners[0], teamB: challengerWinners[1] }, 5, '预备战胜者组', client);

    // 败者组比赛：2支晋级赛胜者对决
    await this.createSuperMatch(superId, 18, 'prep_losers_match', 'preparation_stage',
      { teamA: advancementWinners[0], teamB: advancementWinners[1] }, 5, '预备战败者组', client);

    logger.info(`[SuperService] 预备战胜者组和败者组比赛生成完成`);
  }

  /**
   * 检查并生成败者组决赛（胜者组和败者组完成后）
   */
  private async checkAndGenerateLosersFinal(superId: number): Promise<void> {
    // 检查胜者组和败者组是否都完成
    const prepMatchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'preparation_stage' 
        AND (match_type = 'prep_winners_match' OR match_type = 'prep_losers_match')
      ORDER BY match_number
    `;
    const prepResult = await db.query(prepMatchesQuery, [superId]);

    // 如果两场比赛还没都完成，直接返回
    if (prepResult.rows.length !== 2) return;
    if (prepResult.rows.some(m => m.status !== 'completed')) return;

    // 检查败者组决赛是否已经生成
    const finalMatchQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'preparation_stage' 
        AND match_type LIKE '%losers_final%'
    `;
    const existingFinal = await db.query(finalMatchQuery, [superId]);
    if (existingFinal.rows.length > 0) return; // 已经生成过了

    logger.info(`[SuperService] 预备战胜者组和败者组完成，生成败者组决赛`);

    const winnersMatch = prepResult.rows.find(m => m.match_type === 'prep_winners_match');
    const losersMatch = prepResult.rows.find(m => m.match_type === 'prep_losers_match');

    // 胜者组败者（进入败者组决赛）
    const winnersLoserId = winnersMatch.winner_id === winnersMatch.team_a_id ? winnersMatch.team_b_id : winnersMatch.team_a_id;
    const winnersLoserName = winnersMatch.winner_id === winnersMatch.team_a_id ? winnersMatch.team_b_name : winnersMatch.team_a_name;

    // 败者组胜者（进入败者组决赛）
    const losersWinnerId = losersMatch.winner_id;
    const losersWinnerName = losersMatch.winner_name;

    // 生成败者组决赛
    const insertQuery = `
      INSERT INTO super_matches (
        super_id, match_number, match_type, stage, best_of,
        group_name, team_a_id, team_b_id, team_a_name, team_b_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await db.query(insertQuery, [
      superId, 19, 'prep_losers_final', 'preparation_stage', 5,
      '败者组决赛', winnersLoserId, losersWinnerId, winnersLoserName, losersWinnerName, 'scheduled'
    ]);

    logger.info(`[SuperService] ✅ 败者组决赛生成完成`);
  }

  /**
   * 完成预备战阶段
   */
  private async completePreparationStage(superId: number, client: PoolClient): Promise<void> {
    logger.info(`[SuperService] 完成预备战阶段`);

    // 获取预备战结果，确定晋级冠军赛的2支队伍
    const matchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 AND stage = 'preparation_stage'
      ORDER BY match_number
    `;
    const matchesResult = await client.query(matchesQuery, [superId]);

    // 胜者组冠军：prep_winners_match 的胜者
    const winnersMatch = matchesResult.rows.find(m => m.match_type === 'prep_winners_match');
    const prepWinnersChampion = {
      teamId: winnersMatch.winner_id,
      teamName: winnersMatch.winner_name,
      from: '预备战胜者组冠军'
    };

    // 败者组决赛胜者：prep_losers_final 的胜者
    const losersFinalMatch = matchesResult.rows.find(m => m.match_type === 'prep_losers_final');
    const prepLosersFinalWinner = {
      teamId: losersFinalMatch.winner_id,
      teamName: losersFinalMatch.winner_name,
      from: '败者组决赛胜者'
    };

    await client.query(`
      UPDATE super_brackets
      SET prep_winners_champion = $1, prep_losers_final_winner = $2
      WHERE id = $3
    `, [JSON.stringify(prepWinnersChampion), JSON.stringify(prepLosersFinalWinner), superId]);

    logger.info(`[SuperService] 预备战晋级者: ${prepWinnersChampion.teamName}, ${prepLosersFinalWinner.teamName}`);

    // 生成冠军赛
    await this.generateChampionshipStageMatches(superId, client);
  }

  /**
   * 生成冠军赛比赛
   */
  private async generateChampionshipStageMatches(superId: number, client: PoolClient): Promise<void> {
    logger.info(`[SuperService] 生成冠军赛比赛`);

    // 创建轮次记录
    const roundQuery = `
      INSERT INTO super_rounds (super_id, round_number, round_name, stage, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    await client.query(roundQuery, [
      superId, 4, '冠军赛阶段', 'championship_stage', 'pending'
    ]);

    // 冠军赛：6支队伍（4个传奇组 + 2个预备战晋级）
    // 首轮：传奇3、4名 vs 预备战晋级者（2场）
    // 次轮：首轮胜者 vs 传奇1、2名（等首轮完成后生成）
    const bracketQuery = `
      SELECT legendary_group, prep_winners_champion, prep_losers_final_winner 
      FROM super_brackets WHERE id = $1
    `;
    const bracketResult = await client.query(bracketQuery, [superId]);
    const legendaryGroup = bracketResult.rows[0].legendary_group;
    const prepWinnersChampion = bracketResult.rows[0].prep_winners_champion; // 预备战胜者组冠军
    const prepLosersFinalWinner = bracketResult.rows[0].prep_losers_final_winner; // 预备战败者组决赛胜者

    // 冠军赛首轮（2场BO5）
    // 传奇4 vs 预备战胜者组冠军
    await this.createSuperMatch(superId, 23, 'championship_r1_1', 'championship_stage',
      { teamA: legendaryGroup[3], teamB: prepWinnersChampion }, 5, '冠军赛首轮1', client);

    // 传奇3 vs 预备战败者组决赛胜者
    await this.createSuperMatch(superId, 24, 'championship_r1_2', 'championship_stage',
      { teamA: legendaryGroup[2], teamB: prepLosersFinalWinner }, 5, '冠军赛首轮2', client);

    logger.info(`[SuperService] 冠军赛首轮比赛生成完成（传奇1、2名直接晋级次轮）`);
  }

  /**
   * 检查并生成冠军赛次轮（首轮完成后）
   */
  private async checkAndGenerateChampionshipRound2(superId: number): Promise<void> {
    // 检查首轮是否都完成
    const round1MatchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'championship_stage' 
        AND match_type LIKE 'championship_r1%'
      ORDER BY match_number
    `;
    const round1Result = await db.query(round1MatchesQuery, [superId]);

    // 如果首轮还没完成，直接返回
    if (round1Result.rows.length !== 2) return;
    if (round1Result.rows.some(m => m.status !== 'completed')) return;

    // 检查次轮是否已经生成
    const round2MatchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'championship_stage' 
        AND match_type LIKE 'championship_r2%'
    `;
    const existingRound2 = await db.query(round2MatchesQuery, [superId]);
    if (existingRound2.rows.length > 0) return; // 已经生成过了

    logger.info(`[SuperService] 冠军赛首轮完成，生成次轮比赛`);

    // 获取首轮胜者
    const winner1Id = round1Result.rows[0].winner_id;
    const winner1Name = round1Result.rows[0].winner_name;
    const winner2Id = round1Result.rows[1].winner_id;
    const winner2Name = round1Result.rows[1].winner_name;

    // 获取传奇组1、2名
    const bracketQuery = `SELECT legendary_group FROM super_brackets WHERE id = $1`;
    const bracketResult = await db.query(bracketQuery, [superId]);
    const legendaryGroup = bracketResult.rows[0].legendary_group;
    const legendary1 = legendaryGroup[0]; // TOP 1
    const legendary2 = legendaryGroup[1]; // TOP 2

    // 生成次轮比赛
    const insertQuery = `
      INSERT INTO super_matches (
        super_id, match_number, match_type, stage, best_of,
        group_name, team_a_id, team_b_id, team_a_name, team_b_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    // 次轮1: 首轮胜者1 vs 传奇1
    await db.query(insertQuery, [
      superId, 25, 'championship_r2_1', 'championship_stage', 5,
      '冠军赛次轮1', winner1Id, legendary1.teamId, winner1Name, legendary1.teamName, 'scheduled'
    ]);

    // 次轮2: 首轮胜者2 vs 传奇2
    await db.query(insertQuery, [
      superId, 26, 'championship_r2_2', 'championship_stage', 5,
      '冠军赛次轮2', winner2Id, legendary2.teamId, winner2Name, legendary2.teamName, 'scheduled'
    ]);

    logger.info(`[SuperService] ✅ 冠军赛次轮比赛生成完成`);
  }

  /**
   * 检查并生成季军赛和总决赛（次轮完成后）
   */
  private async checkAndGenerateFinals(superId: number): Promise<void> {
    // 检查次轮是否都完成
    const round2MatchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'championship_stage' 
        AND match_type LIKE 'championship_r2%'
      ORDER BY match_number
    `;
    const round2Result = await db.query(round2MatchesQuery, [superId]);

    // 如果次轮还没完成，直接返回
    if (round2Result.rows.length !== 2) return;
    if (round2Result.rows.some(m => m.status !== 'completed')) return;

    // 检查决赛是否已经生成
    const finalsQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'championship_stage' 
        AND (match_type LIKE '%third_place%' OR match_type LIKE '%grand_final%')
    `;
    const existingFinals = await db.query(finalsQuery, [superId]);
    if (existingFinals.rows.length > 0) return; // 已经生成过了

    logger.info(`[SuperService] 冠军赛次轮完成，生成季军赛和总决赛`);

    const match1 = round2Result.rows[0];
    const match2 = round2Result.rows[1];

    // 次轮胜者（进入总决赛）
    const finalist1Id = match1.winner_id;
    const finalist1Name = match1.winner_name;
    const finalist2Id = match2.winner_id;
    const finalist2Name = match2.winner_name;

    // 次轮败者（进入季军赛）
    const loser1Id = match1.winner_id === match1.team_a_id ? match1.team_b_id : match1.team_a_id;
    const loser1Name = match1.winner_id === match1.team_a_id ? match1.team_b_name : match1.team_a_name;
    const loser2Id = match2.winner_id === match2.team_a_id ? match2.team_b_id : match2.team_a_id;
    const loser2Name = match2.winner_id === match2.team_a_id ? match2.team_b_name : match2.team_a_name;

    // 生成比赛
    const insertQuery = `
      INSERT INTO super_matches (
        super_id, match_number, match_type, stage, best_of,
        group_name, team_a_id, team_b_id, team_a_name, team_b_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    // 季军赛
    await db.query(insertQuery, [
      superId, 27, 'third_place_match', 'championship_stage', 5,
      '季军加赛', loser1Id, loser2Id, loser1Name, loser2Name, 'scheduled'
    ]);

    // 总决赛
    await db.query(insertQuery, [
      superId, 28, 'grand_final', 'championship_stage', 5,
      '总决赛', finalist1Id, finalist2Id, finalist1Name, finalist2Name, 'scheduled'
    ]);

    logger.info(`[SuperService] ✅ 季军赛和总决赛生成完成`);
  }

  /**
   * 检查并完成冠军赛阶段（总决赛和季军赛都完成后）
   */
  private async checkAndCompleteChampionship(superId: number): Promise<void> {
    // 检查总决赛和季军赛是否都完成
    const finalsQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 
        AND stage = 'championship_stage' 
        AND (match_type LIKE '%grand_final%' OR match_type LIKE '%third_place%')
    `;
    const finalsResult = await db.query(finalsQuery, [superId]);

    // 如果还没有生成决赛，直接返回
    if (finalsResult.rows.length !== 2) return;

    // 如果还有未完成的决赛，直接返回
    if (finalsResult.rows.some(m => m.status !== 'completed')) return;

    // 检查是否已经完成（避免重复执行）
    const bracketQuery = `SELECT status FROM super_brackets WHERE id = $1`;
    const bracketResult = await db.query(bracketQuery, [superId]);
    if (bracketResult.rows[0]?.status === 'completed') return;

    logger.info(`[SuperService] 总决赛和季军赛都已完成，设置最终排名`);

    // 使用事务来完成冠军赛阶段
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await this.completeChampionshipStage(superId, client);
      await client.query('COMMIT');
      logger.info(`[SuperService] ✅ Super洲际赛已完成`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 完成冠军赛阶段
   */
  private async completeChampionshipStage(superId: number, client: PoolClient): Promise<void> {
    logger.info(`[SuperService] 完成冠军赛阶段`);

    // 获取最终排名
    const matchesQuery = `
      SELECT * FROM super_matches
      WHERE super_id = $1 AND stage = 'championship_stage'
      ORDER BY match_number DESC
    `;
    const matchesResult = await client.query(matchesQuery, [superId]);

    // 从总决赛和季军赛确定最终排名
    const grandFinal = matchesResult.rows.find(m => m.match_type === 'grand_final');
    const thirdPlaceMatch = matchesResult.rows.find(m => m.match_type === 'third_place_match');

    const champion = { teamId: grandFinal.winner_id, teamName: grandFinal.winner_name };
    const runnerUp = { 
      teamId: grandFinal.winner_id === grandFinal.team_a_id ? grandFinal.team_b_id : grandFinal.team_a_id,
      teamName: grandFinal.winner_id === grandFinal.team_a_id ? grandFinal.team_b_name : grandFinal.team_a_name
    };
    const thirdPlace = { teamId: thirdPlaceMatch.winner_id, teamName: thirdPlaceMatch.winner_name };
    const fourthPlace = { 
      teamId: thirdPlaceMatch.winner_id === thirdPlaceMatch.team_a_id ? thirdPlaceMatch.team_b_id : thirdPlaceMatch.team_a_id,
      teamName: thirdPlaceMatch.winner_id === thirdPlaceMatch.team_a_id ? thirdPlaceMatch.team_b_name : thirdPlaceMatch.team_a_name
    };

    await client.query(`
      UPDATE super_brackets
      SET champion = $1, runner_up = $2, third_place = $3, fourth_place = $4, status = 'completed'
      WHERE id = $5
    `, [JSON.stringify(champion), JSON.stringify(runnerUp), JSON.stringify(thirdPlace), JSON.stringify(fourthPlace), superId]);

    logger.info(`[SuperService] Super洲际赛完成！冠军: ${champion.teamName}`);
  }

}

export const superService = new SuperService();

