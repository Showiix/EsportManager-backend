// =================================================================
// 电竞赛事模拟系统 - 积分排名服务
// =================================================================

import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';

// =================================================================
// 类型定义
// =================================================================

// 赛区积分榜项
export interface RegionalStandingItem {
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  regularSeasonPoints: number;
  roundDifferential: number;
  position: number;
  lastUpdated: string;
}

// 赛区积分榜响应
export interface RegionalStandingsResponse {
  regionId: string;
  regionName: string;
  seasonId: string;
  competitionType: 'spring' | 'summer';
  standings: RegionalStandingItem[];
  lastUpdated: string;
}

// 年度积分排名项
export interface AnnualRankingItem {
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  totalPoints: number;
  springPoints: number;
  summerPoints: number;
  playoffPoints: number;
  msiPoints: number;
  worldsPoints: number;
  intercontinentalPoints: number;
  achievements: string[];
  position: number;
  seasonId: string;
}

// 年度积分排名响应
export interface AnnualRankingsResponse {
  seasonId: string;
  seasonYear: number;
  annualRankings: AnnualRankingItem[];
  lastUpdated: string;
}

// =================================================================
// 积分计算规则常量
// =================================================================

const POINTS_CONFIG = {
  regular: {
    win_2_0: 3,   // 2:0 获胜
    win_2_1: 2,   // 2:1 获胜
    loss_1_2: 1,  // 1:2 失败
    loss_0_2: 0,  // 0:2 失败
  },
  playoffs: {
    champion: 50,       // 冠军
    runnerUp: 35,       // 亚军
    semifinal: 25,      // 半决赛（3-4名）
    quarterfinal: 15,   // 四分之一决赛（5-8名）
  },
  msi: {
    champion: 100,
    runnerUp: 80,
    semifinal: 60,
    groupStage: 20,
  },
  worlds: {
    champion: 150,
    runnerUp: 120,
    semifinal: 90,
    quarterfinal: 60,
    groupStage: 30,
  },
  intercontinental: {
    champion: 0,      // 洲际赛不计入年度积分
    runnerUp: 0,
    semifinal: 0,
    groupStage: 0,
  },
};

// =================================================================
// RankingService 类
// =================================================================

export class RankingService {
  constructor() {
    // Constructor intentionally left empty
  }

  // =================================================================
  // 核心积分计算方法
  // =================================================================

  /**
   * 计算常规赛积分
   * @param homeScore 主队得分 (0-2)
   * @param awayScore 客队得分 (0-2)
   * @returns 主队和客队的积分
   */
  calculateRegularPoints(
    homeScore: number,
    awayScore: number
  ): { homePoints: number; awayPoints: number } {
    if (homeScore === 2 && awayScore === 0) {
      return { homePoints: 3, awayPoints: 0 };
    }
    if (homeScore === 2 && awayScore === 1) {
      return { homePoints: 2, awayPoints: 1 };
    }
    if (homeScore === 1 && awayScore === 2) {
      return { homePoints: 1, awayPoints: 2 };
    }
    if (homeScore === 0 && awayScore === 2) {
      return { homePoints: 0, awayPoints: 3 };
    }
    return { homePoints: 0, awayPoints: 0 };
  }

  /**
   * 计算季后赛积分
   * @param position 名次 (1-8)
   * @returns 获得的积分
   */
  calculatePlayoffPoints(position: number): number {
    if (position === 1) return POINTS_CONFIG.playoffs.champion;
    if (position === 2) return POINTS_CONFIG.playoffs.runnerUp;
    if (position >= 3 && position <= 4) return POINTS_CONFIG.playoffs.semifinal;
    if (position >= 5 && position <= 8) return POINTS_CONFIG.playoffs.quarterfinal;
    return 0;
  }

  /**
   * 计算国际赛事积分
   * @param competitionType 赛事类型
   * @param position 名次
   * @returns 获得的积分
   */
  calculateInternationalPoints(competitionType: 'msi' | 'worlds' | 'intercontinental', position: number): number {
    const config = POINTS_CONFIG[competitionType];

    if (position === 1) return config.champion;
    if (position === 2) return config.runnerUp;
    if (position >= 3 && position <= 4) return config.semifinal;
    return config.groupStage;
  }

  // =================================================================
  // 赛区积分榜相关方法
  // =================================================================

  /**
   * 获取赛区常规赛积分榜
   * @param regionId 赛区ID
   * @param seasonId 赛季ID
   * @param type 赛事类型 (spring/summer)
   * @returns 赛区积分榜
   */
  async getRegionalStandings(
    regionId: string,
    seasonId: string,
    type: 'spring' | 'summer'
  ): Promise<RegionalStandingsResponse> {
    try {
      // 尝试从缓存获取
      const cacheKey = `regional_standings:${regionId}:${seasonId}:${type}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.info(`Cache hit for regional standings: ${cacheKey}`);
        return JSON.parse(cached);
      }

      // 从数据库查询
      const query = `
        SELECT * FROM v_regional_standings
        WHERE region_id = $1
          AND season_id = $2
          AND competition_type = $3
        ORDER BY position ASC
      `;

      const result = await db.query(query, [regionId, seasonId, type]);

      // 获取赛区信息
      const regionQuery = 'SELECT id, name FROM regions WHERE id = $1';
      const regionResult = await db.query(regionQuery, [regionId]);
      const region = regionResult.rows[0];

      const response: RegionalStandingsResponse = {
        regionId,
        regionName: region?.name || '',
        seasonId,
        competitionType: type,
        standings: result.rows.map((row: any) => ({
          teamId: row.team_id.toString(),
          teamName: row.team_name,
          regionId: row.region_id.toString(),
          regionName: row.region_name,
          matchesPlayed: row.matches_played,
          wins: row.wins,
          losses: row.losses,
          winRate: parseFloat(row.win_rate),
          regularSeasonPoints: row.regular_season_points,
          roundDifferential: row.round_differential,
          position: row.position,
          lastUpdated: row.last_updated,
        })),
        lastUpdated: new Date().toISOString(),
      };

      // 缓存结果（10分钟）
      await redis.set(cacheKey, JSON.stringify(response), 600);

      return response;
    } catch (error) {
      logger.error('Error fetching regional standings:', error);
      throw new Error('Failed to fetch regional standings');
    }
  }

  /**
   * 更新赛区常规赛积分榜
   * @param regionId 赛区ID
   * @param seasonId 赛季ID
   * @param type 赛事类型
   */
  async updateRegionalStandings(
    regionId: string,
    seasonId: string,
    type: 'spring' | 'summer'
  ): Promise<void> {
    try {
      logger.info(`Updating regional standings for region ${regionId}, season ${seasonId}, type ${type}`);

      // 获取该赛区、赛季、类型的赛事
      const competitionQuery = `
        SELECT id FROM competitions
        WHERE season_id = $1
          AND type = $2
          AND status IN ('active', 'completed')
      `;
      const competitionResult = await db.query(competitionQuery, [seasonId, type]);

      if (competitionResult.rows.length === 0) {
        logger.warn('No competition found for the specified parameters');
        return;
      }

      const competitionId = competitionResult.rows[0].id;

      // 获取该赛区的所有队伍
      const teamsQuery = `
        SELECT t.id, t.name
        FROM teams t
        WHERE t.region_id = $1
          AND t.is_active = true
      `;
      const teamsResult = await db.query(teamsQuery, [regionId]);

      // 为每支队伍计算积分
      for (const team of teamsResult.rows) {
        await this.updateTeamStandings(team.id, regionId, seasonId, type, competitionId);
      }

      // 重新计算排名
      await this.recalculatePositions(regionId, seasonId, type);

      // 清除缓存
      const cacheKey = `regional_standings:${regionId}:${seasonId}:${type}`;
      await redis.del(cacheKey);

      logger.info('Regional standings updated successfully');
    } catch (error) {
      logger.error('Error updating regional standings:', error);
      throw new Error('Failed to update regional standings');
    }
  }

  /**
   * 更新单支队伍的积分记录
   */
  private async updateTeamStandings(
    teamId: number,
    regionId: string,
    seasonId: string,
    type: 'spring' | 'summer',
    competitionId: number
  ): Promise<void> {
    // 查询该队伍在该赛事中的所有比赛
    const matchesQuery = `
      SELECT
        m.id,
        m.team_a_id,
        m.team_b_id,
        m.score_a,
        m.score_b,
        m.winner_id,
        m.status
      FROM matches m
      WHERE m.competition_id = $1
        AND (m.team_a_id = $2 OR m.team_b_id = $2)
        AND m.status = 'completed'
        AND m.phase = 'regular_season'
    `;

    const matchesResult = await db.query(matchesQuery, [competitionId, teamId]);

    // 统计数据
    let matchesPlayed = 0;
    let wins = 0;
    let losses = 0;
    let regularSeasonPoints = 0;
    let roundDifferential = 0;

    for (const match of matchesResult.rows) {
      matchesPlayed++;

      const isTeamA = match.team_a_id === teamId;
      const teamScore = isTeamA ? match.score_a : match.score_b;
      const opponentScore = isTeamA ? match.score_b : match.score_a;

      // 计算胜负
      if (match.winner_id === teamId) {
        wins++;
      } else {
        losses++;
      }

      // 计算积分 - 始终传入(score_a, score_b)，然后根据队伍身份取对应的积分
      const points = this.calculateRegularPoints(match.score_a, match.score_b);
      regularSeasonPoints += isTeamA ? points.homePoints : points.awayPoints;

      // 计算小场分差
      roundDifferential += teamScore - opponentScore;
    }

    // 计算胜率
    const winRate = matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0;

    // 插入或更新积分榜记录
    const upsertQuery = `
      INSERT INTO regional_standings (
        team_id, region_id, season_id, competition_type,
        matches_played, wins, losses, win_rate,
        regular_season_points, round_differential, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      ON CONFLICT (team_id, region_id, season_id, competition_type)
      DO UPDATE SET
        matches_played = $5,
        wins = $6,
        losses = $7,
        win_rate = $8,
        regular_season_points = $9,
        round_differential = $10,
        last_updated = CURRENT_TIMESTAMP
    `;

    await db.query(upsertQuery, [
      teamId,
      regionId,
      seasonId,
      type,
      matchesPlayed,
      wins,
      losses,
      winRate.toFixed(2),
      regularSeasonPoints,
      roundDifferential,
    ]);
  }

  /**
   * 重新计算排名
   */
  private async recalculatePositions(
    regionId: string,
    seasonId: string,
    type: 'spring' | 'summer'
  ): Promise<void> {
    // 按照积分、胜场、小场分差排序，分配排名
    const query = `
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY
              regular_season_points DESC,
              wins DESC,
              round_differential DESC
          ) as new_position
        FROM regional_standings
        WHERE region_id = $1
          AND season_id = $2
          AND competition_type = $3
      )
      UPDATE regional_standings rs
      SET position = ranked.new_position
      FROM ranked
      WHERE rs.id = ranked.id
    `;

    await db.query(query, [regionId, seasonId, type]);
  }

  // =================================================================
  // 年度积分排名相关方法
  // =================================================================

  /**
   * 获取年度积分排名
   * @param seasonId 赛季ID
   * @returns 年度积分排名
   */
  async getAnnualRankings(seasonId: string): Promise<AnnualRankingsResponse> {
    try {
      // 尝试从缓存获取
      const cacheKey = `annual_rankings:${seasonId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.info(`Cache hit for annual rankings: ${cacheKey}`);
        return JSON.parse(cached);
      }

      // 从数据库查询
      const query = `
        SELECT * FROM v_annual_rankings
        WHERE season_id = $1
        ORDER BY position ASC
      `;

      const result = await db.query(query, [seasonId]);

      // 获取赛季信息
      const seasonQuery = 'SELECT id, name, year FROM seasons WHERE id = $1';
      const seasonResult = await db.query(seasonQuery, [seasonId]);
      const season = seasonResult.rows[0];

      const response: AnnualRankingsResponse = {
        seasonId,
        seasonYear: season?.year || 0,
        annualRankings: result.rows.map((row: any) => ({
          teamId: row.team_id.toString(),
          teamName: row.team_name,
          regionId: row.region_id.toString(),
          regionName: row.region_name,
          totalPoints: row.total_points,
          springPoints: row.spring_points,
          summerPoints: row.summer_points,
          playoffPoints: row.playoff_points,
          msiPoints: row.msi_points,
          worldsPoints: row.worlds_points,
          intercontinentalPoints: row.intercontinental_points,
          achievements: row.achievements || [],
          position: row.position,
          seasonId: row.season_id.toString(),
        })),
        lastUpdated: new Date().toISOString(),
      };

      // 缓存结果（15分钟）
      await redis.set(cacheKey, JSON.stringify(response), 900);

      return response;
    } catch (error) {
      logger.error('Error fetching annual rankings:', error);
      throw new Error('Failed to fetch annual rankings');
    }
  }

  /**
   * 更新年度积分排名
   * @param seasonId 赛季ID
   */
  async updateAnnualRankings(seasonId: string): Promise<void> {
    try {
      logger.info(`Updating annual rankings for season ${seasonId}`);

      // 获取该赛季的所有队伍
      const teamsQuery = `
        SELECT DISTINCT t.id
        FROM teams t
        WHERE t.is_active = true
      `;
      const teamsResult = await db.query(teamsQuery);

      // 为每支队伍计算年度积分
      for (const team of teamsResult.rows) {
        await this.updateTeamAnnualRanking(team.id, seasonId);
      }

      // 重新计算全球排名
      await this.recalculateAnnualPositions(seasonId);

      // 清除缓存
      const cacheKey = `annual_rankings:${seasonId}`;
      await redis.del(cacheKey);

      logger.info('Annual rankings updated successfully');
    } catch (error) {
      logger.error('Error updating annual rankings:', error);
      throw new Error('Failed to update annual rankings');
    }
  }

  /**
   * 更新单支队伍的年度积分记录
   */
  private async updateTeamAnnualRanking(teamId: number, seasonId: string): Promise<void> {
    // 获取赛季的年份
    const seasonQuery = `SELECT year FROM seasons WHERE id = $1`;
    const seasonResult = await db.query(seasonQuery, [seasonId]);
    const seasonYear = seasonResult.rows[0]?.year;

    if (!seasonYear) {
      logger.error(`Season ${seasonId} not found`);
      return;
    }

    // 从 score_records 表中汇总该队伍的年度积分
    // 使用 LEFT JOIN 以包含所有积分类型，包括季后赛积分
    const pointsQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN c.type = 'spring' AND sr.point_type = 'regular' THEN sr.points ELSE 0 END), 0) as spring_points,
        COALESCE(SUM(CASE WHEN c.type = 'summer' AND sr.point_type = 'regular' THEN sr.points ELSE 0 END), 0) as summer_points,
        COALESCE(SUM(CASE WHEN sr.point_type IN ('playoff', 'spring_playoff', 'summer_playoff') THEN sr.points ELSE 0 END), 0) as playoff_points,
        COALESCE(SUM(CASE WHEN sr.point_type = 'msi' THEN sr.points ELSE 0 END), 0) as msi_points,
        COALESCE(SUM(CASE WHEN sr.point_type = 'worlds' THEN sr.points ELSE 0 END), 0) as worlds_points,
        COALESCE(SUM(CASE WHEN sr.point_type = 'intercontinental' THEN sr.points ELSE 0 END), 0) as intercontinental_points
      FROM score_records sr
      LEFT JOIN competitions c ON sr.competition_id = c.id
      WHERE sr.team_id = $1
        AND sr.season_year = $2
    `;

    const pointsResult = await db.query(pointsQuery, [teamId, seasonYear]);
    const points = pointsResult.rows[0];

    // 计算总积分（包含洲际赛）
    const totalPoints =
      parseInt(points.spring_points) +
      parseInt(points.summer_points) +
      parseInt(points.playoff_points) +
      parseInt(points.msi_points) +
      parseInt(points.worlds_points) +
      parseInt(points.intercontinental_points);

    // 获取成就列表
    const achievements = await this.getTeamAchievements(teamId, seasonId);

    // 插入或更新年度积分记录
    const upsertQuery = `
      INSERT INTO annual_rankings (
        team_id, season_id,
        total_points, spring_points, summer_points, playoff_points,
        msi_points, worlds_points, intercontinental_points,
        achievements, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      ON CONFLICT (team_id, season_id)
      DO UPDATE SET
        total_points = $3,
        spring_points = $4,
        summer_points = $5,
        playoff_points = $6,
        msi_points = $7,
        worlds_points = $8,
        intercontinental_points = $9,
        achievements = $10,
        last_updated = CURRENT_TIMESTAMP
    `;

    await db.query(upsertQuery, [
      teamId,
      seasonId,
      totalPoints,
      points.spring_points,
      points.summer_points,
      points.playoff_points,
      points.msi_points,
      points.worlds_points,
      points.intercontinental_points,
      JSON.stringify(achievements),
    ]);
  }

  /**
   * 获取队伍成就列表
   */
  private async getTeamAchievements(teamId: number, seasonId: string): Promise<string[]> {
    const query = `
      SELECT
        c.name as competition_name,
        c.type as competition_type,
        hr.position
      FROM honor_records hr
      JOIN competitions c ON hr.competition_id = c.id
      WHERE hr.team_id = $1
        AND hr.season_id = $2
        AND hr.position <= 3
      ORDER BY hr.position, c.type
    `;

    const result = await db.query(query, [teamId, seasonId]);

    return result.rows.map((row: any) => {
      const positionName = row.position === 1 ? '冠军' : row.position === 2 ? '亚军' : '季军';
      return `${row.competition_name}${positionName}`;
    });
  }

  /**
   * 重新计算年度排名
   */
  private async recalculateAnnualPositions(seasonId: string): Promise<void> {
    const query = `
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY total_points DESC
          ) as new_position
        FROM annual_rankings
        WHERE season_id = $1
      )
      UPDATE annual_rankings ar
      SET position = ranked.new_position
      FROM ranked
      WHERE ar.id = ranked.id
    `;

    await db.query(query, [seasonId]);
  }

  // =================================================================
  // 批量刷新方法
  // =================================================================

  /**
   * 刷新所有排名数据
   * @param seasonId 赛季ID
   */
  async refreshAllRankings(seasonId: string): Promise<void> {
    logger.info(`Refreshing all rankings for season ${seasonId}`);

    // 获取所有赛区
    const regionsQuery = 'SELECT id FROM regions WHERE is_active = true';
    const regionsResult = await db.query(regionsQuery);

    // 刷新所有赛区的春季赛和夏季赛积分榜
    for (const region of regionsResult.rows) {
      await this.updateRegionalStandings(region.id.toString(), seasonId, 'spring');
      await this.updateRegionalStandings(region.id.toString(), seasonId, 'summer');
    }

    // 刷新年度积分排名
    await this.updateAnnualRankings(seasonId);

    logger.info('All rankings refreshed successfully');
  }
}

// 导出单例
export const rankingService = new RankingService();
