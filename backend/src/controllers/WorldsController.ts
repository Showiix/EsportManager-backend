// =================================================================
// 电竞赛事模拟系统 - 世界赛控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { worldsService } from '../services/WorldsService';
import { ApiResponse } from '../types';

export class WorldsController {
  /**
   * 生成世界赛对阵(夏季赛季后赛全部结束后调用)
   * POST /api/worlds/generate
   */
  async generateWorlds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 如果没有传seasonId，自动获取当前赛季
      let { seasonId } = req.body;
      
      if (!seasonId) {
        // 查询当前活跃赛季
        const { db } = await import('../config/database');
        const currentSeasonQuery = `
          SELECT season_code FROM seasons 
          ORDER BY id DESC LIMIT 1
        `;
        const seasonResult = await db.query(currentSeasonQuery);
        
        if (seasonResult.rows.length === 0) {
          res.status(400).json({
            success: false,
            error: {
              code: 'NO_ACTIVE_SEASON',
              message: '未找到可用赛季'
            }
          });
          return;
        }
        
        seasonId = seasonResult.rows[0].season_code;
      }

      const bracket = await worldsService.generateWorlds({ seasonId });

      const response: ApiResponse<any> = {
        success: true,
        data: bracket,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取世界赛对阵信息
   * GET /api/worlds/bracket?seasonId=xxx
   */
  async getWorldsBracket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.query;

      if (!seasonId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: seasonId'
          }
        });
        return;
      }

      const bracket = await worldsService.getWorldsBracket(seasonId as string);

      if (!bracket) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WORLDS_NOT_FOUND',
            message: '未找到该赛季的世界赛对阵'
          }
        });
        return;
      }

      const response: ApiResponse<any> = {
        success: true,
        data: bracket,
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
   * 模拟世界赛单场比赛
   * POST /api/worlds/simulate-match
   * Body: { matchId: string, matchType: 'swiss' | 'knockout' }
   */
  async simulateWorldsMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { matchId, matchType } = req.body;

      // 验证必填字段
      if (!matchId || !matchType) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填字段: matchId, matchType'
          }
        });
        return;
      }

      // 验证matchType
      if (matchType !== 'swiss' && matchType !== 'knockout') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'matchType必须为swiss或knockout'
          }
        });
        return;
      }

      let result;
      if (matchType === 'swiss') {
        result = await worldsService.simulateSwissMatch({ matchId, matchType });
      } else {
        result = await worldsService.simulateKnockoutMatch({ matchId, matchType });
      }

      const response: ApiResponse<any> = {
        success: true,
        data: result,
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
   * 获取世界赛资格队伍(各赛区夏季赛前三名)
   * GET /api/worlds/qualified-teams?seasonId=xxx
   */
  async getQualifiedTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.query;

      if (!seasonId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: seasonId'
          }
        });
        return;
      }

      const teams = await worldsService.getQualifiedTeams(seasonId as string);

      const response: ApiResponse<any[]> = {
        success: true,
        data: teams,
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
   * 检查是否可以生成世界赛(所有赛区夏季赛季后赛是否结束)
   * GET /api/worlds/check-eligibility?seasonId=xxx
   */
  async checkWorldsEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.query;

      if (!seasonId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: seasonId'
          }
        });
        return;
      }

      const eligibility = await worldsService.checkWorldsEligibility(seasonId as string);

      const response: ApiResponse<any> = {
        success: true,
        data: eligibility,
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
   * 获取瑞士轮积分榜
   * GET /api/worlds/:id/swiss-standings
   */
  async getSwissStandings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params; // worlds_bracket_id

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: id'
          }
        });
        return;
      }

      const standings = await worldsService.getSwissStandings(id);

      const response: ApiResponse<any[]> = {
        success: true,
        data: standings,
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
   * 更新世界赛状态
   * PUT /api/worlds/:id/status
   */
  async updateWorldsStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params; // worlds_bracket_id
      const { status } = req.body;

      if (!id || !status) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: id, status'
          }
        });
        return;
      }

      const result = await worldsService.updateWorldsStatus(id, status);

      const response: ApiResponse<any> = {
        success: true,
        data: result,
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
   * 生成淘汰赛对阵
   * POST /api/worlds/:id/generate-knockout
   */
  async generateKnockout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params; // worlds_bracket_id

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: id'
          }
        });
        return;
      }

      const result = await worldsService.generateKnockout(id);

      const response: ApiResponse<any> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 生成瑞士轮下一轮对阵
   * POST /api/worlds/:id/generate-swiss-round
   */
  async generateSwissRound(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params; // worlds_bracket_id

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: id'
          }
        });
        return;
      }

      const matches = await worldsService.generateSwissRound(id);

      const response: ApiResponse<any[]> = {
        success: true,
        data: matches,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取历史世界赛数据
   * GET /api/worlds/historical?seasonId=xxx
   */
  async getHistoricalWorlds(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.query;

      if (!seasonId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: seasonId'
          }
        });
        return;
      }

      // TODO: 实现获取历史世界赛数据的逻辑
      // 这里暂时返回空数组
      const response: ApiResponse<any[]> = {
        success: true,
        data: [],
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
}

export const worldsController = new WorldsController();
