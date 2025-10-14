// =================================================================
// 电竞赛事模拟系统 - 赛季控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';
import { seasonService } from '../services/SeasonService';

export class SeasonController {
  // 获取所有赛季
  async getSeasons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await db.query(`
        SELECT id, season_code, name, display_name, year, status, created_at, updated_at
        FROM seasons
        ORDER BY year DESC, id DESC
      `);

      const response: ApiResponse<any> = {
        success: true,
        data: result.rows,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get seasons:', error);
      next(error);
    }
  }

  // 获取单个赛季详情（支持通过season_code或id查询）
  async getSeasonById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      // 判断是season_code还是id
      const isNumeric = /^\d+$/.test(id);
      const queryField = isNumeric ? 'id' : 'season_code';

      const result = await db.query(`
        SELECT id, season_code, name, display_name, year, status, created_at, updated_at
        FROM seasons
        WHERE ${queryField} = $1
      `, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 404,
            message: `Season with ${queryField} ${id} not found`
          }
        });
        return;
      }

      const response: ApiResponse<any> = {
        success: true,
        data: result.rows[0],
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get season:', error);
      next(error);
    }
  }

  // 获取当前活跃赛季
  async getCurrentSeason(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await db.query(`
        SELECT id, season_code, name, display_name, year, status, created_at, updated_at
        FROM seasons
        WHERE status = 'active'
        ORDER BY year DESC, id DESC
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 404,
            message: 'No active season found'
          }
        });
        return;
      }

      const response: ApiResponse<any> = {
        success: true,
        data: result.rows[0],
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to get current season:', error);
      next(error);
    }
  }

  /**
   * MSI结束后推进到夏季赛
   * POST /api/seasons/:seasonId/proceed-to-summer
   */
  async proceedToSummer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.params;

      logger.info('收到推进到夏季赛请求', { seasonId });

      const result = await seasonService.proceedToSummer(seasonId);

      const response: ApiResponse<any> = {
        success: true,
        data: {
          message: '成功推进到夏季赛',
          summerCompetitions: result.summerCompetitions,
          totalMatchesGenerated: result.totalMatchesGenerated,
          regionResults: result.regionResults,
          summary: {
            totalRegions: result.regionResults.length,
            successfulRegions: result.regionResults.filter(r => r.success).length,
            failedRegions: result.regionResults.filter(r => !r.success).length
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取赛季进度信息
   * GET /api/seasons/:seasonId/progress
   */
  async getSeasonProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.params;

      const progress = await seasonService.getSeasonProgress(seasonId);

      const response: ApiResponse<any> = {
        success: true,
        data: progress,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 结束当前赛季并创建新赛季
   * POST /api/seasons/:seasonId/end
   */
  async endSeason(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.params;

      logger.info('收到结束赛季请求', { seasonId });

      const result = await seasonService.endSeasonAndCreateNew(seasonId);

      const response: ApiResponse<any> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      logger.info('赛季结束成功', { result });
      res.json(response);
    } catch (error) {
      logger.error('结束赛季失败', { error });
      next(error);
    }
  }
}

export const seasonController = new SeasonController();
