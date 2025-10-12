// =================================================================
// 电竞赛事模拟系统 - MSI季中赛控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { msiService } from '../services/MSIService';
import {
  ApiResponse,
  GenerateMSIRequest,
  SimulateMSIMatchRequest
} from '../types';

export class MSIController {
  /**
   * 生成MSI对阵(春季赛季后赛全部结束后调用)
   * POST /api/msi/generate
   */
  async generateMSI(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requestData: GenerateMSIRequest = req.body;

      // 验证必填字段
      if (!requestData.seasonId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填字段: seasonId'
          }
        });
        return;
      }

      const bracket = await msiService.generateMSI(requestData);

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
   * 获取MSI对阵信息
   * GET /api/msi/bracket?seasonId=xxx
   */
  async getMSIBracket(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const bracket = await msiService.getMSIBracket(seasonId as string);

      if (!bracket) {
        res.status(404).json({
          success: false,
          error: {
            code: 'MSI_NOT_FOUND',
            message: '未找到该赛季的MSI对阵'
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
   * 模拟MSI单场比赛(BO5)
   * POST /api/msi/simulate-match
   */
  async simulateMSIMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requestData: SimulateMSIMatchRequest = req.body;

      // 验证必填字段
      if (!requestData.matchId || !requestData.msiId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填字段: matchId, msiId'
          }
        });
        return;
      }

      const result = await msiService.simulateMSIMatch(requestData);

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
   * 获取MSI资格队伍(各赛区春季赛前三名)
   * GET /api/msi/qualified-teams?seasonId=xxx
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

      const teams = await msiService.getQualifiedTeams(seasonId as string);

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
   * 检查是否可以生成MSI(所有赛区春季赛季后赛是否结束)
   * GET /api/msi/check-eligibility?seasonId=xxx
   */
  async checkMSIEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const eligibility = await msiService.checkMSIEligibility(seasonId as string);

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
   * 获取历史MSI数据
   * GET /api/msi/historical?seasonId=xxx
   */
  async getHistoricalMSI(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      // TODO: 实现获取历史MSI数据的逻辑
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

export const msiController = new MSIController();
