// =================================================================
// 电竞赛事模拟系统 - 积分管理控制器
// =================================================================

import { Request, Response } from 'express';
import { pointsService } from '../services/PointsService';
import { logger } from '@/utils/logger';
import { BusinessError } from '../types';

export class PointsController {
  /**
   * GET /api/points/team/:teamId/:seasonYear
   * 获取战队积分详情
   */
  async getTeamPointsBreakdown(req: Request, res: Response) {
    try {
      const { teamId, seasonYear } = req.params;
      
      const breakdown = await pointsService.getTeamPointsBreakdown(
        teamId,
        parseInt(seasonYear)
      );

      res.json({
        success: true,
        data: breakdown
      });
    } catch (error: any) {
      logger.error('获取战队积分详情失败', { error: error.message });
      
      if (error instanceof BusinessError) {
        res.status(error.statusCode || 400).json({
          success: false,
          message: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          message: '获取战队积分详情失败'
        });
      }
    }
  }

  /**
   * GET /api/points/season/:seasonYear
   * 获取赛季积分排名
   */
  async getSeasonPointsRanking(req: Request, res: Response) {
    try {
      const { seasonYear } = req.params;
      
      const ranking = await pointsService.getSeasonPointsRanking(
        parseInt(seasonYear)
      );

      res.json({
        success: true,
        data: ranking
      });
    } catch (error: any) {
      logger.error('获取赛季积分排名失败', { error: error.message });
      
      res.status(500).json({
        success: false,
        message: '获取赛季积分排名失败'
      });
    }
  }

  /**
   * POST /api/points/recalculate/:seasonYear
   * 重新计算赛季积分
   */
  async recalculateSeasonPoints(req: Request, res: Response) {
    try {
      const { seasonYear } = req.params;
      
      const result = await pointsService.recalculateSeasonPoints(
        parseInt(seasonYear)
      );

      res.json({
        success: true,
        data: result,
        message: '积分重新计算完成'
      });
    } catch (error: any) {
      logger.error('重新计算赛季积分失败', { error: error.message });
      
      res.status(500).json({
        success: false,
        message: '重新计算赛季积分失败'
      });
    }
  }

  /**
   * GET /api/points/history/:teamId
   * 获取战队积分历史
   */
  async getTeamPointsHistory(req: Request, res: Response) {
    try {
      const { teamId } = req.params;
      const { seasonYear } = req.query;
      
      const history = await pointsService.getTeamPointsHistory(
        teamId,
        seasonYear ? parseInt(seasonYear as string) : undefined
      );

      res.json({
        success: true,
        data: history
      });
    } catch (error: any) {
      logger.error('获取战队积分历史失败', { error: error.message });
      
      res.status(500).json({
        success: false,
        message: '获取战队积分历史失败'
      });
    }
  }

  /**
   * GET /api/points/region/:regionId/:seasonYear
   * 获取赛区积分排名
   */
  async getRegionPointsRanking(req: Request, res: Response) {
    try {
      const { regionId, seasonYear } = req.params;
      
      const ranking = await pointsService.getRegionPointsRanking(
        regionId,
        parseInt(seasonYear)
      );

      res.json({
        success: true,
        data: ranking
      });
    } catch (error: any) {
      logger.error('获取赛区积分排名失败', { error: error.message });
      
      res.status(500).json({
        success: false,
        message: '获取赛区积分排名失败'
      });
    }
  }
}

export const pointsController = new PointsController();

