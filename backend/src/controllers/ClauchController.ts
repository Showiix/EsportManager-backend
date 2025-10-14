// =================================================================
// 电竞赛事模拟系统 - Clauch洲际赛控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { clauchService } from '../services/ClauchService';
import { ApiResponse } from '../types';

export class ClauchController {
  /**
   * 生成Clauch洲际赛(世界赛结束后调用)
   * POST /api/clauch/generate
   */
  async generateClauch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.body;

      // 验证必填字段
      if (!seasonId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填字段: seasonId'
          }
        });
        return;
      }

      const bracket = await clauchService.generateClauch({ seasonId });

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
   * 获取Clauch对阵信息
   * GET /api/clauch/bracket?seasonId=xxx
   */
  async getClauchBracket(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      let bracket;
      try {
        bracket = await clauchService.getClauchBracket(seasonId as string);
      } catch (error: any) {
        // 如果是未找到的错误，返回404而不是500
        if (error.message && error.message.includes('不存在')) {
          res.status(404).json({
            success: false,
            error: {
              code: 'CLAUCH_NOT_FOUND',
              message: '未找到该赛季的Clauch洲际赛'
            }
          });
          return;
        }
        throw error;
      }

      if (!bracket) {
        res.status(404).json({
          success: false,
          error: {
            code: 'CLAUCH_NOT_FOUND',
            message: '未找到该赛季的Clauch洲际赛'
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
   * 模拟Clauch单场比赛
   * POST /api/clauch/simulate-match
   */
  async simulateClauchMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { matchId } = req.body;

      // 验证必填字段
      if (!matchId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填字段: matchId'
          }
        });
        return;
      }

      // 获取比赛信息以判断是小组赛还是淘汰赛
      const matchQuery = `SELECT stage FROM clauch_matches WHERE id = $1`;
      const { db } = require('../config/database');
      const matchResult = await db.query(matchQuery, [matchId]);

      if (matchResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'MATCH_NOT_FOUND',
            message: '比赛不存在'
          }
        });
        return;
      }

      const stage = matchResult.rows[0].stage;
      let result;

      if (stage === 'group_stage') {
        result = await clauchService.simulateGroupMatch({ matchId });
      } else {
        result = await clauchService.simulateKnockoutMatch({ matchId });
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
   * 获取Clauch资格队伍(各赛区夏季赛常规赛前8名)
   * GET /api/clauch/qualified-teams?seasonId=xxx
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

      const teams = await clauchService.getQualifiedTeams(seasonId as string);

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
   * 检查是否可以生成Clauch(世界赛是否结束)
   * GET /api/clauch/check-eligibility?seasonId=xxx
   */
  async checkClauchEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const eligibility = await clauchService.checkClauchEligibility(seasonId as string);

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
   * 获取小组积分榜
   * GET /api/clauch/group-standings?bracketId=xxx&groupName=A
   */
  async getGroupStandings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bracketId, groupName } = req.query;

      if (!bracketId || !groupName) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: bracketId, groupName'
          }
        });
        return;
      }

      const standings = await clauchService.getGroupStandings(
        bracketId as string,
        groupName as string
      );

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
   * 生成淘汰赛对阵
   * POST /api/clauch/:id/generate-knockout
   */
  async generateKnockout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const bracketId = req.params.id;

      if (!bracketId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: id'
          }
        });
        return;
      }

      await clauchService.generateKnockout(bracketId);

      // 获取更新后的bracket信息
      const bracketQuery = `SELECT season_id FROM clauch_brackets WHERE id = $1`;
      const { db } = require('../config/database');
      const bracketResult = await db.query(bracketQuery, [bracketId]);
      
      if (bracketResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: {
            code: 'BRACKET_NOT_FOUND',
            message: 'Bracket不存在'
          }
        });
        return;
      }

      const seasonId = bracketResult.rows[0].season_id;
      const updatedBracket = await clauchService.getClauchBracket(seasonId.toString());

      const response: ApiResponse<any> = {
        success: true,
        data: updatedBracket,
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

export const clauchController = new ClauchController();

