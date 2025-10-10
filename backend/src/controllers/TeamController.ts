// =================================================================
// 电竞赛事模拟系统 - 战队控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { teamService } from '../services/TeamService';
import { CreateTeamDto, UpdateTeamDto, QueryOptions, ApiResponse } from '../types';

export class TeamController {
  // 创建战队
  async createTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const teamData: CreateTeamDto = req.body;
      const team = await teamService.createTeam(teamData);

      const response: ApiResponse<any> = {
        success: true,
        data: team,
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

  // 获取战队详情
  async getTeamById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const includeRelations = req.query.include === 'true';

      const team = await teamService.getTeamById(id, includeRelations);

      const response: ApiResponse<any> = {
        success: true,
        data: team,
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

  // 获取战队列表
  async getTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const sortBy = req.query.sortBy as string;
      const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'asc';
      const regionId = req.query.regionId as string;
      const powerRatingMin = req.query.powerRatingMin ? parseInt(req.query.powerRatingMin as string) : undefined;
      const powerRatingMax = req.query.powerRatingMax ? parseInt(req.query.powerRatingMax as string) : undefined;

      const options: QueryOptions = {
        pagination: { page, limit, sortBy, sortOrder },
        filter: {
          ...(regionId && { regionId }),
          ...(powerRatingMin && { powerRatingMin }),
          ...(powerRatingMax && { powerRatingMax })
        }
      };

      const { teams, total } = await teamService.getTeams(options);

      const totalPages = Math.ceil(total / limit);

      const response: ApiResponse<any> = {
        success: true,
        data: teams,
        meta: {
          pagination: {
            page,
            limit,
            total,
            totalPages
          },
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] as string || 'unknown'
        }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }

  // 根据赛区获取战队
  async getTeamsByRegion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { regionId } = req.params;
      const teams = await teamService.getTeamsByRegion(regionId);

      const response: ApiResponse<any> = {
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

  // 更新战队
  async updateTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const updateData: UpdateTeamDto = req.body;

      const team = await teamService.updateTeam(id, updateData);

      const response: ApiResponse<any> = {
        success: true,
        data: team,
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

  // 删除战队
  async deleteTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await teamService.deleteTeam(id);

      const response: ApiResponse<null> = {
        success: true,
        data: null,
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

  // 获取战队统计
  async getTeamStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const seasonYear = req.query.seasonYear ? parseInt(req.query.seasonYear as string) : undefined;

      const statistics = await teamService.getTeamStatistics(id, seasonYear);

      const response: ApiResponse<any> = {
        success: true,
        data: statistics,
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

  // 获取战队比赛历史
  async getTeamMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const matches = await teamService.getTeamMatches(id, limit);

      const response: ApiResponse<any> = {
        success: true,
        data: matches,
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

export const teamController = new TeamController();