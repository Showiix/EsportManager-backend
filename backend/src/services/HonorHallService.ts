// =================================================================
// 电竞赛事模拟系统 - 荣誉殿堂服务
// =================================================================

import { db } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/utils/logger';

// =================================================================
// 类型定义
// =================================================================

// 队伍成就记录
export interface TeamAchievement {
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  points: number;
  competitionId: string;
  competitionName: string;
  achievementDate: string;
  winRate?: number;
  specialRecord?: string;
}

// 赛区荣誉记录
export interface RegionalHonor {
  regionId: string;
  regionName: string;
  competitionType: 'spring' | 'summer';
  champion: TeamAchievement | null;
  runnerUp: TeamAchievement | null;
  thirdPlace: TeamAchievement | null;
}

// 全球赛事荣誉
export interface GlobalHonor {
  competitionId: string;
  competitionName: string;
  competitionType: 'msi' | 'worlds' | 'intercontinental';
  champion: TeamAchievement | null;
  runnerUp: TeamAchievement | null;
  thirdPlace: TeamAchievement | null;
  fourthPlace: TeamAchievement | null;
  participants: TeamAchievement[];
}

// 积分排名
export interface PointsRanking {
  rank: number;
  teamId: string;
  teamName: string;
  regionId: string;
  regionName: string;
  totalPoints: number;
  competitionsCount: number;
  achievements: string[];
}

// 赛季荣誉数据
export interface SeasonHonorData {
  seasonId: string;
  seasonYear: number;
  regionalHonors: {
    spring: RegionalHonor[];
    summer: RegionalHonor[];
  };
  globalHonors: {
    msi: GlobalHonor | null;
    worlds: GlobalHonor | null;
  };
  intercontinentalHonors: GlobalHonor | null;
  annualRankings: {
    topThree: PointsRanking[];
    regionalTop: PointsRanking[][];
  };
  statistics: {
    totalCompetitions: number;
    totalMatches: number;
    dominantRegion: string;
    breakoutTeam: string;
  };
}

// =================================================================
// HonorHallService 类
// =================================================================

export class HonorHallService {
  constructor() {
    // Constructor intentionally left empty
  }

  // =================================================================
  // 获取可用赛季列表
  // =================================================================

  /**
   * 获取所有可用的赛季列表
   * @returns 赛季列表
   */
  async getAvailableSeasons(): Promise<any[]> {
    try {
      // 尝试从缓存获取
      const cacheKey = 'honor_hall:seasons';
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.info('Cache hit for available seasons');
        return JSON.parse(cached);
      }

      // 从数据库查询
      const query = `
        SELECT id, name, year, status
        FROM seasons
        WHERE status IN ('active', 'completed')
        ORDER BY year DESC
      `;

      const result = await db.query(query);

      const seasons = result.rows.map((row: any) => ({
        id: row.id.toString(),
        name: row.name,
        year: row.year,
        status: row.status,
      }));

      // 缓存结果（30分钟）
      await redis.set(cacheKey, JSON.stringify(seasons), 1800);

      return seasons;
    } catch (error) {
      logger.error('Error fetching available seasons:', error);
      throw new Error('Failed to fetch available seasons');
    }
  }

  // =================================================================
  // 获取赛季荣誉数据
  // =================================================================

  /**
   * 获取指定赛季的完整荣誉数据
   * @param seasonId 赛季ID
   * @returns 赛季荣誉数据
   */
  async getSeasonHonorData(seasonId: string): Promise<SeasonHonorData> {
    try {
      // 尝试从缓存获取
      const cacheKey = `honor_hall:season:${seasonId}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        logger.info(`Cache hit for season honor data: ${seasonId}`);
        return JSON.parse(cached);
      }

      logger.info(`Calculating honor data for season ${seasonId}`);

      // 获取赛季信息
      const seasonQuery = 'SELECT id, name, year FROM seasons WHERE id = $1';
      const seasonResult = await db.query(seasonQuery, [seasonId]);
      const season = seasonResult.rows[0];

      if (!season) {
        throw new Error('Season not found');
      }

      // 并行获取各类荣誉数据
      const [regionalHonors, globalHonors, intercontinentalHonors, annualRankings, statistics] =
        await Promise.all([
          this.calculateRegionalHonors(seasonId),
          this.calculateGlobalHonors(seasonId),
          this.calculateIntercontinentalHonors(seasonId),
          this.calculateAnnualRankings(seasonId),
          this.calculateSeasonStatistics(seasonId),
        ]);

      const honorData: SeasonHonorData = {
        seasonId,
        seasonYear: season.year,
        regionalHonors,
        globalHonors,
        intercontinentalHonors,
        annualRankings,
        statistics,
      };

      // 缓存结果（15分钟）
      await redis.set(cacheKey, JSON.stringify(honorData), 900);

      return honorData;
    } catch (error) {
      logger.error('Error fetching season honor data:', error);
      throw new Error('Failed to fetch season honor data');
    }
  }

  // =================================================================
  // 计算赛区荣誉
  // =================================================================

  /**
   * 计算赛区春季赛和夏季赛的冠亚季军
   */
  private async calculateRegionalHonors(seasonId: string): Promise<{
    spring: RegionalHonor[];
    summer: RegionalHonor[];
  }> {
    const springHonors: RegionalHonor[] = [];
    const summerHonors: RegionalHonor[] = [];

    // 获取所有赛区
    const regionsQuery = 'SELECT id, name FROM regions WHERE is_active = true ORDER BY display_order';
    const regionsResult = await db.query(regionsQuery);

    for (const region of regionsResult.rows) {
      // 春季赛荣誉
      const springHonor = await this.calculateRegionSeasonHonor(
        seasonId,
        region.id.toString(),
        region.name,
        'spring'
      );
      if (springHonor) {
        springHonors.push(springHonor);
      }

      // 夏季赛荣誉
      const summerHonor = await this.calculateRegionSeasonHonor(
        seasonId,
        region.id.toString(),
        region.name,
        'summer'
      );
      if (summerHonor) {
        summerHonors.push(summerHonor);
      }
    }

    return { spring: springHonors, summer: summerHonors };
  }

  /**
   * 计算单个赛区单个赛季的荣誉
   */
  private async calculateRegionSeasonHonor(
    seasonId: string,
    regionId: string,
    regionName: string,
    type: 'spring' | 'summer'
  ): Promise<RegionalHonor | null> {
    // 查找该赛区该赛季的季后赛赛事
    const competitionQuery = `
      SELECT c.id, c.name
      FROM competitions c
      WHERE c.season_id = $1
        AND c.type = $2
        AND c.format->>'type' = 'playoffs'
        AND c.status = 'completed'
      LIMIT 1
    `;

    const competitionResult = await db.query(competitionQuery, [seasonId, type]);

    if (competitionResult.rows.length === 0) {
      return null;
    }

    const competition = competitionResult.rows[0];

    // 从honor_records表获取冠亚季军
    const honorsQuery = `
      SELECT
        hr.position,
        hr.team_id,
        t.name as team_name,
        t.region_id,
        r.name as region_name,
        hr.points,
        hr.competition_id,
        c.name as competition_name,
        hr.achievement_date,
        hr.special_record
      FROM honor_records hr
      JOIN teams t ON hr.team_id = t.id
      JOIN regions r ON t.region_id = r.id
      JOIN competitions c ON hr.competition_id = c.id
      WHERE hr.competition_id = $1
        AND t.region_id = $2
        AND hr.position <= 3
      ORDER BY hr.position
    `;

    const honorsResult = await db.query(honorsQuery, [competition.id, regionId]);

    const champion = honorsResult.rows.find((r: any) => r.position === 1);
    const runnerUp = honorsResult.rows.find((r: any) => r.position === 2);
    const thirdPlace = honorsResult.rows.find((r: any) => r.position === 3);

    return {
      regionId,
      regionName,
      competitionType: type,
      champion: champion ? this.mapToTeamAchievement(champion) : null,
      runnerUp: runnerUp ? this.mapToTeamAchievement(runnerUp) : null,
      thirdPlace: thirdPlace ? this.mapToTeamAchievement(thirdPlace) : null,
    };
  }

  // =================================================================
  // 计算全球赛事荣誉
  // =================================================================

  /**
   * 计算MSI和世界赛的荣誉
   */
  private async calculateGlobalHonors(seasonId: string): Promise<{
    msi: GlobalHonor | null;
    worlds: GlobalHonor | null;
  }> {
    const msi = await this.calculateGlobalCompetitionHonor(seasonId, 'msi');
    const worlds = await this.calculateGlobalCompetitionHonor(seasonId, 'worlds');

    return { msi, worlds };
  }

  /**
   * 计算洲际赛荣誉
   */
  private async calculateIntercontinentalHonors(seasonId: string): Promise<GlobalHonor | null> {
    return this.calculateGlobalCompetitionHonor(seasonId, 'intercontinental');
  }

  /**
   * 计算单个全球赛事的荣誉
   */
  private async calculateGlobalCompetitionHonor(
    seasonId: string,
    type: 'msi' | 'worlds' | 'intercontinental'
  ): Promise<GlobalHonor | null> {
    // 查找该赛季的赛事
    const competitionQuery = `
      SELECT id, name, type
      FROM competitions
      WHERE season_id = $1
        AND type = $2
        AND status = 'completed'
      LIMIT 1
    `;

    const competitionResult = await db.query(competitionQuery, [seasonId, type]);

    if (competitionResult.rows.length === 0) {
      return null;
    }

    const competition = competitionResult.rows[0];

    // 获取所有荣誉记录
    const honorsQuery = `
      SELECT
        hr.position,
        hr.team_id,
        t.name as team_name,
        t.region_id,
        r.name as region_name,
        hr.points,
        hr.competition_id,
        c.name as competition_name,
        hr.achievement_date,
        hr.special_record
      FROM honor_records hr
      JOIN teams t ON hr.team_id = t.id
      JOIN regions r ON t.region_id = r.id
      JOIN competitions c ON hr.competition_id = c.id
      WHERE hr.competition_id = $1
      ORDER BY hr.position
    `;

    const honorsResult = await db.query(honorsQuery, [competition.id]);

    const champion = honorsResult.rows.find((r: any) => r.position === 1);
    const runnerUp = honorsResult.rows.find((r: any) => r.position === 2);
    const thirdPlace = honorsResult.rows.find((r: any) => r.position === 3);
    const fourthPlace = honorsResult.rows.find((r: any) => r.position === 4);

    const participants = honorsResult.rows.map((r: any) => this.mapToTeamAchievement(r));

    return {
      competitionId: competition.id.toString(),
      competitionName: competition.name,
      competitionType: type,
      champion: champion ? this.mapToTeamAchievement(champion) : null,
      runnerUp: runnerUp ? this.mapToTeamAchievement(runnerUp) : null,
      thirdPlace: thirdPlace ? this.mapToTeamAchievement(thirdPlace) : null,
      fourthPlace: fourthPlace ? this.mapToTeamAchievement(fourthPlace) : null,
      participants,
    };
  }

  // =================================================================
  // 计算年度积分排名
  // =================================================================

  /**
   * 计算年度积分前三和各赛区前列
   */
  private async calculateAnnualRankings(seasonId: string): Promise<{
    topThree: PointsRanking[];
    regionalTop: PointsRanking[][];
  }> {
    // 获取全球前三
    const topThreeQuery = `
      SELECT
        ar.position,
        ar.team_id,
        t.name as team_name,
        t.region_id,
        r.name as region_name,
        ar.total_points,
        ar.achievements
      FROM annual_rankings ar
      JOIN teams t ON ar.team_id = t.id
      JOIN regions r ON t.region_id = r.id
      WHERE ar.season_id = $1
      ORDER BY ar.position
      LIMIT 3
    `;

    const topThreeResult = await db.query(topThreeQuery, [seasonId]);

    const topThree: PointsRanking[] = topThreeResult.rows.map((row: any, index: number) => ({
      rank: index + 1,
      teamId: row.team_id.toString(),
      teamName: row.team_name,
      regionId: row.region_id.toString(),
      regionName: row.region_name,
      totalPoints: row.total_points,
      competitionsCount: 0, // 可以后续计算
      achievements: row.achievements || [],
    }));

    // 获取各赛区的前列队伍
    const regionalTopQuery = `
      SELECT
        ar.team_id,
        t.name as team_name,
        t.region_id,
        r.name as region_name,
        ar.total_points,
        ar.achievements,
        ROW_NUMBER() OVER (PARTITION BY t.region_id ORDER BY ar.total_points DESC) as region_rank
      FROM annual_rankings ar
      JOIN teams t ON ar.team_id = t.id
      JOIN regions r ON t.region_id = r.id
      WHERE ar.season_id = $1
      ORDER BY t.region_id, ar.total_points DESC
    `;

    const regionalTopResult = await db.query(regionalTopQuery, [seasonId]);

    // 按赛区分组
    const regionalTopMap = new Map<string, PointsRanking[]>();

    for (const row of regionalTopResult.rows) {
      if (!regionalTopMap.has(row.region_id.toString())) {
        regionalTopMap.set(row.region_id.toString(), []);
      }

      if (row.region_rank <= 5) {
        // 只取前5名
        regionalTopMap.get(row.region_id.toString())!.push({
          rank: row.region_rank,
          teamId: row.team_id.toString(),
          teamName: row.team_name,
          regionId: row.region_id.toString(),
          regionName: row.region_name,
          totalPoints: row.total_points,
          competitionsCount: 0,
          achievements: row.achievements || [],
        });
      }
    }

    const regionalTop = Array.from(regionalTopMap.values());

    return { topThree, regionalTop };
  }

  // =================================================================
  // 计算赛季统计
  // =================================================================

  /**
   * 计算赛季统计数据
   */
  private async calculateSeasonStatistics(seasonId: string): Promise<{
    totalCompetitions: number;
    totalMatches: number;
    dominantRegion: string;
    breakoutTeam: string;
  }> {
    // 统计赛事数量
    const competitionsQuery = `
      SELECT COUNT(*) as total
      FROM competitions
      WHERE season_id = $1
        AND status = 'completed'
    `;
    const competitionsResult = await db.query(competitionsQuery, [seasonId]);
    const totalCompetitions = parseInt(competitionsResult.rows[0].total);

    // 统计比赛数量
    const matchesQuery = `
      SELECT COUNT(*) as total
      FROM matches m
      JOIN competitions c ON m.competition_id = c.id
      WHERE c.season_id = $1
        AND m.status = 'completed'
    `;
    const matchesResult = await db.query(matchesQuery, [seasonId]);
    const totalMatches = parseInt(matchesResult.rows[0].total);

    // 找出主导赛区（获得冠军最多的赛区）
    const dominantRegionQuery = `
      SELECT
        r.name as region_name,
        COUNT(*) as championships
      FROM honor_records hr
      JOIN teams t ON hr.team_id = t.id
      JOIN regions r ON t.region_id = r.id
      WHERE hr.season_id = $1
        AND hr.position = 1
      GROUP BY r.id, r.name
      ORDER BY championships DESC
      LIMIT 1
    `;
    const dominantRegionResult = await db.query(dominantRegionQuery, [seasonId]);
    const dominantRegion = dominantRegionResult.rows[0]?.region_name || '未知';

    // 找出黑马队伍（积分提升最多的队伍）
    const breakoutTeamQuery = `
      SELECT
        t.name as team_name,
        ar.total_points
      FROM annual_rankings ar
      JOIN teams t ON ar.team_id = t.id
      WHERE ar.season_id = $1
      ORDER BY ar.total_points DESC
      LIMIT 1
    `;
    const breakoutTeamResult = await db.query(breakoutTeamQuery, [seasonId]);
    const breakoutTeam = breakoutTeamResult.rows[0]?.team_name || '未知';

    return {
      totalCompetitions,
      totalMatches,
      dominantRegion,
      breakoutTeam,
    };
  }

  // =================================================================
  // 辅助方法
  // =================================================================

  /**
   * 将数据库行映射为TeamAchievement对象
   */
  private mapToTeamAchievement(row: any): TeamAchievement {
    return {
      teamId: row.team_id.toString(),
      teamName: row.team_name,
      regionId: row.region_id.toString(),
      regionName: row.region_name,
      points: row.points,
      competitionId: row.competition_id.toString(),
      competitionName: row.competition_name,
      achievementDate: row.achievement_date,
      specialRecord: row.special_record,
    };
  }

  // =================================================================
  // 创建荣誉记录
  // =================================================================

  /**
   * 创建或更新荣誉记录
   * @param seasonId 赛季ID
   * @param competitionId 赛事ID
   * @param teamId 队伍ID
   * @param position 名次
   * @param points 积分
   * @param specialRecord 特殊记录
   */
  async createHonorRecord(
    seasonId: string,
    competitionId: string,
    teamId: string,
    position: number,
    points: number,
    specialRecord?: string
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO honor_records (
          season_id, competition_id, team_id, position, points, achievement_date, special_record
        )
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
        ON CONFLICT (competition_id, team_id)
        DO UPDATE SET
          position = $4,
          points = $5,
          achievement_date = CURRENT_TIMESTAMP,
          special_record = $6,
          updated_at = CURRENT_TIMESTAMP
      `;

      await db.query(query, [seasonId, competitionId, teamId, position, points, specialRecord]);

      // 清除相关缓存
      await redis.del(`honor_hall:season:${seasonId}`);

      logger.info(
        `Honor record created/updated for team ${teamId} in competition ${competitionId}`
      );
    } catch (error) {
      logger.error('Error creating honor record:', error);
      throw new Error('Failed to create honor record');
    }
  }

  /**
   * 批量创建赛事荣誉记录
   * @param seasonId 赛季ID
   * @param competitionId 赛事ID
   * @param results 结果数组 [{teamId, position, points}]
   */
  async batchCreateHonorRecords(
    seasonId: string,
    competitionId: string,
    results: Array<{ teamId: string; position: number; points: number; specialRecord?: string }>
  ): Promise<void> {
    try {
      for (const result of results) {
        await this.createHonorRecord(
          seasonId,
          competitionId,
          result.teamId,
          result.position,
          result.points,
          result.specialRecord
        );
      }

      logger.info(`Batch created ${results.length} honor records for competition ${competitionId}`);
    } catch (error) {
      logger.error('Error batch creating honor records:', error);
      throw new Error('Failed to batch create honor records');
    }
  }
}

// 导出单例
export const honorHallService = new HonorHallService();
