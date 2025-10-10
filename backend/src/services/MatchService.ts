// =================================================================
// 电竞赛事模拟系统 - 比赛管理服务
// =================================================================

import { MatchRepository } from '../repositories/MatchRepository';
import { TeamRepository } from '../repositories/TeamRepository';
import { CompetitionRepository } from '../repositories/CompetitionRepository';
import {
  Match,
  UpdateMatchResultDto,
  QueryOptions,
  MatchStatus,
  BusinessError,
  ErrorCodes,
  Team
} from '../types';
import { redisService } from '../config/redis';
import { logger } from '../utils/logger';

export class MatchService {
  private matchRepository: MatchRepository;
  private teamRepository: TeamRepository;
  private competitionRepository: CompetitionRepository;
  private cachePrefix = 'match';

  constructor() {
    this.matchRepository = new MatchRepository();
    this.teamRepository = new TeamRepository();
    this.competitionRepository = new CompetitionRepository();
  }

  // 获取比赛详情
  async getMatchById(id: string, includeRelations: boolean = false): Promise<Match> {
    const cacheKey = `${this.cachePrefix}:${id}:${includeRelations ? 'full' : 'basic'}`;

    try {
      // 尝试从缓存获取
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const options: QueryOptions = includeRelations
        ? { include: ['teams', 'competition'] }
        : {};

      const match = await this.matchRepository.findById(id, options);

      if (!match) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `Match with id ${id} not found`);
      }

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(match), 300);

      return match;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to get match:', { matchId: id, error });
      throw new Error('Failed to retrieve match');
    }
  }

  // 获取比赛列表
  async getMatches(options?: QueryOptions): Promise<{ matches: Match[]; total: number }> {
    try {
      const [matches, total] = await Promise.all([
        this.matchRepository.findAll(options),
        this.matchRepository.count(options)
      ]);

      return { matches, total };
    } catch (error) {
      logger.error('Failed to get matches:', error);
      throw new Error('Failed to retrieve matches');
    }
  }

  // 根据赛事获取比赛
  async getMatchesByCompetition(competitionId: string, phase?: string): Promise<Match[]> {
    const cacheKey = `${this.cachePrefix}:competition:${competitionId}:${phase || 'all'}`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const matches = await this.matchRepository.findByCompetition(competitionId, phase);

      // 缓存结果（10分钟）
      await redisService.set(cacheKey, JSON.stringify(matches), 600);

      return matches;
    } catch (error) {
      logger.error('Failed to get matches by competition:', { competitionId, phase, error });
      throw new Error('Failed to retrieve matches by competition');
    }
  }

  // 根据队伍获取比赛
  async getMatchesByTeam(teamId: string, limit?: number): Promise<Match[]> {
    const cacheKey = `${this.cachePrefix}:team:${teamId}:${limit || 'all'}`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const matches = await this.matchRepository.findByTeam(teamId, limit);

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(matches), 300);

      return matches;
    } catch (error) {
      logger.error('Failed to get matches by team:', { teamId, limit, error });
      throw new Error('Failed to retrieve matches by team');
    }
  }

  // 获取即将进行的比赛
  async getUpcomingMatches(limit?: number): Promise<Match[]> {
    const cacheKey = `${this.cachePrefix}:upcoming:${limit || 'all'}`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const matches = await this.matchRepository.findUpcoming(limit);

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(matches), 300);

      return matches;
    } catch (error) {
      logger.error('Failed to get upcoming matches:', error);
      throw new Error('Failed to retrieve upcoming matches');
    }
  }

  // 获取最近完成的比赛
  async getRecentCompletedMatches(limit?: number): Promise<Match[]> {
    const cacheKey = `${this.cachePrefix}:completed:${limit || 'all'}`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const matches = await this.matchRepository.findRecentCompleted(limit);

      // 缓存结果（5分钟）
      await redisService.set(cacheKey, JSON.stringify(matches), 300);

      return matches;
    } catch (error) {
      logger.error('Failed to get recent completed matches:', error);
      throw new Error('Failed to retrieve recent completed matches');
    }
  }

  // 获取进行中的比赛
  async getInProgressMatches(): Promise<Match[]> {
    const cacheKey = `${this.cachePrefix}:in_progress`;

    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const matches = await this.matchRepository.findInProgress();

      // 缓存结果（1分钟）
      await redisService.set(cacheKey, JSON.stringify(matches), 60);

      return matches;
    } catch (error) {
      logger.error('Failed to get in-progress matches:', error);
      throw new Error('Failed to retrieve in-progress matches');
    }
  }

  // 更新比赛结果
  async updateMatchResult(id: string, resultData: UpdateMatchResultDto): Promise<Match> {
    try {
      const match = await this.getMatchById(id);

      // 验证比赛状态
      if (match.status === MatchStatus.COMPLETED) {
        throw new BusinessError(
          ErrorCodes.MATCH_ALREADY_COMPLETED,
          'Cannot update result of completed match'
        );
      }

      if (match.status === MatchStatus.CANCELLED) {
        throw new BusinessError(
          ErrorCodes.INVALID_MATCH_RESULT,
          'Cannot update result of cancelled match'
        );
      }

      // 验证比分和获胜者
      this.validateMatchResult(resultData);

      // 确定获胜者
      if (!resultData.winnerId && resultData.scoreA !== undefined && resultData.scoreB !== undefined) {
        if (resultData.scoreA > resultData.scoreB) {
          resultData.winnerId = match.teamAId;
        } else if (resultData.scoreB > resultData.scoreA) {
          resultData.winnerId = match.teamBId;
        }
        // 平局情况下 winnerId 保持为空
      }

      // 设置完成时间
      if (!resultData.completedAt) {
        resultData.completedAt = new Date();
      }

      const updatedMatch = await this.matchRepository.updateResult(id, resultData);

      if (!updatedMatch) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `Match with id ${id} not found`);
      }

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${id}:*`,
        `${this.cachePrefix}:competition:${match.competitionId}:*`,
        `${this.cachePrefix}:team:${match.teamAId}:*`,
        `${this.cachePrefix}:team:${match.teamBId}:*`,
        `${this.cachePrefix}:completed:*`,
        `${this.cachePrefix}:upcoming:*`
      ]);

      logger.info('Match result updated successfully', {
        matchId: id,
        scoreA: resultData.scoreA,
        scoreB: resultData.scoreB,
        winnerId: resultData.winnerId
      });

      return updatedMatch;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to update match result:', { matchId: id, error });
      throw new Error('Failed to update match result');
    }
  }

  // 更新比赛状态
  async updateMatchStatus(id: string, status: MatchStatus): Promise<Match> {
    try {
      const match = await this.getMatchById(id);

      // 验证状态转换
      this.validateStatusTransition(match.status, status);

      const updatedMatch = await this.matchRepository.updateStatus(id, status);

      if (!updatedMatch) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, `Match with id ${id} not found`);
      }

      // 清除相关缓存
      await this.invalidateCache([
        `${this.cachePrefix}:${id}:*`,
        `${this.cachePrefix}:competition:${match.competitionId}:*`,
        `${this.cachePrefix}:in_progress`,
        `${this.cachePrefix}:upcoming:*`
      ]);

      logger.info('Match status updated successfully', { matchId: id, status });

      return updatedMatch;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to update match status:', { matchId: id, status, error });
      throw new Error('Failed to update match status');
    }
  }

  // 模拟比赛结果
  async simulateMatch(id: string): Promise<Match> {
    try {
      const match = await this.getMatchById(id, true);

      if (match.status === MatchStatus.COMPLETED) {
        throw new BusinessError(
          ErrorCodes.MATCH_ALREADY_COMPLETED,
          'Match is already completed'
        );
      }

      // 获取队伍信息来计算模拟结果
      const [teamA, teamB] = await Promise.all([
        this.teamRepository.findById(match.teamAId),
        this.teamRepository.findById(match.teamBId)
      ]);

      if (!teamA || !teamB) {
        throw new BusinessError(ErrorCodes.TEAM_NOT_FOUND, 'One or both teams not found');
      }

      // 模拟比赛结果
      const simulationResult = this.simulateMatchResult(teamA, teamB, match.format);

      // 更新比赛结果
      const resultData: UpdateMatchResultDto = {
        scoreA: simulationResult.scoreA,
        scoreB: simulationResult.scoreB,
        winnerId: simulationResult.winnerId,
        completedAt: new Date()
      };

      const updatedMatch = await this.updateMatchResult(id, resultData);

      logger.info('Match simulated successfully', {
        matchId: id,
        teamA: teamA.name,
        teamB: teamB.name,
        result: `${simulationResult.scoreA}:${simulationResult.scoreB}`
      });

      return updatedMatch;
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to simulate match:', { matchId: id, error });
      throw new Error('Failed to simulate match');
    }
  }

  // 批量创建比赛
  async createMatches(matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Match[]> {
    try {
      const createdMatches = await this.matchRepository.createBatch(matches);

      // 清除相关缓存
      const competitionIds = [...new Set(matches.map(m => m.competitionId))];
      const cachePatterns = [
        ...competitionIds.map(id => `${this.cachePrefix}:competition:${id}:*`),
        `${this.cachePrefix}:upcoming:*`
      ];

      await this.invalidateCache(cachePatterns);

      logger.info('Matches created successfully', { count: createdMatches.length });

      return createdMatches;
    } catch (error) {
      logger.error('Failed to create matches:', error);
      throw new Error('Failed to create matches');
    }
  }

  // 验证比赛结果
  private validateMatchResult(resultData: UpdateMatchResultDto): void {
    if (resultData.scoreA !== undefined && resultData.scoreB !== undefined) {
      if (resultData.scoreA < 0 || resultData.scoreB < 0) {
        throw new BusinessError(ErrorCodes.INVALID_MATCH_RESULT, 'Scores cannot be negative');
      }

      if (resultData.scoreA === resultData.scoreB && resultData.scoreA > 0) {
        throw new BusinessError(ErrorCodes.INVALID_MATCH_RESULT, 'Match cannot end in a tie');
      }
    }

    if (resultData.winnerId && resultData.scoreA !== undefined && resultData.scoreB !== undefined) {
      // 这里需要更复杂的验证逻辑，暂时简化
    }
  }

  // 验证状态转换
  private validateStatusTransition(currentStatus: MatchStatus, newStatus: MatchStatus): void {
    const validTransitions: Record<MatchStatus, MatchStatus[]> = {
      [MatchStatus.SCHEDULED]: [MatchStatus.IN_PROGRESS, MatchStatus.CANCELLED],
      [MatchStatus.IN_PROGRESS]: [MatchStatus.COMPLETED, MatchStatus.CANCELLED],
      [MatchStatus.COMPLETED]: [], // 已完成的比赛不能改变状态
      [MatchStatus.CANCELLED]: [MatchStatus.SCHEDULED] // 取消的比赛可以重新安排
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BusinessError(
        ErrorCodes.INVALID_MATCH_RESULT,
        `Cannot transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  // 模拟比赛结果算法
  private simulateMatchResult(teamA: Team, teamB: Team, format: string): {
    scoreA: number;
    scoreB: number;
    winnerId: string;
  } {
    // 基于战力值的概率计算
    const powerDiff = teamA.powerRating - teamB.powerRating;
    const baseWinProbA = 0.5 + (powerDiff / 200); // 战力差值转换为胜率
    const winProbA = Math.max(0.1, Math.min(0.9, baseWinProbA)); // 限制在10%-90%之间

    // 根据赛制确定获胜所需局数
    const maxGames = format === 'BO5' ? 5 : format === 'BO3' ? 3 : 1;
    const winCondition = Math.ceil(maxGames / 2);

    let scoreA = 0;
    let scoreB = 0;

    // 模拟每局比赛
    for (let game = 0; game < maxGames; game++) {
      const random = Math.random();
      if (random < winProbA) {
        scoreA++;
      } else {
        scoreB++;
      }

      // 检查是否已经决出胜负
      if (scoreA >= winCondition || scoreB >= winCondition) {
        break;
      }
    }

    const winnerId = scoreA > scoreB ? teamA.id : teamB.id;

    return { scoreA, scoreB, winnerId };
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
export const matchService = new MatchService();