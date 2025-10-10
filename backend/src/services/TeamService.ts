// =================================================================
// 电竞赛事模拟系统 - 战队管理服务
// =================================================================

import { TeamRepository } from '../repositories/TeamRepository';
import { Team, CreateTeamDto, UpdateTeamDto, QueryOptions, TeamStatistics, BusinessError, ErrorCodes } from '../types';
import { redisService } from '../config/redis';
import { logger } from '../utils/logger';

export class TeamService {
  private teamRepository: TeamRepository;
  private cachePrefix = 'team';

  constructor() {
    this.teamRepository = new TeamRepository();
  }

  // 创建战队
  async createTeam(teamData: CreateTeamDto): Promise<Team> {
    try {
      // 验证战队名称唯一性
      await this.validateTeamNameUnique(teamData.name, teamData.regionId);

      const team = await this.teamRepository.create(teamData);

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:region:${team.regionId}:teams`,
        `${this.cachePrefix}:all`
      ]);

      logger.info('Team created successfully', { teamId: team.id, name: team.name });
      return team;
    } catch (error) {
      logger.error('Failed to create team:', error);
      throw error;
    }
  }

  // 获取战队详情
  async getTeamById(id: string, includeRelations: boolean = false): Promise<Team> {
    const cacheKey = `${this.cachePrefix}:${id}:${includeRelations ? 'full' : 'basic'}`;

    try {
      // 尝试从缓存获取
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const options: QueryOptions = includeRelations ? { include: ['region'] } : {};
      const team = await this.teamRepository.findById(id, options);

      if (!team) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `Team with id ${id} not found`);
      }

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(team), 300);

      return team;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to get team:', { teamId: id, error });
      throw new Error('Failed to retrieve team');
    }
  }

  // 获取战队列表
  async getTeams(options?: QueryOptions): Promise<{ teams: Team[]; total: number }> {
    try {
      const [teams, total] = await Promise.all([
        this.teamRepository.findAll(options),
        this.teamRepository.count(options)
      ]);

      return { teams, total };
    } catch (error) {
      logger.error('Failed to get teams:', error);
      throw new Error('Failed to retrieve teams');
    }
  }

  // 根据赛区获取战队
  async getTeamsByRegion(regionId: string): Promise<Team[]> {
    const cacheKey = `${this.cachePrefix}:region:${regionId}:teams`;

    try {
      // 尝试从缓存获取
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const teams = await this.teamRepository.findByRegion(regionId);

      // 缓存结果（10分钟）
      await redisService.set(cacheKey, JSON.stringify(teams), 600);

      return teams;
    } catch (error) {
      logger.error('Failed to get teams by region:', { regionId, error });
      throw new Error('Failed to retrieve teams by region');
    }
  }

  // 更新战队信息
  async updateTeam(id: string, updateData: UpdateTeamDto): Promise<Team> {
    try {
      // 如果更新名称，验证唯一性
      if (updateData.name) {
        await this.validateTeamNameUnique(updateData.name, updateData.regionId, id);
      }

      const team = await this.teamRepository.update(id, updateData);

      if (!team) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `Team with id ${id} not found`);
      }

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${id}:*`,
        `${this.cachePrefix}:region:${team.regionId}:teams`,
        `${this.cachePrefix}:all`
      ]);

      logger.info('Team updated successfully', { teamId: id, updates: Object.keys(updateData) });
      return team;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to update team:', { teamId: id, error });
      throw new Error('Failed to update team');
    }
  }

  // 删除战队
  async deleteTeam(id: string): Promise<void> {
    try {
      const team = await this.getTeamById(id);
      const success = await this.teamRepository.delete(id);

      if (!success) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `Team with id ${id} not found`);
      }

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${id}:*`,
        `${this.cachePrefix}:region:${team.regionId}:teams`,
        `${this.cachePrefix}:all`
      ]);

      logger.info('Team deleted successfully', { teamId: id, teamName: team.name });
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to delete team:', { teamId: id, error });
      throw new Error('Failed to delete team');
    }
  }

  // 获取战队统计数据
  async getTeamStatistics(teamId: string, seasonYear?: number): Promise<TeamStatistics> {
    const cacheKey = `${this.cachePrefix}:${teamId}:stats:${seasonYear || 'current'}`;

    try {
      // 尝试从缓存获取
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const stats = await this.calculateTeamStatistics(teamId, seasonYear);

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(stats), 300);

      return stats;
    } catch (error) {
      logger.error('Failed to get team statistics:', { teamId, seasonYear, error });
      throw new Error('Failed to retrieve team statistics');
    }
  }

  // 获取战队比赛历史
  async getTeamMatches(teamId: string, limit?: number): Promise<any[]> {
    try {
      // 验证团队存在性
      await this.getTeamById(teamId);
      return await this.teamRepository.getTeamMatches(teamId, limit);
    } catch (error) {
      logger.error('Failed to get team matches:', { teamId, error });
      throw new Error('Failed to retrieve team matches');
    }
  }

  // 计算战队统计数据
  private async calculateTeamStatistics(teamId: string, seasonYear?: number): Promise<TeamStatistics> {
    const [matches, scores, baseStats] = await Promise.all([
      this.teamRepository.getTeamMatches(teamId),
      this.teamRepository.getTeamScores(teamId, seasonYear),
      this.teamRepository.getTeamStatistics(teamId, seasonYear)
    ]);

    // 过滤指定年份的比赛
    const filteredMatches = seasonYear
      ? matches.filter(match => {
          const matchDate = new Date(match.completed_at || match.scheduled_at);
          return matchDate.getFullYear() === seasonYear;
        })
      : matches;

    const completedMatches = filteredMatches.filter(match => match.status === 'completed');
    const wins = completedMatches.filter(match => match.winner_id === teamId);
    const losses = completedMatches.filter(match =>
      match.winner_id && match.winner_id !== teamId
    );

    const winRate = completedMatches.length > 0
      ? Math.round((wins.length / completedMatches.length) * 100 * 100) / 100
      : 0;

    const totalPoints = scores.reduce((sum, score) => sum + score.points, 0);

    // 计算各个赛事的积分
    const springPoints = scores
      .filter(score => score.competition_type === 'spring')
      .reduce((sum, score) => sum + score.points, 0);

    const msiPoints = scores
      .filter(score => score.competition_type === 'msi')
      .reduce((sum, score) => sum + score.points, 0);

    const summerPoints = scores
      .filter(score => score.competition_type === 'summer')
      .reduce((sum, score) => sum + score.points, 0);

    const worldsPoints = scores
      .filter(score => score.competition_type === 'worlds')
      .reduce((sum, score) => sum + score.points, 0);

    return {
      id: baseStats?.id || '',
      teamId,
      seasonYear: seasonYear || new Date().getFullYear(),
      totalPoints,
      springPoints,
      msiPoints,
      summerPoints,
      worldsPoints,
      currentRanking: baseStats?.current_ranking,
      peakRanking: baseStats?.peak_ranking,
      matchesPlayed: completedMatches.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      lastUpdated: new Date()
    };
  }

  // 验证战队名称唯一性
  private async validateTeamNameUnique(name: string, regionId?: string, excludeId?: string): Promise<void> {
    const filter: any = { name };
    if (regionId) {
      filter.regionId = regionId;
    }

    const { teams } = await this.getTeams({ filter, pagination: { limit: 1 } });

    if (teams && teams.length > 0 && teams[0].id !== excludeId) {
      throw new BusinessError(
        ErrorCodes.TEAM_NOT_FOUND, // 暂时复用错误码，实际应该用TEAM_NAME_DUPLICATE
        `Team name "${name}" already exists in this region`
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
export const teamService = new TeamService();