// =================================================================
// 电竞赛事模拟系统 - 比赛数据访问层
// =================================================================

import { databaseService } from '../services/DatabaseService';
import { Match, UpdateMatchResultDto, QueryOptions, MatchStatus } from '../types';
import { logger } from '../utils/logger';

const snakeToCamel = (value: string): string =>
  value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const camelToSnake = (value: string): string =>
  value.replace(/([A-Z])/g, (_, letter: string) => `_${letter.toLowerCase()}`);

const toCamelCase = <T = any>(input: any): T => {
  if (Array.isArray(input)) {
    return input.map(item => toCamelCase(item)) as T;
  }

  if (input !== null && typeof input === 'object') {
    const result: Record<string, unknown> = {};

    Object.keys(input).forEach(key => {
      const camelKey = snakeToCamel(key);
      result[camelKey] = toCamelCase(input[key]);
    });

    return result as T;
  }

  return input as T;
};

export class MatchRepository {
  // 创建比赛
  async create(matchData: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>): Promise<Match> {
    const query = `
      INSERT INTO matches (
        competition_id, team_a_id, team_b_id, score_a, score_b, winner_id,
        format, phase, round_number, match_number, status, scheduled_at,
        started_at, completed_at, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await databaseService.query(query, [
      matchData.competitionId,
      matchData.teamAId,
      matchData.teamBId,
      matchData.scoreA,
      matchData.scoreB,
      matchData.winnerId,
      matchData.format,
      matchData.phase,
      matchData.roundNumber,
      matchData.matchNumber,
      matchData.status,
      matchData.scheduledAt,
      matchData.startedAt,
      matchData.completedAt,
      matchData.notes
    ]);

    const createdMatch = toCamelCase<Record<string, any>>(result.rows[0]);
    logger.info('Match created:', { matchId: createdMatch.id });
    return createdMatch as Match;
  }

  // 根据ID获取比赛
  async findById(id: string, options?: QueryOptions): Promise<Match | null> {
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
      WHERE m.id = $1
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const rawMatch = toCamelCase<Record<string, any>>(result.rows[0]);
    const match = rawMatch as Match & Record<string, any>;

    // 如果包含关联数据
    if (options?.include?.includes('teams')) {
      match.teamA = {
        id: match.teamAId,
        name: rawMatch.teamAName,
        shortName: rawMatch.teamAShort
      } as any;

      match.teamB = {
        id: match.teamBId,
        name: rawMatch.teamBName,
        shortName: rawMatch.teamBShort
      } as any;

      if (match.winnerId && rawMatch.winnerName) {
        match.winner = {
          id: match.winnerId,
          name: rawMatch.winnerName,
          shortName: rawMatch.winnerShort
        } as any;
      }
    }

    if (options?.include?.includes('competition')) {
      match.competition = {
        id: match.competitionId,
        name: rawMatch.competitionName,
        type: rawMatch.competitionType
      } as any;
    }

    return match;
  }

  // 获取所有比赛
  async findAll(options?: QueryOptions): Promise<Match[]> {
    let query = `
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
      WHERE 1=1
    `;

    const params: any[] = [];

    // 添加过滤条件
    if (options?.filter) {
      let paramIndex = 1;

      if (options.filter.competitionId) {
        query += ` AND m.competition_id = $${paramIndex}`;
        params.push(options.filter.competitionId);
        paramIndex++;
      }

      if (options.filter.teamId) {
        query += ` AND (m.team_a_id = $${paramIndex} OR m.team_b_id = $${paramIndex})`;
        params.push(options.filter.teamId);
        paramIndex++;
      }

      if (options.filter.status) {
        query += ` AND m.status = $${paramIndex}`;
        params.push(options.filter.status);
        paramIndex++;
      }

      if (options.filter.phase) {
        query += ` AND m.phase = $${paramIndex}`;
        params.push(options.filter.phase);
        paramIndex++;
      }

      if (options.filter.dateFrom) {
        query += ` AND m.scheduled_at >= $${paramIndex}`;
        params.push(options.filter.dateFrom);
        paramIndex++;
      }

      if (options.filter.dateTo) {
        query += ` AND m.scheduled_at <= $${paramIndex}`;
        params.push(options.filter.dateTo);
        paramIndex++;
      }
    }

    // 添加排序
    if (options?.pagination?.sortBy) {
      const sortBy = camelToSnake(options.pagination.sortBy);
      const sortOrder = options.pagination.sortOrder || 'asc';
      query += ` ORDER BY m.${sortBy} ${sortOrder}`;
    } else {
      query += ` ORDER BY m.scheduled_at DESC NULLS LAST`;
    }

    // 添加分页
    if (options?.pagination) {
      const limit = options.pagination.limit || 10;
      const page = options.pagination.page || 1;
      const offset = (page - 1) * limit;

      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }

    const result = await databaseService.query(query, params);
    return toCamelCase(result.rows) as Match[];
  }

  // 根据赛事获取比赛
  async findByCompetition(competitionId: string, phase?: string): Promise<Match[]> {
    let query = `
      SELECT
        m.*,
        ta.name as team_a_name,
        ta.short_name as team_a_short,
        tb.name as team_b_name,
        tb.short_name as team_b_short,
        tw.name as winner_name,
        tw.short_name as winner_short
      FROM matches m
      JOIN teams ta ON m.team_a_id = ta.id
      JOIN teams tb ON m.team_b_id = tb.id
      LEFT JOIN teams tw ON m.winner_id = tw.id
      WHERE m.competition_id = $1
    `;

    const params = [competitionId];

    if (phase) {
      query += ` AND m.phase = $2`;
      params.push(phase);
    }

    query += ` ORDER BY m.round_number ASC, m.match_number ASC`;

    const result = await databaseService.query(query, params);
    return toCamelCase(result.rows) as Match[];
  }

  // 根据队伍获取比赛
  async findByTeam(teamId: string, limit?: number): Promise<Match[]> {
    let query = `
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
    `;

    const params = [teamId];

    if (limit) {
      query += ` LIMIT $2`;
      params.push(limit.toString());
    }

    const result = await databaseService.query(query, params);
    return toCamelCase(result.rows) as Match[];
  }

  // 更新比赛结果
  async updateResult(id: string, resultData: UpdateMatchResultDto): Promise<Match | null> {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (resultData.scoreA !== undefined) {
      updates.push(`score_a = $${paramIndex}`);
      params.push(resultData.scoreA);
      paramIndex++;
    }

    if (resultData.scoreB !== undefined) {
      updates.push(`score_b = $${paramIndex}`);
      params.push(resultData.scoreB);
      paramIndex++;
    }

    if (resultData.winnerId !== undefined) {
      updates.push(`winner_id = $${paramIndex}`);
      params.push(resultData.winnerId);
      paramIndex++;
    }

    if (resultData.completedAt !== undefined) {
      updates.push(`completed_at = $${paramIndex}`);
      params.push(resultData.completedAt);
      paramIndex++;
    }

    if (resultData.notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(resultData.notes);
      paramIndex++;
    }

    updates.push(`status = $${paramIndex}`);
    params.push('completed');
    paramIndex++;

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `
      UPDATE matches
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await databaseService.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    const updatedMatch = toCamelCase<Record<string, any>>(result.rows[0]);
    logger.info('Match result updated:', {
      matchId: id,
      scoreA: resultData.scoreA,
      scoreB: resultData.scoreB,
      winnerId: resultData.winnerId
    });

    return updatedMatch as Match;
  }

  // 更新比赛状态
  async updateStatus(id: string, status: MatchStatus): Promise<Match | null> {
    const query = `
      UPDATE matches
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await databaseService.query(query, [status, id]);

    if (result.rows.length === 0) {
      return null;
    }

    const updatedMatch = toCamelCase<Record<string, any>>(result.rows[0]);

    logger.info('Match status updated:', { matchId: id, status });
    return updatedMatch as Match;
  }

  // 获取即将进行的比赛
  async findUpcoming(limit?: number): Promise<Match[]> {
    let query = `
      SELECT
        m.*,
        ta.name as team_a_name,
        ta.short_name as team_a_short,
        tb.name as team_b_name,
        tb.short_name as team_b_short,
        c.name as competition_name,
        c.type as competition_type
      FROM matches m
      JOIN teams ta ON m.team_a_id = ta.id
      JOIN teams tb ON m.team_b_id = tb.id
      JOIN competitions c ON m.competition_id = c.id
      WHERE m.status = 'scheduled' AND m.scheduled_at > CURRENT_TIMESTAMP
      ORDER BY m.scheduled_at ASC
    `;

    const params: any[] = [];

    if (limit) {
      query += ` LIMIT $1`;
      params.push(limit);
    }

    const result = await databaseService.query(query, params);
    return toCamelCase(result.rows) as Match[];
  }

  // 获取最近完成的比赛
  async findRecentCompleted(limit?: number): Promise<Match[]> {
    let query = `
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
      WHERE m.status = 'completed'
      ORDER BY m.completed_at DESC
    `;

    const params: any[] = [];

    if (limit) {
      query += ` LIMIT $1`;
      params.push(limit);
    }

    const result = await databaseService.query(query, params);
    return toCamelCase(result.rows) as Match[];
  }

  // 获取进行中的比赛
  async findInProgress(): Promise<Match[]> {
    const query = `
      SELECT
        m.*,
        ta.name as team_a_name,
        ta.short_name as team_a_short,
        tb.name as team_b_name,
        tb.short_name as team_b_short,
        c.name as competition_name,
        c.type as competition_type
      FROM matches m
      JOIN teams ta ON m.team_a_id = ta.id
      JOIN teams tb ON m.team_b_id = tb.id
      JOIN competitions c ON m.competition_id = c.id
      WHERE m.status = 'in_progress'
      ORDER BY m.started_at ASC
    `;

    const result = await databaseService.query(query);
    return toCamelCase(result.rows) as Match[];
  }

  // 批量创建比赛
  async createBatch(matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Match[]> {
    if (matches.length === 0) {
      return [];
    }

    const values = matches.map((_match, index) => {
      const baseIndex = index * 15;
      return `(
        $${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5},
        $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10},
        $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15}
      )`;
    }).join(', ');

    const query = `
      INSERT INTO matches (
        competition_id, team_a_id, team_b_id, score_a, score_b, winner_id,
        format, phase, round_number, match_number, status, scheduled_at,
        started_at, completed_at, notes
      )
      VALUES ${values}
      RETURNING *
    `;

    const params = matches.flatMap(match => [
      match.competitionId,
      match.teamAId,
      match.teamBId,
      match.scoreA,
      match.scoreB,
      match.winnerId,
      match.format,
      match.phase,
      match.roundNumber,
      match.matchNumber,
      match.status,
      match.scheduledAt,
      match.startedAt,
      match.completedAt,
      match.notes
    ]);

    const result = await databaseService.query(query, params);
    const createdMatches = toCamelCase(result.rows) as Match[];

    logger.info('Batch matches created:', { count: createdMatches.length });
    return createdMatches;
  }

  // 获取比赛数量
  async count(options?: QueryOptions): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM matches m WHERE 1=1`;
    const params: any[] = [];

    // 添加过滤条件
    if (options?.filter) {
      let paramIndex = 1;

      if (options.filter.competitionId) {
        query += ` AND m.competition_id = $${paramIndex}`;
        params.push(options.filter.competitionId);
        paramIndex++;
      }

      if (options.filter.status) {
        query += ` AND m.status = $${paramIndex}`;
        params.push(options.filter.status);
        paramIndex++;
      }
    }

    const result = await databaseService.query(query, params);
    return parseInt(result.rows[0].count);
  }
}