// =================================================================
// 电竞赛事模拟系统 - 赛事控制器
// =================================================================

import { Request, Response, NextFunction } from 'express';
import { competitionService } from '../services/CompetitionService';
import { scheduleService } from '../services/ScheduleService';
import { matchService } from '../services/MatchService';
import { CreateCompetitionDto, QueryOptions, ApiResponse, CompetitionStatus, CompetitionType } from '../types';

export class CompetitionController {
  // 创建赛事
  async createCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const competitionData: CreateCompetitionDto = req.body;
      const competition = await competitionService.createCompetition(competitionData);

      const response: ApiResponse<any> = {
        success: true,
        data: competition,
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

  // 获取赛事详情
  async getCompetitionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const includeRelations = req.query.include === 'true';

      const competition = await competitionService.getCompetitionById(id, includeRelations);

      const response: ApiResponse<any> = {
        success: true,
        data: competition,
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

  // 获取赛事列表
  async getCompetitions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const sortBy = req.query.sortBy as string;
      const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'desc';
      const seasonId = req.query.seasonId as string;
      const type = req.query.type as string;
      const status = req.query.status as string;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;

      const options: QueryOptions = {
        pagination: { page, limit, sortBy, sortOrder },
        filter: {
          ...(seasonId && { seasonId }),
          ...(type && { type }),
          ...(status && { status }),
          ...(year && { year })
        }
      };

      const { competitions, total } = await competitionService.getCompetitions(options);

      const totalPages = Math.ceil(total / limit);

      const response: ApiResponse<any> = {
        success: true,
        data: competitions,
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

  // 根据赛季获取赛事
  async getCompetitionsBySeason(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { seasonId } = req.params;
      const competitions = await competitionService.getCompetitionsBySeason(seasonId);

      const response: ApiResponse<any> = {
        success: true,
        data: competitions,
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

  // 根据类型和年份获取赛事
  async getCompetitionsByTypeAndYear(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, year } = req.params;
      const competitions = await competitionService.getCompetitionsByTypeAndYear(
        type as CompetitionType,
        parseInt(year)
      );

      const response: ApiResponse<any> = {
        success: true,
        data: competitions,
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

  // 获取活跃赛事
  async getActiveCompetitions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const competitions = await competitionService.getActiveCompetitions();

      const response: ApiResponse<any> = {
        success: true,
        data: competitions,
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

  // 获取即将开始的赛事
  async getUpcomingCompetitions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const competitions = await competitionService.getUpcomingCompetitions(limit);

      const response: ApiResponse<any> = {
        success: true,
        data: competitions,
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

  // 更新赛事状态
  async updateCompetitionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const competition = await competitionService.updateCompetitionStatus(id, status as CompetitionStatus);

      const response: ApiResponse<any> = {
        success: true,
        data: competition,
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

  // 添加参赛队伍
  async addTeamToCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { teamId, seed, groupName } = req.body;

      await competitionService.addTeamToCompetition(id, teamId, seed, groupName);

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

  // 移除参赛队伍
  async removeTeamFromCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, teamId } = req.params;

      await competitionService.removeTeamFromCompetition(id, teamId);

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

  // 获取赛事参赛队伍
  async getCompetitionTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const teams = await competitionService.getCompetitionTeams(id);

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

  // 生成赛程
  async generateSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const matches = await competitionService.generateSchedule(id);

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

  // 获取当前轮次
  async getCurrentRound(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const currentRound = await scheduleService.getCurrentRound(id);

      const response: ApiResponse<any> = {
        success: true,
        data: { currentRound },
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

  // 模拟整轮比赛
  async simulateRound(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await scheduleService.simulateRound(id);

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

  // 结束赛事（常规赛完成）
  async finishCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const competition = await competitionService.finishCompetition(id);

      const response: ApiResponse<any> = {
        success: true,
        data: competition,
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

  // 获取当前赛季活跃赛事的当前轮次
  async getCurrentSeasonCurrentRound(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 首先尝试获取活跃的赛事
      let competitions = await competitionService.getActiveCompetitions();

      // 如果没有活跃的赛事，尝试获取最近完成的赛事
      if (competitions.length === 0) {
        const options: QueryOptions = {
          pagination: { page: 1, limit: 1, sortBy: 'updated_at', sortOrder: 'desc' },
          filter: { status: 'completed' }
        };
        const { competitions: completedCompetitions } = await competitionService.getCompetitions(options);
        competitions = completedCompetitions;
      }

      if (competitions.length === 0) {
        const response: ApiResponse<any> = {
          success: true,
          data: { currentRound: 1, totalRounds: 18 },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        res.json(response);
        return;
      }

      // 使用第一个赛事（活跃或最近完成的）
      const currentRound = await scheduleService.getCurrentRound(competitions[0].id);

      // 获取总轮次（从比赛中获取最大轮次）
      const matches = await matchService.getMatchesByCompetition(String(competitions[0].id));
      const totalRounds = matches && matches.length > 0
        ? Math.max(...matches.map((m: any) => m.roundNumber || 0))
        : 18;

      const response: ApiResponse<any> = {
        success: true,
        data: {
          currentRound,
          totalRounds,
          competitionStatus: competitions[0].status
        },
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

  // 获取当前赛季所有比赛
  async getCurrentSeasonMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 首先尝试获取活跃的赛事
      let competitions = await competitionService.getActiveCompetitions();

      // 如果没有活跃的赛事，尝试获取最近完成的赛事
      if (competitions.length === 0) {
        const options: QueryOptions = {
          pagination: { page: 1, limit: 1, sortBy: 'updated_at', sortOrder: 'desc' },
          filter: { status: 'completed' }
        };
        const { competitions: completedCompetitions } = await competitionService.getCompetitions(options);
        competitions = completedCompetitions;
      }

      if (competitions.length === 0) {
        const response: ApiResponse<any> = {
          success: true,
          data: [],
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          }
        };
        res.json(response);
        return;
      }

      // 获取该赛事的所有比赛
      const matches = await matchService.getMatchesByCompetition(String(competitions[0].id));

      const response: ApiResponse<any> = {
        success: true,
        data: matches || [],
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

  // 获取当前赛季的赛事详情
  async getCurrentSeasonCompetition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 首先尝试获取活跃的赛事
      let competitions = await competitionService.getActiveCompetitions();

      // 如果没有活跃的赛事，尝试获取最近完成的赛事（按更新时间倒序）
      if (competitions.length === 0) {
        const options: QueryOptions = {
          pagination: { page: 1, limit: 1, sortBy: 'updated_at', sortOrder: 'desc' },
          filter: { status: 'completed' }
        };
        const { competitions: completedCompetitions } = await competitionService.getCompetitions(options);
        competitions = completedCompetitions;
      }

      if (competitions.length === 0) {
        const response: ApiResponse<any> = {
          success: false,
          data: null,
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || 'unknown'
          },
          error: {
            code: 'NOT_FOUND',
            message: 'No competition found for current season'
          }
        };
        res.status(404).json(response);
        return;
      }

      // 返回第一个赛事（活跃或最近完成的）
      const response: ApiResponse<any> = {
        success: true,
        data: competitions[0],
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

export const competitionController = new CompetitionController();