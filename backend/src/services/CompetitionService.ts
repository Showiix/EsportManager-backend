// =================================================================
// 电竞赛事模拟系统 - 赛事管理服务
// =================================================================

import { CompetitionRepository } from '../repositories/CompetitionRepository';
import { TeamRepository } from '../repositories/TeamRepository';
import { MatchRepository } from '../repositories/MatchRepository';
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
  private matchRepository: MatchRepository;
  private competitionEngine: CompetitionEngine;
  private cachePrefix = 'competition';

  constructor() {
    this.competitionRepository = new CompetitionRepository();
    this.teamRepository = new TeamRepository();
    this.matchRepository = new MatchRepository();
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
      logger.info('Starting schedule generation', {
        competitionId,
        timestamp: new Date().toISOString()
      });

      const competition = await this.getCompetitionById(competitionId, true);

      logger.debug('Competition retrieved', {
        competitionId,
        competitionName: competition.name,
        competitionStatus: competition.status,
        competitionFormat: JSON.stringify(competition.format)
      });

      // 检查赛事状态
      if (competition.status !== CompetitionStatus.PLANNING) {
        logger.warn('Competition status check for schedule generation', {
          competitionId,
          currentStatus: competition.status,
          preferredStatus: CompetitionStatus.PLANNING
        });

        // 如果赛事已经是 ACTIVE 状态，说明已经生成过赛程
        if (competition.status === CompetitionStatus.ACTIVE) {
          logger.info('Competition is already active with generated schedule', {
            competitionId,
            status: competition.status
          });
          // 不抛出错误，允许继续执行（会生成新的赛程）
        } else {
          // 其他状态（如 COMPLETED）不允许生成赛程
          throw new BusinessError(
            ErrorCodes.COMPETITION_NOT_ACTIVE,
            `Cannot generate schedule for competition in ${competition.status} status. Only PLANNING or ACTIVE status allowed.`
          );
        }
      }

      if (!competition.teams || competition.teams.length < 2) {
        logger.error('Insufficient teams for schedule generation', {
          competitionId,
          teamsCount: competition.teams?.length || 0
        });
        throw new BusinessError(
          ErrorCodes.INSUFFICIENT_TEAMS,
          'At least 2 teams required to generate schedule'
        );
      }

      // 验证format配置
      if (!competition.format) {
        logger.error('Competition format is missing', { competitionId });
        throw new BusinessError(
          ErrorCodes.INVALID_COMPETITION_FORMAT,
          'Competition format configuration is missing'
        );
      }

      // 确保format是一个对象，如果是字符串则转换为对象
      let formatConfig: any = competition.format;
      if (typeof formatConfig === 'string') {
        logger.warn('Competition format is a string, converting to object', {
          competitionId,
          formatString: formatConfig
        });
        // 默认将字符串格式转换为league类型
        formatConfig = {
          type: 'league',
          regularSeason: {
            matchFormat: formatConfig as any || 'BO3'
          }
        };
      }

      // 确保format有type字段
      if (!formatConfig.type) {
        logger.warn('Competition format missing type field, defaulting to league', {
          competitionId,
          format: JSON.stringify(formatConfig)
        });
        formatConfig = {
          type: 'league',
          ...formatConfig,
          regularSeason: {
            matchFormat: formatConfig.regularSeason?.matchFormat || 'BO3'
          }
        };
      }

      logger.info('Format configuration validated', {
        competitionId,
        formatType: formatConfig.type,
        formatConfig: JSON.stringify(formatConfig)
      });

      // 检查是否是春季赛或夏季赛（常规赛）
      const isRegularSeasonCompetition = competition.type === 'spring' || competition.type === 'summer';
      let matches: Match[] = [];

      if (isRegularSeasonCompetition && formatConfig.type === 'league') {
        // 按赛区分别生成赛程（常规赛）
        logger.info('Generating regional schedules for regular season', {
          competitionId,
          totalTeams: competition.teams.length
        });

        // 按赛区分组队伍
        const teamsByRegion = (competition.teams as any[]).reduce((acc, team) => {
          const regionId = team.region_id || team.regionId;
          if (!acc[regionId]) {
            acc[regionId] = [];
          }
          acc[regionId].push({
            id: team.team_id || team.id,
            name: team.team_name || team.name,
            regionId: regionId,
            powerRating: team.power_rating || team.powerRating || 50
          } as Team);
          return acc;
        }, {} as Record<string, Team[]>);

        logger.info('Teams grouped by region', {
          regions: Object.keys(teamsByRegion),
          counts: Object.entries(teamsByRegion).map(([region, teams]) => ({
            region,
            count: teams.length
          }))
        });

        let matchNumber = 0;

        // 为每个赛区生成赛程
        for (const [regionId, teams] of Object.entries(teamsByRegion)) {
          logger.info('Generating schedule for region', {
            regionId,
            teamsCount: teams.length
          });

          const regionalMatches = this.competitionEngine.generateRegularSeasonSchedule(
            teams,
            {
              competitionId,
              phase: 'regular_season',
              format: formatConfig.regularSeason?.matchFormat || 'BO3' as any,
              startDate: competition.startDate
            }
          );

          // 更新matchNumber为全局编号
          regionalMatches.forEach(match => {
            matchNumber++;
            match.matchNumber = matchNumber;
          });

          matches.push(...regionalMatches);

          logger.info('Regional schedule generated', {
            regionId,
            matchesCount: regionalMatches.length,
            rounds: regionalMatches.length > 0 ? Math.max(...regionalMatches.map(m => m.roundNumber)) : 0
          });
        }

        logger.info('All regional schedules generated', {
          competitionId,
          totalMatches: matches.length,
          regions: Object.keys(teamsByRegion).length
        });
      } else {
        // 其他赛制（季后赛、MSI、世界赛等）直接使用原有逻辑
        matches = this.competitionEngine.generateScheduleByFormat(
          formatConfig,
          competition.teams as Team[],
          {
            competitionId,
            phase: 'regular_season',
            format: formatConfig.regularSeason?.matchFormat || 'BO3' as any,
            startDate: competition.startDate
          }
        );
      }

      logger.info('Matches generated by engine', {
        competitionId,
        matchesCount: matches.length
      });

      // 批量保存比赛到数据库
      logger.debug('Saving matches to database', {
        competitionId,
        matchesCount: matches.length
      });

      const createdMatches = await this.matchRepository.createBatch(
        matches.map(match => ({
          ...match,
          id: undefined as any // 让数据库生成ID
        }))
      );

      logger.info('Matches saved to database', {
        competitionId,
        createdMatchesCount: createdMatches.length
      });

      // 更新赛事状态为活跃
      await this.updateCompetitionStatus(competitionId, CompetitionStatus.ACTIVE);

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${competitionId}:*`,
        `match:competition:${competitionId}:*`
      ]);

      logger.info('Schedule generated and saved successfully', {
        competitionId,
        matchesCount: createdMatches.length,
        teamsCount: competition.teams.length
      });

      return createdMatches;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to generate schedule:', {
        competitionId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
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

  // 结束赛事（常规赛完成）
  async finishCompetition(competitionId: string): Promise<Competition> {
    try {
      logger.info('Finishing competition', { competitionId });

      const competition = await this.getCompetitionById(competitionId);

      // 检查赛事状态
      if (competition.status === CompetitionStatus.COMPLETED) {
        logger.warn('Competition already completed', { competitionId });
        return competition;
      }

      if (competition.status !== CompetitionStatus.ACTIVE) {
        throw new BusinessError(
          ErrorCodes.COMPETITION_NOT_ACTIVE,
          `Cannot finish competition in ${competition.status} status. Only active competitions can be finished.`
        );
      }

      // 检查所有比赛是否完成 - 使用数据库查询
      const { db } = await import('../config/database');
      const result = await db.query(
        `SELECT COUNT(*) as count
         FROM matches
         WHERE competition_id = $1 AND status != 'completed'`,
        [competitionId]
      );

      const unfinishedCount = parseInt(result.rows[0].count);
      if (unfinishedCount > 0) {
        throw new BusinessError(
          ErrorCodes.REGULAR_SEASON_NOT_COMPLETE,
          `还有 ${unfinishedCount} 场比赛未完成`
        );
      }

      // 更新赛事状态为已完成
      const updatedCompetition = await this.updateCompetitionStatus(competitionId, CompetitionStatus.COMPLETED);

      logger.info('Competition finished successfully', {
        competitionId,
        name: updatedCompetition.name
      });

      return updatedCompetition;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to finish competition:', {
        competitionId,
        error: error instanceof Error ? error.message : error
      });
      throw new Error('Failed to finish competition');
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