// =================================================================
// 电竞赛事模拟系统 - 赛程管理服务
// =================================================================

import { MatchRepository } from '../repositories/MatchRepository';
import { TeamRepository } from '../repositories/TeamRepository';
import { CompetitionRepository } from '../repositories/CompetitionRepository';
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
      // 查询该赛事所有已完成的比赛
      const completedMatches = await this.matchRepository.findAll({
        filter: {
          competitionId,
          status: MatchStatus.COMPLETED
        }
      });

      if (completedMatches.length === 0) {
        return 1; // 第一轮
      }

      // 找出最大的已完成轮次
      const maxCompletedRound = Math.max(...completedMatches.map(m => m.roundNumber || 0));

      // 检查该轮是否全部完成
      const currentRoundMatches = await this.matchRepository.findAll({
        filter: {
          competitionId,
          phase: 'regular_season'
        }
      });

      const roundMatches = currentRoundMatches.filter(
        m => m.roundNumber === maxCompletedRound + 1
      );

      // 如果下一轮有比赛，且所有比赛都未完成，返回下一轮
      if (roundMatches.length > 0) {
        const allPending = roundMatches.every(m => m.status === MatchStatus.SCHEDULED);
        if (allPending) {
          return maxCompletedRound + 1;
        }
      }

      return maxCompletedRound + 1;
    } catch (error) {
      logger.error('Failed to get current round:', { competitionId, error });
      throw new Error('Failed to get current round');
    }
  }

  // 模拟整轮比赛
  async simulateRound(competitionId: string): Promise<RoundSimulationResult> {
    try {
      // 获取赛事信息
      const competition = await this.competitionRepository.findById(competitionId);
      if (!competition) {
        throw new BusinessError(
          ErrorCodes.COMPETITION_NOT_ACTIVE,
          `Competition with id ${competitionId} not found`
        );
      }

      // 获取当前轮次
      const currentRound = await this.getCurrentRound(competitionId);

      // 获取当前轮次所有未完成的比赛
      const matches = await this.matchRepository.findAll({
        filter: {
          competitionId,
          phase: 'regular_season',
          status: MatchStatus.SCHEDULED
        }
      });

      const roundMatches = matches.filter(m => m.roundNumber === currentRound);

      if (roundMatches.length === 0) {
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
        // 获取参赛队伍
        const [homeTeam, awayTeam] = await Promise.all([
          this.teamRepository.findById(match.teamAId),
          this.teamRepository.findById(match.teamBId)
        ]);

        if (!homeTeam || !awayTeam) {
          logger.warn('Teams not found for match', { matchId: match.id });
          continue;
        }

        // 模拟比赛
        const simulationResult = this.simulateMatch(homeTeam, awayTeam, match.format);

        // 更新比赛结果
        await this.matchRepository.updateResult(match.id, {
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
      logger.error('Failed to simulate round:', { competitionId, error });
      throw new Error('Failed to simulate round');
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
    // 计算调整后的实力值（考虑主场优势）
    const homePower = homeTeam.powerRating + this.HOME_ADVANTAGE;
    const awayPower = awayTeam.powerRating;

    // 计算战力差距
    const powerDiff = homePower - awayPower;

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

      // 更新战队统计数据
      const updates = {
        totalMatches: team.totalMatches + 1,
        totalWins: team.totalWins + (isWin ? 1 : 0),
        totalLosses: team.totalLosses + (isWin ? 0 : 1),
        netRoundDifference: team.netRoundDifference + (myScore - opponentScore)
      };

      await this.teamRepository.update(teamId, updates);

      logger.debug('Team statistics updated', {
        teamId,
        teamName: team.name,
        isWin,
        score: `${myScore}:${opponentScore}`
      });
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
