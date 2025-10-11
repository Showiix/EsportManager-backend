// =================================================================
// 电竞赛事模拟系统 - 积分排名控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { rankingService } from '@/services/RankingService';
import { formatSimpleSuccess, formatSimpleError } from '@/utils/responseFormatter';
import { logger } from '@/utils/logger';

export class RankingController {
  /**
   * 获取赛区常规赛积分榜
   * GET /api/rankings/regional?regionId=1&seasonId=1&type=spring
   */
  async getRegionalStandings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { regionId, seasonId, type } = req.query;

      // 参数验证
      if (!regionId || !seasonId || !type) {
        res.status(400).json(
          formatSimpleError('缺少必要参数：regionId, seasonId, type')
        );
        return;
      }

      if (type !== 'spring' && type !== 'summer') {
        res.status(400).json(
          formatSimpleError('type参数必须是 spring 或 summer')
        );
        return;
      }

      const standings = await rankingService.getRegionalStandings(
        regionId as string,
        seasonId as string,
        type as 'spring' | 'summer'
      );

      res.json(formatSimpleSuccess(standings, '获取赛区积分榜成功'));
    } catch (error) {
      logger.error('Error in getRegionalStandings:', error);
      next(error);
    }
  }

  /**
   * 获取年度积分排名
   * GET /api/rankings/annual?seasonId=1
   */
  async getAnnualRankings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.query;

      // 参数验证
      if (!seasonId) {
        res.status(400).json(
          formatSimpleError('缺少必要参数：seasonId')
        );
        return;
      }

      const rankings = await rankingService.getAnnualRankings(seasonId as string);

      res.json(formatSimpleSuccess(rankings, '获取年度积分排名成功'));
    } catch (error) {
      logger.error('Error in getAnnualRankings:', error);
      next(error);
    }
  }

  /**
   * 更新赛区常规赛积分榜
   * POST /api/rankings/regional/update
   * Body: { regionId, seasonId, competitionType }
   */
  async updateRegionalStandings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { regionId, seasonId, competitionType } = req.body;

      // 参数验证
      if (!regionId || !seasonId || !competitionType) {
        res.status(400).json(
          formatSimpleError('缺少必要参数：regionId, seasonId, competitionType')
        );
        return;
      }

      if (competitionType !== 'spring' && competitionType !== 'summer') {
        res.status(400).json(
          formatSimpleError('competitionType参数必须是 spring 或 summer')
        );
        return;
      }

      await rankingService.updateRegionalStandings(regionId, seasonId, competitionType);

      res.json(formatSimpleSuccess(null, '赛区积分榜更新成功'));
    } catch (error) {
      logger.error('Error in updateRegionalStandings:', error);
      next(error);
    }
  }

  /**
   * 更新年度积分排名
   * POST /api/rankings/annual/update
   * Body: { seasonId }
   */
  async updateAnnualRankings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.body;

      // 参数验证
      if (!seasonId) {
        res.status(400).json(
          formatSimpleError('缺少必要参数：seasonId')
        );
        return;
      }

      await rankingService.updateAnnualRankings(seasonId);

      res.json(formatSimpleSuccess(null, '年度积分排名更新成功'));
    } catch (error) {
      logger.error('Error in updateAnnualRankings:', error);
      next(error);
    }
  }

  /**
   * 批量刷新所有排名
   * POST /api/rankings/refresh
   * Body: { seasonId }
   */
  async refreshAllRankings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.body;

      // 参数验证
      if (!seasonId) {
        res.status(400).json(
          formatSimpleError('缺少必要参数：seasonId')
        );
        return;
      }

      await rankingService.refreshAllRankings(seasonId);

      res.json(formatSimpleSuccess(null, '所有排名数据刷新成功'));
    } catch (error) {
      logger.error('Error in refreshAllRankings:', error);
      next(error);
    }
  }
}

export const rankingController = new RankingController();
