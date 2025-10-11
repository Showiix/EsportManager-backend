// =================================================================
// 电竞赛事模拟系统 - 赛区数据访问层
// =================================================================

import { databaseService } from '../services/DatabaseService';
import { logger } from '../utils/logger';

export class RegionRepository {
  /**
   * 获取所有赛区
   */
  async findAll(): Promise<any[]> {
    const query = `
      SELECT
        r.*,
        COUNT(DISTINCT t.id) as team_count
      FROM regions r
      LEFT JOIN teams t ON r.id = t.region_id AND t.is_active = true
      GROUP BY r.id
      ORDER BY r.id
    `;

    const result = await databaseService.query(query);
    return result.rows;
  }

  /**
   * 根据ID获取赛区
   */
  async findById(id: string): Promise<any | null> {
    const query = `
      SELECT
        r.*,
        COUNT(DISTINCT t.id) as team_count
      FROM regions r
      LEFT JOIN teams t ON r.id = t.region_id AND t.is_active = true
      WHERE r.id = $1
      GROUP BY r.id
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * 更新赛区信息
   */
  async update(id: string, updateData: any): Promise<any | null> {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    // 构建更新语句
    if (updateData.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(updateData.name);
      paramIndex++;
    }

    if (updateData.code !== undefined) {
      updates.push(`code = $${paramIndex}`);
      params.push(updateData.code);
      paramIndex++;
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);

    const query = `
      UPDATE regions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await databaseService.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Region updated:', { regionId: id });
    return result.rows[0];
  }

  /**
   * 获取赛区统计信息
   */
  async getStatistics(id: string): Promise<any> {
    const query = `
      SELECT
        r.id,
        r.name,
        r.code,
        COUNT(DISTINCT t.id) as total_teams,
        COALESCE(AVG(t.power_rating), 0) as avg_power_rating,
        COUNT(DISTINCT m.id) as total_matches,
        SUM(CASE WHEN m.winner_id = t.id THEN 1 ELSE 0 END) as total_wins
      FROM regions r
      LEFT JOIN teams t ON r.id = t.region_id AND t.is_active = true
      LEFT JOIN matches m ON (m.team_a_id = t.id OR m.team_b_id = t.id) AND m.status = 'completed'
      WHERE r.id = $1
      GROUP BY r.id, r.name, r.code
    `;

    const result = await databaseService.query(query, [id]);

    if (result.rows.length === 0) {
      return {
        id,
        total_teams: 0,
        avg_power_rating: 0,
        total_matches: 0,
        total_wins: 0
      };
    }

    return result.rows[0];
  }
}
