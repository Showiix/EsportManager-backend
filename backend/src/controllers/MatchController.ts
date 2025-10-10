// =================================================================
// 电竞赛事模拟系统 - 比赛控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { matchService } from '../services/MatchService';
import { UpdateMatchResultDto, QueryOptions, ApiResponse, MatchStatus } from '../types';

export class MatchController {
  // 获取比赛详情
  async getMatchById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const includeRelations = req.query.include === 'true';

      const match = await matchService.getMatchById(id, includeRelations);

      const response: ApiResponse<any> = {
        success: true,
        data: match,
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

  // 获取比赛列表
  async getMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const sortBy = req.query.sortBy as string;
      const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'desc';
      const competitionId = req.query.competitionId as string;
      const teamId = req.query.teamId as string;
      const status = req.query.status as string;
      const phase = req.query.phase as string;

      const options: QueryOptions = {
        pagination: { page, limit, sortBy, sortOrder },
        filter: {
          ...(competitionId && { competitionId }),
          ...(teamId && { teamId }),
          ...(status && { status }),
          ...(phase && { phase })
        }
      };

      const { matches, total } = await matchService.getMatches(options);

      const totalPages = Math.ceil(total / limit);

      const response: ApiResponse<any> = {
        success: true,
        data: matches,
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

  // 根据赛事获取比赛
  async getMatchesByCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { competitionId } = req.params;
      const phase = req.query.phase as string;

      const matches = await matchService.getMatchesByCompetition(competitionId, phase);

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

  // 根据队伍获取比赛
  async getMatchesByTeam(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { teamId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const matches = await matchService.getMatchesByTeam(teamId, limit);

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

  // 获取即将进行的比赛
  async getUpcomingMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const matches = await matchService.getUpcomingMatches(limit);

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

  // 获取最近完成的比赛
  async getRecentCompletedMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      const matches = await matchService.getRecentCompletedMatches(limit);

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

  // 获取进行中的比赛
  async getInProgressMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const matches = await matchService.getInProgressMatches();

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

  // 更新比赛结果
  async updateMatchResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const resultData: UpdateMatchResultDto = req.body;

      const match = await matchService.updateMatchResult(id, resultData);

      const response: ApiResponse<any> = {
        success: true,
        data: match,
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

  // 更新比赛状态
  async updateMatchStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const match = await matchService.updateMatchStatus(id, status as MatchStatus);

      const response: ApiResponse<any> = {
        success: true,
        data: match,
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

  // 模拟比赛结果
  async simulateMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const match = await matchService.simulateMatch(id);

      const response: ApiResponse<any> = {
        success: true,
        data: match,
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

export const matchController = new MatchController();