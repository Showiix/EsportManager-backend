// =================================================================
// Super洲际超级杯控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { superService } from '../services/SuperService';
import { formatSuccessResponse, formatErrorResponse } from '../utils/responseFormatter';
import { logger } from '../utils/logger';
import { BusinessError } from '../types';

export class SuperController {
  /**
   * 检查Super资格
   * GET /api/super/check-eligibility?season1Code=S1&season2Code=S2
   */
  async checkEligibility(req: Request, res: Response, next: NextFunction) {
    try {
      const { season1Code, season2Code } = req.query;

      if (!season1Code || !season2Code) {
        return res.status(400).json(
          formatErrorResponse('缺少必需参数: season1Code, season2Code', 'INVALID_PARAMS')
        );
      }

      const result = await superService.checkSuperEligibility(
        season1Code as string,
        season2Code as string
      );

      res.json(formatSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * 生成Super赛事
   * POST /api/super/generate
   * Body: { season1Code, season2Code }
   */
  async generateSuper(req: Request, res: Response, next: NextFunction) {
    try {
      const { season1Code, season2Code } = req.body;

      if (!season1Code || !season2Code) {
        return res.status(400).json(
          formatErrorResponse('缺少必需参数: season1Code, season2Code', 'INVALID_PARAMS')
        );
      }

      logger.info(`[SuperController] 生成Super赛事: ${season1Code}-${season2Code}`);

      const bracket = await superService.generateSuper({
        season1Code,
        season2Code
      });

      logger.info(`[SuperController] ✅ Super赛事生成成功`);

      res.status(201).json(formatSuccessResponse(bracket, 'Super赛事生成成功'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取Super对阵
   * GET /api/super/bracket?season1Code=S1&season2Code=S2
   */
  async getBracket(req: Request, res: Response, next: NextFunction) {
    try {
      const { season1Code, season2Code } = req.query;

      if (!season1Code || !season2Code) {
        return res.status(400).json(
          formatErrorResponse('缺少必需参数: season1Code, season2Code', 'INVALID_PARAMS')
        );
      }

      const bracket = await superService.getSuperBracket(
        season1Code as string,
        season2Code as string
      );

      res.json(formatSuccessResponse(bracket));
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取晋级队伍
   * GET /api/super/qualified-teams?season1Code=S1&season2Code=S2
   */
  async getQualifiedTeams(req: Request, res: Response, next: NextFunction) {
    try {
      const { season1Code, season2Code } = req.query;

      if (!season1Code || !season2Code) {
        return res.status(400).json(
          formatErrorResponse('缺少必需参数: season1Code, season2Code', 'INVALID_PARAMS')
        );
      }

      const teams = await superService.getQualifiedTeams(
        season1Code as string,
        season2Code as string
      );

      res.json(formatSuccessResponse(teams));
    } catch (error) {
      next(error);
    }
  }

  /**
   * 模拟Super比赛
   * POST /api/super/simulate-match
   * Body: { matchId, superId }
   */
  async simulateMatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId, superId } = req.body;

      if (!matchId || !superId) {
        return res.status(400).json(
          formatErrorResponse('缺少必需参数: matchId, superId', 'INVALID_PARAMS')
        );
      }

      logger.info(`[SuperController] 模拟Super比赛: matchId=${matchId}`);

      const result = await superService.simulateSuperMatch({
        matchId,
        superId
      });

      logger.info(`[SuperController] ✅ Super比赛模拟成功`);

      res.json(formatSuccessResponse(result, '比赛模拟成功'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取历史Super数据
   * GET /api/super/historical
   */
  async getHistorical(req: Request, res: Response, next: NextFunction) {
    try {
      // TODO: 实现获取所有历史Super数据
      res.json(formatSuccessResponse([]));
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取Fighter组积分榜
   * GET /api/super/:superId/fighter-standings
   */
  async getFighterStandings(req: Request, res: Response, next: NextFunction) {
    try {
      const { superId } = req.params;

      // TODO: 实现获取Fighter组积分榜
      res.json(formatSuccessResponse([]));
    } catch (error) {
      next(error);
    }
  }

  /**
   * 开始下一阶段
   * POST /api/super/:superId/next-stage
   */
  async startNextStage(req: Request, res: Response, next: NextFunction) {
    try {
      const { superId } = req.params;

      logger.info(`[SuperController] 开始下一阶段: superId=${superId}`);

      const updatedBracket = await superService.startNextStage(superId);

      res.json(formatSuccessResponse(updatedBracket, '已进入下一阶段'));
    } catch (error) {
      next(error);
    }
  }
}

export const superController = new SuperController();

