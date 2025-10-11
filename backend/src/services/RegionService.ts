// =================================================================
// 电竞赛事模拟系统 - 赛区服务层
// =================================================================

import { RegionRepository } from '../repositories/RegionRepository';
import { logger } from '../utils/logger';

export class RegionService {
  private regionRepository: RegionRepository;

  constructor() {
    this.regionRepository = new RegionRepository();
  }

  /**
   * 获取所有赛区
   */
  async getAllRegions(): Promise<any[]> {
    try {
      const regions = await this.regionRepository.findAll();
      logger.info('Retrieved all regions', { count: regions.length });
      return regions;
    } catch (error) {
      logger.error('Error in getAllRegions:', error);
      throw error;
    }
  }

  /**
   * 根据ID获取赛区
   */
  async getRegionById(id: string): Promise<any | null> {
    try {
      const region = await this.regionRepository.findById(id);

      if (!region) {
        logger.warn('Region not found', { regionId: id });
        return null;
      }

      logger.info('Retrieved region by ID', { regionId: id });
      return region;
    } catch (error) {
      logger.error('Error in getRegionById:', error);
      throw error;
    }
  }

  /**
   * 更新赛区信息
   */
  async updateRegion(id: string, updateData: any): Promise<any | null> {
    try {
      const region = await this.regionRepository.update(id, updateData);

      if (!region) {
        logger.warn('Region not found for update', { regionId: id });
        return null;
      }

      logger.info('Region updated successfully', { regionId: id });
      return region;
    } catch (error) {
      logger.error('Error in updateRegion:', error);
      throw error;
    }
  }

  /**
   * 获取赛区统计信息
   */
  async getRegionStatistics(id: string): Promise<any> {
    try {
      const statistics = await this.regionRepository.getStatistics(id);
      logger.info('Retrieved region statistics', { regionId: id });
      return statistics;
    } catch (error) {
      logger.error('Error in getRegionStatistics:', error);
      throw error;
    }
  }
}
