// =================================================================
// 电竞赛事模拟系统 - 季后赛控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { playoffService } from '../services/PlayoffService';
import {
  ApiResponse,
  GeneratePlayoffRequest,
  SimulatePlayoffMatchRequest
} from '../types';

export class PlayoffController {
  /**
   * 生成季后赛对阵(常规赛结束后调用)
   * POST /api/playoffs/generate
   */
  async generatePlayoff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requestData: GeneratePlayoffRequest = req.body;

      // 验证必填字段
      if (!requestData.competitionId || !requestData.regionId || !requestData.seasonId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填字段: competitionId, regionId, seasonId'
          }
        });
        return;
      }

      const bracket = await playoffService.generatePlayoff(requestData);

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
   * 获取季后赛对阵信息
   * GET /api/playoffs/bracket?competitionId=xxx&regionId=xxx
   */
  async getPlayoffBracket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { competitionId, regionId } = req.query;

      if (!competitionId || !regionId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: competitionId, regionId'
          }
        });
        return;
      }

      const bracket = await playoffService.getPlayoffBracket(
        competitionId as string,
        regionId as string
      );

      if (!bracket) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PLAYOFF_NOT_FOUND',
            message: '未找到该季后赛对阵'
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
   * 获取赛区所有季后赛
   * GET /api/playoffs/region/:regionId?seasonId=xxx
   */
  async getRegionPlayoffs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { regionId } = req.params;
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

      // 实现获取赛区所有季后赛的逻辑
      const brackets = await playoffService.getRegionPlayoffs(
        regionId as string,
        seasonId as string
      );

      const response: ApiResponse<any[]> = {
        success: true,
        data: brackets,
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
   * 模拟季后赛单场比赛(BO5)
   * POST /api/playoffs/simulate-match
   */
  async simulatePlayoffMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requestData: SimulatePlayoffMatchRequest = req.body;

      // 验证必填字段
      if (!requestData.matchId || !requestData.competitionId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填字段: matchId, competitionId'
          }
        });
        return;
      }

      const result = await playoffService.simulatePlayoffMatch(requestData);

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
   * 获取季后赛资格队伍(常规赛前4名)
   * GET /api/playoffs/qualified-teams?competitionId=xxx&regionId=xxx
   */
  async getQualifiedTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { competitionId, regionId } = req.query;

      if (!competitionId || !regionId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: competitionId, regionId'
          }
        });
        return;
      }

      const teams = await playoffService.getQualifiedTeams(
        competitionId as string,
        regionId as string
      );

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
   * 检查是否可以生成季后赛(常规赛是否结束)
   * GET /api/playoffs/check-eligibility?competitionId=xxx&regionId=xxx
   */
  async checkPlayoffEligibility(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { competitionId, regionId } = req.query;

      if (!competitionId || !regionId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少必填参数: competitionId, regionId'
          }
        });
        return;
      }

      const eligibility = await playoffService.checkPlayoffEligibility(
        competitionId as string,
        regionId as string
      );

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
}

export const playoffController = new PlayoffController();
