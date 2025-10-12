// =================================================================
// 电竞赛事模拟系统 - 赛事数据访问层
// =================================================================

import { databaseService } from '../services/DatabaseService';
import { Competition, CreateCompetitionDto, QueryOptions, CompetitionType, CompetitionStatus } from '../types';
import { logger } from '../utils/logger';

export class CompetitionRepository {
  // 创建赛事
  async create(competitionData: CreateCompetitionDto): Promise<Competition> {
    const query = `
      INSERT INTO competitions (season_id, type, name, format, scoring_rules, max_teams, start_date, end_date, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await databaseService.query(query, [
      competitionData.seasonId,
      competitionData.type,
      competitionData.name,
      JSON.stringify(competitionData.format),
      JSON.stringify(competitionData.scoringRules),
      competitionData.maxTeams || 40,
      competitionData.startDate,
      competitionData.endDate,
      competitionData.description
    ]);

    logger.info('Competition created:', {
      competitionId: result.rows[0].id,
      name: competitionData.name,
      type: competitionData.type
    });
    return result.rows[0];
  }

  // 根据ID获取赛事
  async findById(id: string, options?: QueryOptions): Promise<Competition | null> {
    const query = `
      SELECT c.*, s.name as season_name, s.year as season_year
      FROM competitions c
      LEFT JOIN seasons s ON c.season_id = s.id
      WHERE c.id = $1
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const competition = result.rows[0];

    // 解析JSON字段（只有当字段是字符串时才解析）
    if (competition.format && typeof competition.format === 'string') {
      try {
        competition.format = JSON.parse(competition.format);
      } catch (e) {
        logger.warn('Failed to parse competition format', {
          competitionId: id,
          format: competition.format
        });
        competition.format = {};
      }
    }
    if (competition.scoring_rules && typeof competition.scoring_rules === 'string') {
      try {
        competition.scoringRules = JSON.parse(competition.scoring_rules);
      } catch (e) {
        logger.warn('Failed to parse competition scoring_rules', {
          competitionId: id,
          scoring_rules: competition.scoring_rules
        });
        competition.scoringRules = {};
      }
    }

    // 如果包含关联数据
    if (options?.include?.includes('season') && competition.season_name) {
      competition.season = {
        id: competition.seasonId,
        name: competition.season_name,
        year: competition.season_year
      } as any;
    }

    return competition;
  }

  // 获取所有赛事
  async findAll(options?: QueryOptions): Promise<Competition[]> {
    let query = `
      SELECT c.*, s.name as season_name, s.year as season_year
      FROM competitions c
      LEFT JOIN seasons s ON c.season_id = s.id
      WHERE 1=1
    `;

    const params: any[] = [];

    // 添加过滤条件
    if (options?.filter) {
      let paramIndex = 1;

      if (options.filter.seasonId) {
        query += ` AND c.season_id = $${paramIndex}`;
        params.push(options.filter.seasonId);
        paramIndex++;
      }

      if (options.filter.type) {
        query += ` AND c.type = $${paramIndex}`;
        params.push(options.filter.type);
        paramIndex++;
      }

      if (options.filter.status) {
        query += ` AND c.status = $${paramIndex}`;
        params.push(options.filter.status);
        paramIndex++;
      }

      if (options.filter.year) {
        query += ` AND s.year = $${paramIndex}`;
        params.push(options.filter.year);
        paramIndex++;
      }
    }

    // 添加排序
    if (options?.pagination?.sortBy) {
      // 字段映射：前端字段名 -> 数据库字段名
      const fieldMap: Record<string, string> = {
        'startDate': 'start_date',
        'endDate': 'end_date',
        'name': 'name',
        'type': 'type',
        'status': 'status',
        'createdAt': 'created_at'
      };

      const sortBy = fieldMap[options.pagination.sortBy] || options.pagination.sortBy;
      const sortOrder = options.pagination.sortOrder || 'asc';
      query += ` ORDER BY c.${sortBy} ${sortOrder}`;
    } else {
      query += ` ORDER BY c.start_date DESC`;
    }

    // 添加分页
    if (options?.pagination) {
      const limit = options.pagination.limit || 10;
      const page = options.pagination.page || 1;
      const offset = (page - 1) * limit;

      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }

    try {
      const result = await databaseService.query(query, params);

      // 解析JSON字段
      return result.rows.map(competition => {
        if (competition.format && typeof competition.format === 'string') {
          try {
            competition.format = JSON.parse(competition.format);
          } catch (e) {
            competition.format = {};
          }
        }
        if (competition.scoring_rules && typeof competition.scoring_rules === 'string') {
          try {
            competition.scoringRules = JSON.parse(competition.scoring_rules);
          } catch (e) {
            competition.scoringRules = {};
          }
        }
        return competition;
      });
    } catch (error) {
      logger.error('Failed to fetch competitions:', { error, query, params });
      throw error;
    }
  }

  // 根据赛季获取赛事
  async findBySeason(seasonId: string): Promise<Competition[]> {
    const query = `
      SELECT c.*, s.name as season_name, s.year as season_year
      FROM competitions c
      JOIN seasons s ON c.season_id = s.id
      WHERE c.season_id = $1
      ORDER BY c.start_date ASC
    `;

    const result = await databaseService.query(query, [seasonId]);

    return result.rows.map(competition => {
      if (competition.format) {
        competition.format = JSON.parse(competition.format);
      }
      if (competition.scoring_rules) {
        competition.scoringRules = JSON.parse(competition.scoring_rules);
      }
      return competition;
    });
  }

  // 根据类型和年份获取赛事
  async findByTypeAndYear(type: CompetitionType, year: number): Promise<Competition[]> {
    const query = `
      SELECT c.*, s.name as season_name, s.year as season_year
      FROM competitions c
      JOIN seasons s ON c.season_id = s.id
      WHERE c.type = $1 AND s.year = $2
      ORDER BY c.start_date ASC
    `;

    const result = await databaseService.query(query, [type, year]);

    return result.rows.map(competition => {
      if (competition.format) {
        competition.format = JSON.parse(competition.format);
      }
      if (competition.scoring_rules) {
        competition.scoringRules = JSON.parse(competition.scoring_rules);
      }
      return competition;
    });
  }

  // 更新赛事状态
  async updateStatus(id: string, status: CompetitionStatus): Promise<Competition | null> {
    const query = `
      UPDATE competitions
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await databaseService.query(query, [status, id]);

    if (result.rows.length === 0) {
      return null;
    }

    const competition = result.rows[0];

    // 解析JSON字段（只有当字段是字符串时才解析）
    if (competition.format && typeof competition.format === 'string') {
      try {
        competition.format = JSON.parse(competition.format);
      } catch (e) {
        logger.warn('Failed to parse competition format in updateStatus', {
          competitionId: id,
          format: competition.format
        });
        competition.format = {};
      }
    }
    if (competition.scoring_rules && typeof competition.scoring_rules === 'string') {
      try {
        competition.scoringRules = JSON.parse(competition.scoring_rules);
      } catch (e) {
        logger.warn('Failed to parse competition scoring_rules in updateStatus', {
          competitionId: id,
          scoring_rules: competition.scoring_rules
        });
        competition.scoringRules = {};
      }
    }

    logger.info('Competition status updated:', { competitionId: id, status });
    return competition;
  }

  // 获取活跃赛事
  async findActive(): Promise<Competition[]> {
    const query = `
      SELECT c.*, s.name as season_name, s.year as season_year
      FROM competitions c
      JOIN seasons s ON c.season_id = s.id
      WHERE c.status = 'active'
      ORDER BY c.start_date ASC
    `;

    const result = await databaseService.query(query);

    return result.rows.map(competition => {
      if (competition.format) {
        competition.format = JSON.parse(competition.format);
      }
      if (competition.scoring_rules) {
        competition.scoringRules = JSON.parse(competition.scoring_rules);
      }
      return competition;
    });
  }

  // 获取即将开始的赛事
  async findUpcoming(limit?: number): Promise<Competition[]> {
    let query = `
      SELECT c.*, s.name as season_name, s.year as season_year
      FROM competitions c
      JOIN seasons s ON c.season_id = s.id
      WHERE c.status = 'planning' AND c.start_date > CURRENT_DATE
      ORDER BY c.start_date ASC
    `;

    if (limit) {
      query += ` LIMIT $1`;
    }

    const params = limit ? [limit] : [];
    const result = await databaseService.query(query, params);

    return result.rows.map(competition => {
      if (competition.format) {
        competition.format = JSON.parse(competition.format);
      }
      if (competition.scoring_rules) {
        competition.scoringRules = JSON.parse(competition.scoring_rules);
      }
      return competition;
    });
  }

  // 获取赛事参赛队伍
  async getCompetitionTeams(competitionId: string): Promise<any[]> {
    const query = `
      SELECT
        ct.*,
        t.id as team_id,
        t.name as team_name,
        t.short_name,
        t.power_rating,
        t.region_id,
        r.id as region_id,
        r.name as region_name,
        r.code as region_code
      FROM competition_teams ct
      JOIN teams t ON ct.team_id = t.id
      JOIN regions r ON t.region_id = r.id
      WHERE ct.competition_id = $1
      ORDER BY ct.seed ASC, t.power_rating DESC
    `;

    const result = await databaseService.query(query, [competitionId]);
    return result.rows;
  }

  // 添加参赛队伍
  async addTeam(competitionId: string, teamId: string, seed?: number, groupName?: string): Promise<void> {
    const query = `
      INSERT INTO competition_teams (competition_id, team_id, seed, group_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (competition_id, team_id) DO UPDATE SET
        seed = EXCLUDED.seed,
        group_name = EXCLUDED.group_name
    `;

    await databaseService.query(query, [competitionId, teamId, seed, groupName]);

    logger.info('Team added to competition:', {
      competitionId,
      teamId,
      seed,
      groupName
    });
  }

  // 移除参赛队伍
  async removeTeam(competitionId: string, teamId: string): Promise<boolean> {
    const query = `
      DELETE FROM competition_teams
      WHERE competition_id = $1 AND team_id = $2
    `;

    const result = await databaseService.query(query, [competitionId, teamId]);

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Team removed from competition:', { competitionId, teamId });
      return true;
    }

    return false;
  }

  // 获取赛事数量
  async count(options?: QueryOptions): Promise<number> {
    let query = `
      SELECT COUNT(*) as count
      FROM competitions c
      LEFT JOIN seasons s ON c.season_id = s.id
      WHERE 1=1
    `;

    const params: any[] = [];

    // 添加过滤条件
    if (options?.filter) {
      let paramIndex = 1;

      if (options.filter.seasonId) {
        query += ` AND c.season_id = $${paramIndex}`;
        params.push(options.filter.seasonId);
        paramIndex++;
      }

      if (options.filter.type) {
        query += ` AND c.type = $${paramIndex}`;
        params.push(options.filter.type);
        paramIndex++;
      }

      if (options.filter.status) {
        query += ` AND c.status = $${paramIndex}`;
        params.push(options.filter.status);
        paramIndex++;
      }
    }

    const result = await databaseService.query(query, params);
    return parseInt(result.rows[0].count);
  }
}