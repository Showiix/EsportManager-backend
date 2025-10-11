// =================================================================
// 电竞赛事模拟系统 - 战队数据访问层
// =================================================================

import { databaseService } from '../services/DatabaseService';
import { Team, CreateTeamDto, UpdateTeamDto, QueryOptions } from '../types';
import { logger } from '../utils/logger';

export class TeamRepository {
  // 创建战队
  async create(teamData: CreateTeamDto): Promise<Team> {
    const query = `
      INSERT INTO teams (name, short_name, region_id, power_rating, founded_date, logo_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await databaseService.query<Team>(query, [
      teamData.name,
      teamData.shortName,
      teamData.regionId,
      teamData.powerRating,
      teamData.foundedDate,
      teamData.logoUrl
    ]);

    logger.info('Team created:', { teamId: result.rows[0].id, name: teamData.name });
    return result.rows[0];
  }

  // 根据ID获取战队
  async findById(id: string, options?: QueryOptions): Promise<Team | null> {
    const query = `
      SELECT t.*, r.name as region_name, r.code as region_code
      FROM teams t
      LEFT JOIN regions r ON t.region_id = r.id
      WHERE t.id = $1
    `;

    const result = await databaseService.query<Team & { region_name?: string; region_code?: string }>(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const team = result.rows[0];

    // 如果包含关联数据
    if (options?.include?.includes('region') && team.region_name) {
      team.region = {
        id: team.regionId,
        name: team.region_name,
        code: team.region_code
      } as any;
    }

    return team;
  }

  // 获取所有战队
  async findAll(options?: QueryOptions): Promise<Team[]> {
    let query = `
      SELECT t.*, r.name as region_name, r.code as region_code
      FROM teams t
      LEFT JOIN regions r ON t.region_id = r.id
      WHERE t.is_active = true
    `;

    const params: any[] = [];

    // 添加过滤条件
    if (options?.filter) {
      const filters = [];
      let paramIndex = 1;

      if (options.filter.regionId) {
        filters.push(`t.region_id = $${paramIndex}`);
        params.push(options.filter.regionId);
        paramIndex++;
      }

      if (options.filter.powerRatingMin) {
        filters.push(`t.power_rating >= $${paramIndex}`);
        params.push(options.filter.powerRatingMin);
        paramIndex++;
      }

      if (options.filter.powerRatingMax) {
        filters.push(`t.power_rating <= $${paramIndex}`);
        params.push(options.filter.powerRatingMax);
        paramIndex++;
      }

      if (filters.length > 0) {
        query += ` AND ${filters.join(' AND ')}`;
      }
    }

    // 添加排序
    if (options?.pagination?.sortBy) {
      // 字段映射：前端使用 strength，后端数据库使用 power_rating
      const fieldMap: Record<string, string> = {
        'strength': 'power_rating',
        'powerRating': 'power_rating',
        'name': 'name',
        'foundedDate': 'founded_date',
        'createdAt': 'created_at'
      };

      const sortBy = fieldMap[options.pagination.sortBy] || options.pagination.sortBy;
      const sortOrder = options.pagination.sortOrder || 'asc';
      query += ` ORDER BY t.${sortBy} ${sortOrder}`;
    } else {
      query += ` ORDER BY t.power_rating DESC`;
    }

    // 添加分页
    if (options?.pagination) {
      const limit = options.pagination.limit || 10;
      const page = options.pagination.page || 1;
      const offset = (page - 1) * limit;

      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }

    const result = await databaseService.query<Team>(query, params);
    return result.rows;
  }

  // 根据赛区获取战队
  async findByRegion(regionId: string): Promise<Team[]> {
    const query = `
      SELECT t.*, r.name as region_name, r.code as region_code
      FROM teams t
      JOIN regions r ON t.region_id = r.id
      WHERE t.region_id = $1 AND t.is_active = true
      ORDER BY t.power_rating DESC
    `;

    const result = await databaseService.query<Team>(query, [regionId]);
    return result.rows;
  }

  // 更新战队
  async update(id: string, updateData: UpdateTeamDto): Promise<Team | null> {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${dbKey} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    });

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `
      UPDATE teams
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await databaseService.query<Team>(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Team updated:', { teamId: id, updates: Object.keys(updateData) });
    return result.rows[0];
  }

  // 删除战队（软删除）
  async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE teams
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Team deleted:', { teamId: id });
      return true;
    }

    return false;
  }

  // 获取战队比赛记录
  async getTeamMatches(teamId: string, limit?: number): Promise<any[]> {
    const query = `
      SELECT
        m.*,
        ta.name as team_a_name,
        ta.short_name as team_a_short,
        tb.name as team_b_name,
        tb.short_name as team_b_short,
        tw.name as winner_name,
        tw.short_name as winner_short,
        c.name as competition_name,
        c.type as competition_type
      FROM matches m
      JOIN teams ta ON m.team_a_id = ta.id
      JOIN teams tb ON m.team_b_id = tb.id
      LEFT JOIN teams tw ON m.winner_id = tw.id
      JOIN competitions c ON m.competition_id = c.id
      WHERE (m.team_a_id = $1 OR m.team_b_id = $1)
      ORDER BY m.completed_at DESC NULLS LAST, m.scheduled_at DESC
      ${limit ? `LIMIT $2` : ''}
    `;

    const params = limit ? [teamId, limit] : [teamId];
    const result = await databaseService.query(query, params);
    return result.rows;
  }

  // 获取战队积分记录
  async getTeamScores(teamId: string, seasonYear?: number): Promise<any[]> {
    let query = `
      SELECT
        sr.*,
        c.name as competition_name,
        c.type as competition_type
      FROM score_records sr
      JOIN competitions c ON sr.competition_id = c.id
      WHERE sr.team_id = $1
    `;

    const params = [teamId];

    if (seasonYear) {
      query += ` AND sr.season_year = $2`;
      params.push(seasonYear.toString());
    }

    query += ` ORDER BY sr.earned_at DESC`;

    const result = await databaseService.query(query, params);
    return result.rows;
  }

  // 获取战队统计数据
  async getTeamStatistics(teamId: string, seasonYear?: number): Promise<any | null> {
    let query = `
      SELECT ts.*, t.name as team_name, t.short_name
      FROM team_statistics ts
      JOIN teams t ON ts.team_id = t.id
      WHERE ts.team_id = $1
    `;

    const params = [teamId];

    if (seasonYear) {
      query += ` AND ts.season_year = $2`;
      params.push(seasonYear.toString());
    }

    query += ` ORDER BY ts.season_year DESC LIMIT 1`;

    const result = await databaseService.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // 获取战队数量
  async count(options?: QueryOptions): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM teams WHERE is_active = true`;
    const params: any[] = [];

    // 添加过滤条件
    if (options?.filter) {
      const filters = [];
      let paramIndex = 1;

      if (options.filter.regionId) {
        filters.push(`region_id = $${paramIndex}`);
        params.push(options.filter.regionId);
        paramIndex++;
      }

      if (filters.length > 0) {
        query += ` AND ${filters.join(' AND ')}`;
      }
    }

    const result = await databaseService.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count);
  }
}