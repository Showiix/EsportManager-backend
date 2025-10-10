// =================================================================
// 电竞赛事模拟系统 - 赛事管理服务
// =================================================================

import { CompetitionRepository } from '../repositories/CompetitionRepository';
import { TeamRepository } from '../repositories/TeamRepository';
import { CompetitionEngine } from '../engines/CompetitionEngine';
import {
  Competition,
  CreateCompetitionDto,
  QueryOptions,
  CompetitionStatus,
  CompetitionType,
  BusinessError,
  ErrorCodes,
  Team,
  Match
} from '../types';
import { redisService } from '../config/redis';
import { logger } from '../utils/logger';

export class CompetitionService {
  private competitionRepository: CompetitionRepository;
  private teamRepository: TeamRepository;
  private competitionEngine: CompetitionEngine;
  private cachePrefix = 'competition';

  constructor() {
    this.competitionRepository = new CompetitionRepository();
    this.teamRepository = new TeamRepository();
    this.competitionEngine = new CompetitionEngine();
  }

  // 创建赛事
  async createCompetition(competitionData: CreateCompetitionDto): Promise<Competition> {
    try {
      // 验证赛事类型在同一赛季中的唯一性
      await this.validateCompetitionTypeUnique(competitionData.seasonId, competitionData.type);

      const competition = await this.competitionRepository.create(competitionData);

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:season:${competition.seasonId}:*`,
        `${this.cachePrefix}:all`
      ]);

      logger.info('Competition created successfully', {
        competitionId: competition.id,
        name: competition.name,
        type: competition.type
      });

      return competition;
    } catch (error) {
      logger.error('Failed to create competition:', error);
      throw error;
    }
  }

  // 获取赛事详情
  async getCompetitionById(id: string, includeRelations: boolean = false): Promise<Competition> {
    const cacheKey = `${this.cachePrefix}:${id}:${includeRelations ? 'full' : 'basic'}`;

    try {
      // 尝试从缓存获取
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const options: QueryOptions = includeRelations ? { include: ['season', 'teams'] } : {};
      const competition = await this.competitionRepository.findById(id, options);

      if (!competition) {
        throw new BusinessError(ErrorCodes.COMPETITION_NOT_ACTIVE, `Competition with id ${id} not found`);
      }

      // 如果需要包含参赛队伍
      if (includeRelations) {
        competition.teams = await this.competitionRepository.getCompetitionTeams(id);
      }

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(competition), 300);

      return competition;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to get competition:', { competitionId: id, error });
      throw new Error('Failed to retrieve competition');
    }
  }

  // 获取赛事列表
  async getCompetitions(options?: QueryOptions): Promise<{ competitions: Competition[]; total: number }> {
    try {
      const [competitions, total] = await Promise.all([
        this.competitionRepository.findAll(options),
        this.competitionRepository.count(options)
      ]);

      return { competitions, total };
    } catch (error) {
      logger.error('Failed to get competitions:', error);
      throw new Error('Failed to retrieve competitions');
    }
  }

  // 根据赛季获取赛事
  async getCompetitionsBySeason(seasonId: string): Promise<Competition[]> {
    const cacheKey = `${this.cachePrefix}:season:${seasonId}:all`;

    try {
      // 尝试从缓存获取
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const competitions = await this.competitionRepository.findBySeason(seasonId);

      // 缓存结果（10分钟）
      await redisService.set(cacheKey, JSON.stringify(competitions), 600);

      return competitions;
    } catch (error) {
      logger.error('Failed to get competitions by season:', { seasonId, error });
      throw new Error('Failed to retrieve competitions by season');
    }
  }

  // 根据类型和年份获取赛事
  async getCompetitionsByTypeAndYear(type: CompetitionType, year: number): Promise<Competition[]> {
    const cacheKey = `${this.cachePrefix}:type:${type}:year:${year}`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const competitions = await this.competitionRepository.findByTypeAndYear(type, year);

      // 缓存结果（30分钟）
      await redisService.set(cacheKey, JSON.stringify(competitions), 1800);

      return competitions;
    } catch (error) {
      logger.error('Failed to get competitions by type and year:', { type, year, error });
      throw new Error('Failed to retrieve competitions by type and year');
    }
  }

  // 更新赛事状态
  async updateCompetitionStatus(id: string, status: CompetitionStatus): Promise<Competition> {
    try {
      const competition = await this.competitionRepository.updateStatus(id, status);

      if (!competition) {
        throw new BusinessError(ErrorCodes.COMPETITION_NOT_ACTIVE, `Competition with id ${id} not found`);
      }

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${id}:*`,
        `${this.cachePrefix}:season:${competition.seasonId}:*`,
        `${this.cachePrefix}:active`
      ]);

      logger.info('Competition status updated successfully', {
        competitionId: id,
        status,
        name: competition.name
      });

      return competition;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to update competition status:', { competitionId: id, status, error });
      throw new Error('Failed to update competition status');
    }
  }

  // 获取活跃赛事
  async getActiveCompetitions(): Promise<Competition[]> {
    const cacheKey = `${this.cachePrefix}:active`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const competitions = await this.competitionRepository.findActive();

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(competitions), 300);

      return competitions;
    } catch (error) {
      logger.error('Failed to get active competitions:', error);
      throw new Error('Failed to retrieve active competitions');
    }
  }

  // 获取即将开始的赛事
  async getUpcomingCompetitions(limit?: number): Promise<Competition[]> {
    const cacheKey = `${this.cachePrefix}:upcoming:${limit || 'all'}`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const competitions = await this.competitionRepository.findUpcoming(limit);

      // 缓存结果（10分钟）
      await redisService.set(cacheKey, JSON.stringify(competitions), 600);

      return competitions;
    } catch (error) {
      logger.error('Failed to get upcoming competitions:', error);
      throw new Error('Failed to retrieve upcoming competitions');
    }
  }

  // 添加参赛队伍
  async addTeamToCompetition(
    competitionId: string,
    teamId: string,
    seed?: number,
    groupName?: string
  ): Promise<void> {
    try {
      const competition = await this.getCompetitionById(competitionId);

      if (competition.status === CompetitionStatus.COMPLETED) {
        throw new BusinessError(
          ErrorCodes.COMPETITION_NOT_ACTIVE,
          'Cannot add teams to completed competition'
        );
      }

      // 验证队伍存在
      const team = await this.teamRepository.findById(teamId);
      if (!team) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `Team with id ${teamId} not found`);
      }

      // 检查队伍数量限制
      const currentTeams = await this.competitionRepository.getCompetitionTeams(competitionId);
      if (currentTeams.length >= competition.maxTeams) {
        throw new BusinessError(
          ErrorCodes.INSUFFICIENT_TEAMS,
          `Competition has reached maximum team limit of ${competition.maxTeams}`
        );
      }

      await this.competitionRepository.addTeam(competitionId, teamId, seed, groupName);

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${competitionId}:*`,
        `team:${teamId}:competitions`
      ]);

      logger.info('Team added to competition successfully', {
        competitionId,
        teamId,
        teamName: team.name,
        seed,
        groupName
      });
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to add team to competition:', { competitionId, teamId, error });
      throw new Error('Failed to add team to competition');
    }
  }

  // 移除参赛队伍
  async removeTeamFromCompetition(competitionId: string, teamId: string): Promise<void> {
    try {
      const competition = await this.getCompetitionById(competitionId);

      if (competition.status === CompetitionStatus.ACTIVE) {
        throw new BusinessError(
          ErrorCodes.COMPETITION_NOT_ACTIVE,
          'Cannot remove teams from active competition'
        );
      }

      const success = await this.competitionRepository.removeTeam(competitionId, teamId);

      if (!success) {
        throw new BusinessError(
          ErrorCodes.TEAM_NOT_FOUND,
          `Team ${teamId} not found in competition ${competitionId}`
        );
      }

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${competitionId}:*`,
        `team:${teamId}:competitions`
      ]);

      logger.info('Team removed from competition successfully', { competitionId, teamId });
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to remove team from competition:', { competitionId, teamId, error });
      throw new Error('Failed to remove team from competition');
    }
  }

  // 生成赛程
  async generateSchedule(competitionId: string): Promise<Match[]> {
    try {
      const competition = await this.getCompetitionById(competitionId, true);

      if (competition.status !== CompetitionStatus.PLANNING) {
        throw new BusinessError(
          ErrorCodes.COMPETITION_NOT_ACTIVE,
          'Can only generate schedule for competitions in planning status'
        );
      }

      if (!competition.teams || competition.teams.length < 2) {
        throw new BusinessError(
          ErrorCodes.INSUFFICIENT_TEAMS,
          'At least 2 teams required to generate schedule'
        );
      }

      // 使用赛制引擎生成赛程
      const matches = this.competitionEngine.generateScheduleByFormat(
        competition.format,
        competition.teams as Team[],
        {
          competitionId,
          phase: 'regular_season',
          format: competition.format.regularSeason?.matchFormat || 'BO3' as any,
          startDate: competition.startDate
        }
      );

      // 这里应该将matches保存到数据库
      // 暂时返回生成的matches

      logger.info('Schedule generated successfully', {
        competitionId,
        matchesCount: matches.length,
        teamsCount: competition.teams.length
      });

      return matches;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to generate schedule:', { competitionId, error });
      throw new Error('Failed to generate schedule');
    }
  }

  // 获取赛事参赛队伍
  async getCompetitionTeams(competitionId: string): Promise<any[]> {
    const cacheKey = `${this.cachePrefix}:${competitionId}:teams`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const teams = await this.competitionRepository.getCompetitionTeams(competitionId);

      // 缓存结果（10分钟）
      await redisService.set(cacheKey, JSON.stringify(teams), 600);

      return teams;
    } catch (error) {
      logger.error('Failed to get competition teams:', { competitionId, error });
      throw new Error('Failed to retrieve competition teams');
    }
  }

  // 验证赛事类型在同一赛季中的唯一性
  private async validateCompetitionTypeUnique(seasonId: string, type: CompetitionType): Promise<void> {
    const existingCompetitions = await this.competitionRepository.findBySeason(seasonId);

    const duplicateType = existingCompetitions.find(comp => comp.type === type);
    if (duplicateType) {
      throw new BusinessError(
        ErrorCodes.INVALID_COMPETITION_FORMAT,
        `Competition type "${type}" already exists in this season`
      );
    }
  }

  // 清除缓存
  private async invalidateCache(patterns: string[]): Promise<void> {
    try {
      for (const pattern of patterns) {
        if (pattern.includes('*')) {
          const keys = await redisService.keys(pattern);
          if (keys.length > 0) {
            await redisService.del(...keys);
          }
        } else {
          await redisService.del(pattern);
        }
      }
    } catch (error) {
      logger.warn('Failed to invalidate cache:', error);
    }
  }
}

// 单例导出
export const competitionService = new CompetitionService();