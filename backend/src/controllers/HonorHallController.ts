// =================================================================
// 电竞赛事模拟系统 - 荣誉殿堂控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { honorHallService } from '@/services/HonorHallService';
import { formatSimpleSuccess, formatSimpleError } from '@/utils/responseFormatter';
import { logger } from '@/utils/logger';

export class HonorHallController {
  /**
   * 获取可用赛季列表
   * GET /api/honor-hall/seasons
   */
  async getAvailableSeasons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const seasons = await honorHallService.getAvailableSeasons();

      res.json(formatSimpleSuccess(seasons, '获取赛季列表成功'));
    } catch (error) {
      logger.error('Error in getAvailableSeasons:', error);
      next(error);
    }
  }

  /**
   * 获取指定赛季的荣誉数据
   * GET /api/honor-hall/seasons/:id/honors
   */
  async getSeasonHonors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json(formatSimpleError('缺少必要参数：seasonId'));
        return;
      }

      const honorData = await honorHallService.getSeasonHonorData(id);

      res.json(formatSimpleSuccess(honorData, '获取赛季荣誉数据成功'));
    } catch (error) {
      logger.error('Error in getSeasonHonors:', error);
      next(error);
    }
  }

  /**
   * 获取赛区荣誉排名
   * GET /api/honor-hall/regional-honors?seasonId=1&type=spring
   */
  async getRegionalHonors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId, type } = req.query;

      if (!seasonId) {
        res.status(400).json(formatSimpleError('缺少必要参数：seasonId'));
        return;
      }

      // 获取完整荣誉数据，然后提取赛区荣誉部分
      const honorData = await honorHallService.getSeasonHonorData(seasonId as string);

      const regionalHonors =
        type === 'spring'
          ? honorData.regionalHonors.spring
          : type === 'summer'
          ? honorData.regionalHonors.summer
          : {
              spring: honorData.regionalHonors.spring,
              summer: honorData.regionalHonors.summer,
            };

      res.json(formatSimpleSuccess(regionalHonors, '获取赛区荣誉成功'));
    } catch (error) {
      logger.error('Error in getRegionalHonors:', error);
      next(error);
    }
  }

  /**
   * 获取全球赛事荣誉
   * GET /api/honor-hall/global-honors?seasonId=1&competitionType=msi
   */
  async getGlobalHonors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId, competitionType } = req.query;

      if (!seasonId) {
        res.status(400).json(formatSimpleError('缺少必要参数：seasonId'));
        return;
      }

      // 获取完整荣誉数据，然后提取全球赛事荣誉部分
      const honorData = await honorHallService.getSeasonHonorData(seasonId as string);

      let globalHonor;
      if (competitionType === 'msi') {
        globalHonor = honorData.globalHonors.msi;
      } else if (competitionType === 'worlds') {
        globalHonor = honorData.globalHonors.worlds;
      } else if (competitionType === 'intercontinental') {
        globalHonor = honorData.intercontinentalHonors;
      } else {
        // 返回所有全球赛事荣誉
        globalHonor = {
          msi: honorData.globalHonors.msi,
          worlds: honorData.globalHonors.worlds,
          intercontinental: honorData.intercontinentalHonors,
        };
      }

      res.json(formatSimpleSuccess(globalHonor, '获取全球赛事荣誉成功'));
    } catch (error) {
      logger.error('Error in getGlobalHonors:', error);
      next(error);
    }
  }

  /**
   * 获取年度积分排名
   * GET /api/honor-hall/annual-rankings?year=2024&limit=10
   */
  async getAnnualRankings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId, limit } = req.query;

      if (!seasonId) {
        res.status(400).json(formatSimpleError('缺少必要参数：seasonId'));
        return;
      }

      // 获取完整荣誉数据，然后提取年度排名部分
      const honorData = await honorHallService.getSeasonHonorData(seasonId as string);

      let rankings = honorData.annualRankings;

      // 如果指定了limit，只返回前N名
      if (limit) {
        const limitNum = parseInt(limit as string);
        rankings = {
          topThree: rankings.topThree.slice(0, Math.min(limitNum, rankings.topThree.length)),
          regionalTop: rankings.regionalTop,
        };
      }

      res.json(formatSimpleSuccess(rankings, '获取年度积分排名成功'));
    } catch (error) {
      logger.error('Error in getAnnualRankings:', error);
      next(error);
    }
  }

  /**
   * 创建荣誉记录
   * POST /api/honor-hall/honor-records
   * Body: { seasonId, competitionId, teamId, position, points, specialRecord }
   */
  async createHonorRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId, competitionId, teamId, position, points, specialRecord } = req.body;

      // 参数验证
      if (!seasonId || !competitionId || !teamId || position === undefined || points === undefined) {
        res.status(400).json(
          formatSimpleError('缺少必要参数：seasonId, competitionId, teamId, position, points')
        );
        return;
      }

      await honorHallService.createHonorRecord(
        seasonId,
        competitionId,
        teamId,
        position,
        points,
        specialRecord
      );

      res.json(formatSimpleSuccess(null, '荣誉记录创建成功'));
    } catch (error) {
      logger.error('Error in createHonorRecord:', error);
      next(error);
    }
  }

  /**
   * 批量创建荣誉记录
   * POST /api/honor-hall/honor-records/batch
   * Body: { seasonId, competitionId, results: [{teamId, position, points, specialRecord}] }
   */
  async batchCreateHonorRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId, competitionId, results } = req.body;

      // 参数验证
      if (!seasonId || !competitionId || !results || !Array.isArray(results)) {
        res.status(400).json(
          formatSimpleError('缺少必要参数：seasonId, competitionId, results (数组)')
        );
        return;
      }

      await honorHallService.batchCreateHonorRecords(seasonId, competitionId, results);

      res.json(formatSimpleSuccess(null, `成功创建 ${results.length} 条荣誉记录`));
    } catch (error) {
      logger.error('Error in batchCreateHonorRecords:', error);
      next(error);
    }
  }
}

export const honorHallController = new HonorHallController();
