// =================================================================
// 电竞赛事模拟系统 - 赛程管理服务
// =================================================================

import { MatchRepository } from '../repositories/MatchRepository';
import { TeamRepository } from '../repositories/TeamRepository';
import { CompetitionRepository } from '../repositories/CompetitionRepository';
import { rankingService } from './RankingService';
import { matchService } from './MatchService';
import {
  Match,
  Team,
  Competition,
  BusinessError,
  ErrorCodes,
  MatchStatus,
  MatchFormat
} from '../types';
import { logger } from '../utils/logger';

// 比赛模拟结果
export interface MatchSimulationResult {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homePoints: number;
  awayPoints: number;
  winner: string;
  details: GameDetail[];
}

// 小局详情
export interface GameDetail {
  game: number;
  winner: string;
  duration: number; // 比赛时长（分钟）
}

// 轮次模拟结果
export interface RoundSimulationResult {
  competitionId: string;
  currentRound: number;
  matchesSimulated: number;
  results: MatchSimulationResult[];
  nextRound: number;
  isRoundComplete: boolean;
}

export class ScheduleService {
  private matchRepository: MatchRepository;
  private teamRepository: TeamRepository;
  private competitionRepository: CompetitionRepository;

  // 模拟算法参数
  private readonly K_VALUE = 15; // 战力差距影响系数
  private readonly HOME_ADVANTAGE = 2; // 主场优势
  private readonly UPSET_FACTOR = 0.1; // 爆冷因子

  constructor() {
    this.matchRepository = new MatchRepository();
    this.teamRepository = new TeamRepository();
    this.competitionRepository = new CompetitionRepository();
  }

  // 获取赛事当前轮次
  async getCurrentRound(competitionId: string): Promise<number> {
    try {
      // 查询该赛事所有常规赛比赛
      const allMatches = await this.matchRepository.findAll({
        filter: {
          competitionId,
          phase: 'regular_season'
        }
      });

      if (allMatches.length === 0) {
        return 1; // 第一轮
      }

      // 按轮次分组统计
      const roundStats = allMatches.reduce((acc: Map<number, {total: number, completed: number}>, match) => {
        const round = match.roundNumber || 1;
        if (!acc.has(round)) {
          acc.set(round, { total: 0, completed: 0 });
        }
        const stats = acc.get(round)!;
        stats.total++;
        if (match.status === MatchStatus.COMPLETED) {
          stats.completed++;
        }
        return acc;
      }, new Map());

      // 找到第一个未完成的轮次
      const sortedRounds = Array.from(roundStats.keys()).sort((a, b) => a - b);

      for (const round of sortedRounds) {
        const stats = roundStats.get(round)!;
        if (stats.completed < stats.total) {
          // 有未完成的比赛，这就是当前轮次
          logger.info('Current round determined', {
            competitionId,
            round,
            completed: stats.completed,
            total: stats.total
          });
          return round;
        }
      }

      // 所有轮次都完成了，返回下一轮
      const lastRound = sortedRounds[sortedRounds.length - 1];
      return lastRound + 1;
    } catch (error) {
      logger.error('Failed to get current round:', { competitionId, error });
      throw new Error('Failed to get current round');
    }
  }

  // 模拟整轮比赛
  async simulateRound(competitionId: string): Promise<RoundSimulationResult> {
    try {
      logger.info('Starting round simulation request', {
        competitionId,
        timestamp: new Date().toISOString()
      });

      // 获取赛事信息
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        logger.error('Competition not found', { competitionId });
        throw new BusinessError(
          ErrorCodes.COMPETITION_NOT_ACTIVE,
          `Competition with id ${competitionId} not found`
        );
      }

      logger.debug('Competition found', {
        competitionId,
        competitionName: competition.name,
        competitionStatus: competition.status
      });

      // 获取当前轮次
      const currentRound = await this.getCurrentRound(competitionId);
      logger.info('Current round determined', { competitionId, currentRound });

      // 获取当前轮次所有未完成的比赛
      const matches = await this.matchRepository.findAll({
        filter: {
          competitionId,
          phase: 'regular_season',
          status: MatchStatus.SCHEDULED
        }
      });

      logger.debug('Matches retrieved', {
        competitionId,
        totalScheduledMatches: matches.length
      });

      const roundMatches = matches.filter(m => m.roundNumber === currentRound);

      if (roundMatches.length === 0) {
        logger.warn('No pending matches for round', {
          competitionId,
          currentRound,
          totalScheduledMatches: matches.length
        });
        throw new BusinessError(
          ErrorCodes.INVALID_MATCH_RESULT,
          `No pending matches found for round ${currentRound}`
        );
      }

      logger.info('Starting round simulation', {
        competitionId,
        currentRound,
        matchesCount: roundMatches.length
      });

      // 逐场模拟比赛
      const results: MatchSimulationResult[] = [];

      for (const match of roundMatches) {
        try {
          logger.debug('Simulating match', {
            matchId: match.id,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            teamAIdType: typeof match.teamAId,
            teamBIdType: typeof match.teamBId
          });

          // 确保ID类型一致（将数字转为字符串）
          const teamAIdStr = String(match.teamAId);
          const teamBIdStr = String(match.teamBId);

          // 获取参赛队伍
          const [homeTeam, awayTeam] = await Promise.all([
            this.teamRepository.findById(teamAIdStr),
            this.teamRepository.findById(teamBIdStr)
          ]);

          if (!homeTeam || !awayTeam) {
            logger.error('Teams not found for match', {
              matchId: match.id,
              teamAId: teamAIdStr,
              teamBId: teamBIdStr,
              homeTeamFound: !!homeTeam,
              awayTeamFound: !!awayTeam
            });
            continue;
          }

          logger.debug('Teams retrieved', {
            matchId: match.id,
            homeTeam: homeTeam.name,
            awayTeam: awayTeam.name
          });

          // 模拟比赛
          const simulationResult = this.simulateMatch(homeTeam, awayTeam, match.format);

          logger.debug('Match simulated', {
            matchId: match.id,
            result: `${simulationResult.homeScore}:${simulationResult.awayScore}`,
            winner: simulationResult.winnerId
          });

          // 更新比赛结果（使用MatchService以正确清除缓存）
          await matchService.updateMatchResult(match.id, {
            scoreA: simulationResult.homeScore,
            scoreB: simulationResult.awayScore,
            winnerId: simulationResult.winnerId,
            completedAt: new Date()
          });

          // 更新战队统计（这里简化处理，实际应该更新积分榜）
          await this.updateTeamStatistics(
            homeTeam.id,
            simulationResult.homeScore > simulationResult.awayScore,
            simulationResult.homeScore,
            simulationResult.awayScore
          );

          await this.updateTeamStatistics(
            awayTeam.id,
            simulationResult.awayScore > simulationResult.homeScore,
            simulationResult.awayScore,
            simulationResult.homeScore
          );

          results.push({
            matchId: match.id,
            homeTeamName: homeTeam.name,
            awayTeamName: awayTeam.name,
            homeScore: simulationResult.homeScore,
            awayScore: simulationResult.awayScore,
            homePoints: this.calculatePoints(
              simulationResult.homeScore,
              simulationResult.awayScore
            ),
            awayPoints: this.calculatePoints(
              simulationResult.awayScore,
              simulationResult.homeScore
            ),
            winner: simulationResult.homeScore > simulationResult.awayScore ? homeTeam.name : awayTeam.name,
            details: simulationResult.details
          });

          logger.debug('Match completed and saved', { matchId: match.id });
        } catch (matchError) {
          logger.error('Failed to simulate individual match', {
            matchId: match.id,
            error: matchError instanceof Error ? matchError.message : matchError,
            stack: matchError instanceof Error ? matchError.stack : undefined
          });
          // 继续处理其他比赛
          continue;
        }
      }

      // 检查轮次是否完成
      const allRoundMatches = await this.matchRepository.findAll({
        filter: {
          competitionId,
          phase: 'regular_season'
        }
      });

      const currentRoundAllMatches = allRoundMatches.filter(
        m => m.roundNumber === currentRound
      );

      const isRoundComplete = currentRoundAllMatches.every(
        m => m.status === MatchStatus.COMPLETED
      );

      const nextRound = isRoundComplete ? currentRound + 1 : currentRound;

      logger.info('Round simulation completed', {
        competitionId,
        currentRound,
        matchesSimulated: results.length,
        nextRound
      });

      return {
        competitionId,
        currentRound,
        matchesSimulated: results.length,
        results,
        nextRound,
        isRoundComplete
      };
    } catch (error) {
      if (error instanceof BusinessError) {
        throw error;
      }
      logger.error('Failed to simulate round:', {
        competitionId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        errorDetails: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      // 抛出原始错误而不是创建新错误
      throw error;
    }
  }

  // 模拟单场比赛
  private simulateMatch(
    homeTeam: Team,
    awayTeam: Team,
    format: MatchFormat
  ): {
    homeScore: number;
    awayScore: number;
    winnerId: string;
    details: GameDetail[];
  } {
    // 修复：数据库返回的字段名是 power_rating，需要兼容处理
    const homePowerRating = (homeTeam as any).power_rating || homeTeam.powerRating || 50;
    const awayPowerRating = (awayTeam as any).power_rating || awayTeam.powerRating || 50;

    // 计算调整后的实力值（考虑主场优势）
    const homePower = homePowerRating + this.HOME_ADVANTAGE;
    const awayPower = awayPowerRating;

    // 计算战力差距
    const powerDiff = homePower - awayPower;

    logger.debug('Match power calculation', {
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      homePowerRating,
      awayPowerRating,
      homePower,
      awayPower,
      powerDiff
    });

    // 使用逻辑函数计算基础胜率
    // winRate = 1 / (1 + exp(-powerDiff / K))
    const baseWinRate = 1 / (1 + Math.exp(-powerDiff / this.K_VALUE));

    // 添加随机爆冷因子
    const winRate = Math.max(0.1, Math.min(0.9, baseWinRate));

    // 根据赛制确定最多几局
    const maxGames = format === MatchFormat.BO5 ? 5 : format === MatchFormat.BO3 ? 3 : 1;
    const winCondition = Math.ceil(maxGames / 2);

    let homeScore = 0;
    let awayScore = 0;
    const details: GameDetail[] = [];

    // 模拟每一局
    for (let game = 1; game <= maxGames; game++) {
      const random = Math.random();
      const gameWinner = random < winRate ? homeTeam.id : awayTeam.id;
      const duration = this.randomGameDuration();

      if (gameWinner === homeTeam.id) {
        homeScore++;
      } else {
        awayScore++;
      }

      details.push({
        game,
        winner: gameWinner,
        duration
      });

      // 检查是否已经决出胜负
      if (homeScore >= winCondition || awayScore >= winCondition) {
        break;
      }
    }

    const winnerId = homeScore > awayScore ? homeTeam.id : awayTeam.id;

    logger.debug('Match simulated', {
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      result: `${homeScore}:${awayScore}`,
      winRate: (winRate * 100).toFixed(1) + '%'
    });

    return {
      homeScore,
      awayScore,
      winnerId,
      details
    };
  }

  // 计算积分（根据BO3规则）
  // 2:0 胜 -> 3分，2:1 胜 -> 2分，1:2 负 -> 1分，0:2 负 -> 0分
  private calculatePoints(myScore: number, opponentScore: number): number {
    if (myScore === 2 && opponentScore === 0) {
      return 3;
    } else if (myScore === 2 && opponentScore === 1) {
      return 2;
    } else if (myScore === 1 && opponentScore === 2) {
      return 1;
    } else {
      return 0;
    }
  }

  // 更新战队统计
  private async updateTeamStatistics(
    teamId: string,
    isWin: boolean,
    myScore: number,
    opponentScore: number
  ): Promise<void> {
    try {
      const team = await this.teamRepository.findById(teamId);
      if (!team) {
        return;
      }

      // 直接使用数据库查询更新统计数据，避免类型问题
      // 这里简化处理，实际应该使用专门的统计更新方法
      logger.debug('Team statistics would be updated', {
        teamId,
        teamName: team.name,
        isWin,
        score: `${myScore}:${opponentScore}`
      });

      // TODO: 实际应该调用专门的更新战队统计的方法
      // 这里暂时省略，因为主要统计应该在积分榜中维护
    } catch (error) {
      logger.error('Failed to update team statistics:', { teamId, error });
      // 不抛出错误，避免影响主流程
    }
  }

  // 生成随机比赛时长（25-40分钟）
  private randomGameDuration(): number {
    return Math.floor(Math.random() * 16) + 25;
  }
}

// 单例导出
export const scheduleService = new ScheduleService();
