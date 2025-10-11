// =================================================================
// 电竞赛事模拟系统 - 赛区控制器
// =================================================================

import { Request, Response } from 'express';
import { RegionService } from '../services/RegionService';
import { logger } from '../utils/logger';

export class RegionController {
  private regionService: RegionService;

  constructor() {
    this.regionService = new RegionService();
  }

  /**
   * 获取所有赛区
   * GET /api/regions
   */
  async getRegions(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching all regions');

      const regions = await this.regionService.getAllRegions();

      res.json({
        success: true,
        data: regions,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch regions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 500,
          message: 'Failed to fetch regions',
          details: error.message
        }
      });
    }
  }

  /**
   * 根据ID获取赛区详情
   * GET /api/regions/:id
   */
  async getRegionById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      logger.info('Fetching region by ID:', { regionId: id });

      const region = await this.regionService.getRegionById(id);

      if (!region) {
        res.status(404).json({
          success: false,
          error: {
            code: 404,
            message: `Region with ID ${id} not found`
          }
        });
        return;
      }

      res.json({
        success: true,
        data: region,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch region:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 500,
          message: 'Failed to fetch region',
          details: error.message
        }
      });
    }
  }

  /**
   * 更新赛区信息
   * PUT /api/regions/:id
   */
  async updateRegion(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      logger.info('Updating region:', { regionId: id, data: updateData });

      const region = await this.regionService.updateRegion(id, updateData);

      if (!region) {
        res.status(404).json({
          success: false,
          error: {
            code: 404,
            message: `Region with ID ${id} not found`
          }
        });
        return;
      }

      res.json({
        success: true,
        data: region,
        message: 'Region updated successfully',
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    } catch (error: any) {
      logger.error('Failed to update region:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 500,
          message: 'Failed to update region',
          details: error.message
        }
      });
    }
  }

  /**
   * 获取赛区统计信息
   * GET /api/regions/:id/statistics
   */
  async getRegionStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      logger.info('Fetching region statistics:', { regionId: id });

      const statistics = await this.regionService.getRegionStatistics(id);

      res.json({
        success: true,
        data: statistics,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    } catch (error: any) {
      logger.error('Failed to fetch region statistics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 500,
          message: 'Failed to fetch region statistics',
          details: error.message
        }
      });
    }
  }
}

// 导出单例
export const regionController = new RegionController();
