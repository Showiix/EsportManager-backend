// =================================================================
// 电竞赛事模拟系统 - 积分管理服务
// =================================================================

import { PoolClient } from 'pg';
import { db } from '@/config/database';
import { logger } from '@/utils/logger';
import { BusinessError, ErrorCodes } from '../types';

export interface TeamPointsBreakdown {
  teamId: number;
  teamName: string;
  seasonYear: number;
  totalPoints: number;
  springPoints: number;
  summerPoints: number;
  springPlayoffPoints: number;
  summerPlayoffPoints: number;
  playoffPoints: number;
  msiPoints: number;
  worldsPoints: number;
  intercontinentalPoints: number;
  pointDetails: Array<{
    pointType: string;
    points: number;
    earnedAt: string;
    description: string;
  }>;
}

export interface SeasonPointsRanking {
  teamId: number;
  teamName: string;
  regionId: number;
  regionName: string;
  totalPoints: number;
  springPoints: number;
  summerPoints: number;
  playoffPoints: number;
  msiPoints: number;
  worldsPoints: number;
  intercontinentalPoints: number;
  rank: number;
}

export class PointsService {
  /**
   * 获取战队在指定赛季的积分详情
   */
  async getTeamPointsBreakdown(teamId: string, seasonYear: number): Promise<TeamPointsBreakdown> {
    try {
      const query = `SELECT * FROM get_team_points_breakdown($1, $2)`;
      const result = await db.query(query, [teamId, seasonYear]);

      if (result.rows.length === 0) {
        // 如果没有积分记录，返回空数据
        const teamQuery = `SELECT id, name FROM teams WHERE id = $1`;
        const teamResult = await db.query(teamQuery, [teamId]);
        
        if (teamResult.rows.length === 0) {
          throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, '战队不存在');
        }

        return {
          teamId: parseInt(teamId),
          teamName: teamResult.rows[0].name,
          seasonYear,
          totalPoints: 0,
          springPoints: 0,
          summerPoints: 0,
          springPlayoffPoints: 0,
          summerPlayoffPoints: 0,
          playoffPoints: 0,
          msiPoints: 0,
          worldsPoints: 0,
          intercontinentalPoints: 0,
          pointDetails: []
        };
      }

      const data = result.rows[0];
      return {
        teamId: data.team_id,
        teamName: data.team_name,
        seasonYear: data.season_year,
        totalPoints: data.total_points || 0,
        springPoints: data.spring_points || 0,
        summerPoints: data.summer_points || 0,
        springPlayoffPoints: data.spring_playoff_points || 0,
        summerPlayoffPoints: data.summer_playoff_points || 0,
        playoffPoints: data.playoff_points || 0,
        msiPoints: data.msi_points || 0,
        worldsPoints: data.worlds_points || 0,
        intercontinentalPoints: data.intercontinental_points || 0,
        pointDetails: data.point_details || []
      };
    } catch (error: any) {
      logger.error('获取战队积分详情失败', { error: error.message, teamId, seasonYear });
      
      if (error instanceof BusinessError) {
        throw error;
      }
      
      throw new BusinessError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        '获取战队积分详情失败',
        error.message
      );
    }
  }

  /**
   * 获取赛季积分排名
   */
  async getSeasonPointsRanking(seasonYear: number): Promise<SeasonPointsRanking[]> {
    try {
      const query = `
        SELECT 
          ts.team_id,
          t.name as team_name,
          t.region_id,
          r.name as region_name,
          ts.total_points,
          ts.spring_points,
          ts.summer_points,
          ts.playoff_points,
          ts.msi_points,
          ts.worlds_points,
          ts.intercontinental_points,
          ROW_NUMBER() OVER (ORDER BY ts.total_points DESC, ts.team_id) as rank
        FROM team_statistics ts
        JOIN teams t ON ts.team_id = t.id
        JOIN regions r ON t.region_id = r.id
        WHERE ts.season_year = $1
        ORDER BY ts.total_points DESC, ts.team_id
      `;
      
      const result = await db.query(query, [seasonYear]);

      return result.rows.map(row => ({
        teamId: row.team_id,
        teamName: row.team_name,
        regionId: row.region_id,
        regionName: row.region_name,
        totalPoints: row.total_points || 0,
        springPoints: row.spring_points || 0,
        summerPoints: row.summer_points || 0,
        playoffPoints: row.playoff_points || 0,
        msiPoints: row.msi_points || 0,
        worldsPoints: row.worlds_points || 0,
        intercontinentalPoints: row.intercontinental_points || 0,
        rank: row.rank
      }));
    } catch (error: any) {
      logger.error('获取赛季积分排名失败', { error: error.message, seasonYear });
      throw new BusinessError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        '获取赛季积分排名失败',
        error.message
      );
    }
  }

  /**
   * 重新计算赛季积分
   */
  async recalculateSeasonPoints(seasonYear: number): Promise<any> {
    try {
      const query = `SELECT * FROM recalculate_team_points($1)`;
      const result = await db.query(query, [seasonYear]);

      logger.info('✅ 赛季积分重新计算完成', {
        seasonYear,
        teamsUpdated: result.rows.length
      });

      return {
        seasonYear,
        teamsUpdated: result.rows.length,
        updates: result.rows
      };
    } catch (error: any) {
      logger.error('重新计算赛季积分失败', { error: error.message, seasonYear });
      throw new BusinessError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        '重新计算赛季积分失败',
        error.message
      );
    }
  }

  /**
   * 获取战队积分历史记录
   */
  async getTeamPointsHistory(teamId: string, seasonYear?: number): Promise<any[]> {
    try {
      let query = `
        SELECT 
          sr.id,
          sr.team_id,
          t.name as team_name,
          sr.season_year,
          sr.point_type,
          sr.points,
          sr.earned_at,
          sr.description,
          c.name as competition_name
        FROM score_records sr
        JOIN teams t ON sr.team_id = t.id
        LEFT JOIN competitions c ON sr.competition_id = c.id
        WHERE sr.team_id = $1
      `;
      
      const params: any[] = [teamId];
      
      if (seasonYear) {
        query += ` AND sr.season_year = $2`;
        params.push(seasonYear);
      }
      
      query += ` ORDER BY sr.earned_at DESC`;

      const result = await db.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        teamId: row.team_id,
        teamName: row.team_name,
        seasonYear: row.season_year,
        pointType: row.point_type,
        points: row.points,
        earnedAt: row.earned_at,
        description: row.description,
        competitionName: row.competition_name
      }));
    } catch (error: any) {
      logger.error('获取战队积分历史失败', { error: error.message, teamId, seasonYear });
      throw new BusinessError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        '获取战队积分历史失败',
        error.message
      );
    }
  }

  /**
   * 获取赛区积分排名
   */
  async getRegionPointsRanking(regionId: string, seasonYear: number): Promise<SeasonPointsRanking[]> {
    try {
      const query = `
        SELECT 
          ts.team_id,
          t.name as team_name,
          t.region_id,
          r.name as region_name,
          ts.total_points,
          ts.spring_points,
          ts.summer_points,
          ts.playoff_points,
          ts.msi_points,
          ts.worlds_points,
          ROW_NUMBER() OVER (ORDER BY ts.total_points DESC, ts.team_id) as rank
        FROM team_statistics ts
        JOIN teams t ON ts.team_id = t.id
        JOIN regions r ON t.region_id = r.id
        WHERE ts.season_year = $1 AND t.region_id = $2
        ORDER BY ts.total_points DESC, ts.team_id
      `;
      
      const result = await db.query(query, [seasonYear, regionId]);

      return result.rows.map(row => ({
        teamId: row.team_id,
        teamName: row.team_name,
        regionId: row.region_id,
        regionName: row.region_name,
        totalPoints: row.total_points || 0,
        springPoints: row.spring_points || 0,
        summerPoints: row.summer_points || 0,
        playoffPoints: row.playoff_points || 0,
        msiPoints: row.msi_points || 0,
        worldsPoints: row.worlds_points || 0,
        rank: row.rank
      }));
    } catch (error: any) {
      logger.error('获取赛区积分排名失败', { error: error.message, regionId, seasonYear });
      throw new BusinessError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        '获取赛区积分排名失败',
        error.message
      );
    }
  }

  /**
   * 获取两年积分总和排名（用于Super洲际赛）
   */
  async getTwoYearPointsRanking(season1Year: number, season2Year: number): Promise<any[]> {
    try {
      logger.info(`获取两年积分排名: ${season1Year}-${season2Year}`);

      const query = `
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
          (COALESCE(s1.points, 0) + COALESCE(s2.points, 0)) as total_points,
          ROW_NUMBER() OVER (
            ORDER BY (COALESCE(s1.points, 0) + COALESCE(s2.points, 0)) DESC,
                     COALESCE(s2.points, 0) DESC,
                     COALESCE(s1.points, 0) DESC
          ) as rank
        FROM teams t
        JOIN regions r ON r.id = t.region_id
        LEFT JOIN season1_points s1 ON s1.team_id = t.id
        LEFT JOIN season2_points s2 ON s2.team_id = t.id
        WHERE (COALESCE(s1.points, 0) + COALESCE(s2.points, 0)) > 0
        ORDER BY total_points DESC, season2_points DESC, season1_points DESC
        LIMIT 40
      `;

      const result = await db.query(query, [season1Year, season2Year]);

      return result.rows.map(row => ({
        teamId: row.team_id,
        teamName: row.team_name,
        regionId: row.region_id,
        regionName: row.region_name,
        season1Points: parseInt(row.season1_points) || 0,
        season2Points: parseInt(row.season2_points) || 0,
        totalPoints: parseInt(row.total_points) || 0,
        rank: parseInt(row.rank)
      }));
    } catch (error: any) {
      logger.error('获取两年积分排名失败', { error: error.message, season1Year, season2Year });
      throw new BusinessError(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        '获取两年积分排名失败',
        error.message
      );
    }
  }
}

export const pointsService = new PointsService();

