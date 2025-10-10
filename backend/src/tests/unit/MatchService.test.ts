// =================================================================
// 电竞赛事模拟系统 - 比赛服务单元测试
// =================================================================

import { MatchService } from '../../services/MatchService';
import { MatchRepository } from '../../repositories/MatchRepository';
import { TeamRepository } from '../../repositories/TeamRepository';
import { UpdateMatchResultDto, Match, MatchStatus, Team, BusinessError } from '../../types';
import { describe, it, expect,jest,beforeEach } from '@jest/globals';
// Mock Redis service
jest.mock('../../config/redis', () => ({
  redisService: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn()
  }
}));

// Mock repositories
jest.mock('../../repositories/MatchRepository');
jest.mock('../../repositories/TeamRepository');

describe('MatchService', () => {
  let matchService: MatchService;
  let mockMatchRepository: jest.Mocked<MatchRepository>;
  let mockTeamRepository: jest.Mocked<TeamRepository>;

  const mockMatch: Match = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    competitionId: '123e4567-e89b-12d3-a456-426614174001',
    teamAId: '123e4567-e89b-12d3-a456-426614174002',
    teamBId: '123e4567-e89b-12d3-a456-426614174003',
    scoreA: 0,
    scoreB: 0,
    winnerId: undefined,
    format: 'BO3' as any,
    phase: 'regular_season',
    roundNumber: 1,
    matchNumber: 1,
    status: 'scheduled' as any,
    scheduledAt: new Date(),
    startedAt: undefined,
    completedAt: undefined,
    notes: undefined,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockTeamA: Team = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    name: 'Team A',
    shortName: 'TA',
    regionId: '123e4567-e89b-12d3-a456-426614174010',
    powerRating: 85,
    isActive: true,
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    netRoundDifference: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockTeamB: Team = {
    id: '123e4567-e89b-12d3-a456-426614174003',
    name: 'Team B',
    shortName: 'TB',
    regionId: '123e4567-e89b-12d3-a456-426614174011',
    powerRating: 75,
    isActive: true,
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    netRoundDifference: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    matchService = new MatchService();
    mockMatchRepository = new MatchRepository() as jest.Mocked<MatchRepository>;
    mockTeamRepository = new TeamRepository() as jest.Mocked<TeamRepository>;
    (matchService as any).matchRepository = mockMatchRepository;
    (matchService as any).teamRepository = mockTeamRepository;
  });

  describe('getMatchById', () => {
    it('should return match when found', async () => {
      mockMatchRepository.findById.mockResolvedValue(mockMatch);

      const result = await matchService.getMatchById(mockMatch.id);

      expect(mockMatchRepository.findById).toHaveBeenCalledWith(mockMatch.id, {});
      expect(result).toEqual(mockMatch);
    });

    it('should throw BusinessError when match not found', async () => {
      mockMatchRepository.findById.mockResolvedValue(null);

      await expect(matchService.getMatchById('nonexistent-id')).rejects.toThrow(BusinessError);
    });

    it('should include relations when requested', async () => {
      mockMatchRepository.findById.mockResolvedValue(mockMatch);

      await matchService.getMatchById(mockMatch.id, true);

      expect(mockMatchRepository.findById).toHaveBeenCalledWith(mockMatch.id, { include: ['teams', 'competition'] });
    });
  });

  describe('updateMatchResult', () => {
    const resultData: UpdateMatchResultDto = {
      scoreA: 2,
      scoreB: 1,
      winnerId: mockMatch.teamAId,
      completedAt: new Date()
    };

    it('should successfully update match result', async () => {
      const updatedMatch = { ...mockMatch, ...resultData, status: 'completed' as any };

      mockMatchRepository.findById.mockResolvedValue(mockMatch);
      mockMatchRepository.updateResult.mockResolvedValue(updatedMatch);

      const result = await matchService.updateMatchResult(mockMatch.id, resultData);

      expect(mockMatchRepository.updateResult).toHaveBeenCalledWith(mockMatch.id, expect.objectContaining(resultData as unknown as Record<string, unknown>));
      expect(result).toEqual(updatedMatch);
    });

    it('should throw error when trying to update completed match', async () => {
      const completedMatch = { ...mockMatch, status: 'completed' as any };
      mockMatchRepository.findById.mockResolvedValue(completedMatch);

      await expect(matchService.updateMatchResult(mockMatch.id, resultData)).rejects.toThrow(BusinessError);
    });

    it('should automatically determine winner from scores', async () => {
      const resultWithoutWinner: UpdateMatchResultDto = {
        scoreA: 2,
        scoreB: 0
      };

      mockMatchRepository.findById.mockResolvedValue(mockMatch);
      mockMatchRepository.updateResult.mockResolvedValue({ ...mockMatch, ...resultWithoutWinner, winnerId: mockMatch.teamAId });

      await matchService.updateMatchResult(mockMatch.id, resultWithoutWinner);

      expect(mockMatchRepository.updateResult).toHaveBeenCalledWith(
        mockMatch.id,
        expect.objectContaining({
          winnerId: mockMatch.teamAId
        })
      );
    });

    it('should throw error for negative scores', async () => {
      const invalidResult: UpdateMatchResultDto = {
        scoreA: -1,
        scoreB: 2
      };

      mockMatchRepository.findById.mockResolvedValue(mockMatch);

      await expect(matchService.updateMatchResult(mockMatch.id, invalidResult)).rejects.toThrow(BusinessError);
    });

    it('should throw error for tie games', async () => {
      const tieResult: UpdateMatchResultDto = {
        scoreA: 1,
        scoreB: 1
      };

      mockMatchRepository.findById.mockResolvedValue(mockMatch);

      await expect(matchService.updateMatchResult(mockMatch.id, tieResult)).rejects.toThrow(BusinessError);
    });
  });

  describe('updateMatchStatus', () => {
    it('should successfully update match status', async () => {
      const newStatus = 'in_progress' as MatchStatus;
      const updatedMatch = { ...mockMatch, status: newStatus };

      mockMatchRepository.findById.mockResolvedValue(mockMatch);
      mockMatchRepository.updateStatus.mockResolvedValue(updatedMatch);

      const result = await matchService.updateMatchStatus(mockMatch.id, newStatus);

      expect(mockMatchRepository.updateStatus).toHaveBeenCalledWith(mockMatch.id, newStatus);
      expect(result).toEqual(updatedMatch);
    });

    it('should throw error for invalid status transition', async () => {
      const completedMatch = { ...mockMatch, status: 'completed' as any };
      mockMatchRepository.findById.mockResolvedValue(completedMatch);

      await expect(matchService.updateMatchStatus(mockMatch.id, 'scheduled' as MatchStatus)).rejects.toThrow(BusinessError);
    });
  });

  describe('simulateMatch', () => {
    it('should simulate match result successfully', async () => {
      const matchWithTeams = {
        ...mockMatch,
        teamA: mockTeamA,
        teamB: mockTeamB
      };

      mockMatchRepository.findById.mockResolvedValue(matchWithTeams);
      mockTeamRepository.findById
        .mockResolvedValueOnce(mockTeamA)
        .mockResolvedValueOnce(mockTeamB);

      const simulatedMatch = {
        ...mockMatch,
        scoreA: 2,
        scoreB: 1,
        winnerId: mockTeamA.id,
        status: 'completed' as any
      };

      mockMatchRepository.updateResult.mockResolvedValue(simulatedMatch);

      const result = await matchService.simulateMatch(mockMatch.id);

      expect(mockTeamRepository.findById).toHaveBeenCalledWith(mockMatch.teamAId);
      expect(mockTeamRepository.findById).toHaveBeenCalledWith(mockMatch.teamBId);
      expect(result.status).toBe('completed');
    });

    it('should throw error when trying to simulate completed match', async () => {
      const completedMatch = { ...mockMatch, status: 'completed' as any };
      mockMatchRepository.findById.mockResolvedValue(completedMatch);

      await expect(matchService.simulateMatch(mockMatch.id)).rejects.toThrow(BusinessError);
    });

    it('should throw error when teams not found', async () => {
      mockMatchRepository.findById.mockResolvedValue(mockMatch);
      mockTeamRepository.findById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockTeamB);

      await expect(matchService.simulateMatch(mockMatch.id)).rejects.toThrow(BusinessError);
    });
  });

  describe('getUpcomingMatches', () => {
    it('should return upcoming matches', async () => {
      const upcomingMatches = [mockMatch];
      mockMatchRepository.findUpcoming.mockResolvedValue(upcomingMatches);

      const result = await matchService.getUpcomingMatches(10);

      expect(mockMatchRepository.findUpcoming).toHaveBeenCalledWith(10);
      expect(result).toEqual(upcomingMatches);
    });
  });

  describe('getRecentCompletedMatches', () => {
    it('should return recent completed matches', async () => {
      const completedMatches = [{ ...mockMatch, status: 'completed' as any }];
      mockMatchRepository.findRecentCompleted.mockResolvedValue(completedMatches);

      const result = await matchService.getRecentCompletedMatches(10);

      expect(mockMatchRepository.findRecentCompleted).toHaveBeenCalledWith(10);
      expect(result).toEqual(completedMatches);
    });
  });

  describe('getInProgressMatches', () => {
    it('should return in-progress matches', async () => {
      const inProgressMatches = [{ ...mockMatch, status: 'in_progress' as any }];
      mockMatchRepository.findInProgress.mockResolvedValue(inProgressMatches);

      const result = await matchService.getInProgressMatches();

      expect(mockMatchRepository.findInProgress).toHaveBeenCalled();
      expect(result).toEqual(inProgressMatches);
    });
  });

  describe('createMatches', () => {
    it('should create multiple matches successfully', async () => {
      const matchesToCreate = [
        { ...mockMatch, id: undefined as any, createdAt: undefined as any, updatedAt: undefined as any },
        { ...mockMatch, id: undefined as any, teamAId: 'different-team', createdAt: undefined as any, updatedAt: undefined as any }
      ];

      const createdMatches = [
        { ...matchesToCreate[0], id: 'new-id-1' },
        { ...matchesToCreate[1], id: 'new-id-2' }
      ];

      mockMatchRepository.createBatch.mockResolvedValue(createdMatches as any);

      const result = await matchService.createMatches(matchesToCreate);

      expect(mockMatchRepository.createBatch).toHaveBeenCalledWith(matchesToCreate);
      expect(result).toEqual(createdMatches);
    });
  });
});