// =================================================================
// 电竞赛事模拟系统 - 积分引擎单元测试
// =================================================================

import { ScoringEngine } from '../../engines/ScoringEngine';
import { Match, Competition, ScoringRules } from '../../types';
import { describe, it, expect,jest,beforeEach } from '@jest/globals';

// Mock database service
jest.mock('../../services/DatabaseService', () => ({
  databaseService: {
    query: jest.fn()
  }
}));

describe('ScoringEngine', () => {
  let scoringEngine: ScoringEngine;

  const mockMatch: Match = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    competitionId: '123e4567-e89b-12d3-a456-426614174001',
    teamAId: '123e4567-e89b-12d3-a456-426614174002',
    teamBId: '123e4567-e89b-12d3-a456-426614174003',
    scoreA: 2,
    scoreB: 1,
    winnerId: '123e4567-e89b-12d3-a456-426614174002',
    format: 'BO3' as any,
    phase: 'regular_season',
    roundNumber: 1,
    matchNumber: 1,
    status: 'completed' as any,
    scheduledAt: new Date(),
    startedAt: new Date(),
    completedAt: new Date(),
    notes: undefined,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockCompetition: Competition = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    seasonId: '123e4567-e89b-12d3-a456-426614174010',
    type: 'spring' as any,
    name: 'Spring Split',
    format: {
      type: 'league',
      regularSeason: { format: 'double_round_robin', matchFormat: 'BO3' as any }
    },
    scoringRules: {
      regular: {
        'win_2_0': 3,
        'win_2_1': 2,
        'loss_1_2': 1,
        'loss_0_2': 0
      }
    },
    status: 'active' as any,
    maxTeams: 10,
    startDate: new Date(),
    endDate: new Date(),
    description: 'Spring competition',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    scoringEngine = new ScoringEngine();
  });

  describe('calculateMatchScore', () => {
    it('should calculate correct points for BO3 2-1 win', async () => {
      const result = await scoringEngine.calculateMatchScore(mockMatch, mockCompetition);

      expect(result.winnerId).toBe(mockMatch.winnerId);
      expect(result.winnerPoints).toBe(2); // 2-1 win = 2 points
      expect(result.loserId).toBe(mockMatch.teamBId);
      expect(result.loserPoints).toBe(1); // 1-2 loss = 1 point
      expect(result.pointType).toBe('spring_regular_season');
    });

    it('should calculate correct points for BO3 2-0 win', async () => {
      const match2_0 = { ...mockMatch, scoreA: 2, scoreB: 0 };

      const result = await scoringEngine.calculateMatchScore(match2_0, mockCompetition);

      expect(result.winnerPoints).toBe(3); // 2-0 win = 3 points
      expect(result.loserPoints).toBe(0); // 0-2 loss = 0 points
    });

    it('should handle BO1 matches', async () => {
      const bo1Match = { ...mockMatch, format: 'BO1' as any, scoreA: 1, scoreB: 0 };
      const bo1Competition = {
        ...mockCompetition,
        scoringRules: {
          regular: { 'win': 1, 'loss': 0 }
        }
      };

      const result = await scoringEngine.calculateMatchScore(bo1Match, bo1Competition);

      expect(result.winnerPoints).toBe(1);
      expect(result.loserPoints).toBe(0);
    });

    it('should handle BO5 matches', async () => {
      const bo5Match = { ...mockMatch, format: 'BO5' as any, scoreA: 3, scoreB: 2 };
      const bo5Competition = {
        ...mockCompetition,
        scoringRules: {
          regular: { 'win': 3, 'loss': 0 }
        }
      };

      const result = await scoringEngine.calculateMatchScore(bo5Match, bo5Competition);

      expect(result.winnerPoints).toBe(3);
      expect(result.loserPoints).toBe(0);
    });

    it('should throw error when no scoring rules found', async () => {
      const competitionWithoutRules = {
        ...mockCompetition,
        type: 'unknown' as any,
        scoringRules: null as any
      };

      await expect(scoringEngine.calculateMatchScore(mockMatch, competitionWithoutRules))
        .rejects.toThrow('No scoring rules found for competition type: unknown');
    });
  });

  describe('calculateTournamentPlacementScores', () => {
    it('should calculate correct tournament placement scores', async () => {
      const placements = [
        { teamId: 'team1', placement: 'champion', points: 0 },
        { teamId: 'team2', placement: 'runner_up', points: 0 },
        { teamId: 'team3', placement: 'third_place', points: 0 },
        { teamId: 'team4', placement: 'fourth_place', points: 0 }
      ];

      // Mock database calls
      const { databaseService } = require('../../services/DatabaseService');
      databaseService.query
        .mockResolvedValueOnce({ // getCompetitionById
          rows: [{
            id: mockCompetition.id,
            type: 'spring',
            scoring_rules: JSON.stringify(mockCompetition.scoringRules),
            season_year: 2024
          }]
        })
        .mockResolvedValueOnce({ // getSeasonYear
          rows: [{ year: 2024 }]
        });

      const result = await scoringEngine.calculateTournamentPlacementScores(mockCompetition.id, placements);

      expect(result).toHaveLength(4);
      expect(result[0].points).toBe(12); // champion
      expect(result[1].points).toBe(10); // runner_up
      expect(result[2].points).toBe(8);  // third_place
      expect(result[3].points).toBe(6);  // fourth_place
    });

    it('should not create score records for zero points', async () => {
      const placements = [
        { teamId: 'team1', placement: 'unknown_placement', points: 0 }
      ];

      const { databaseService } = require('../../services/DatabaseService');
      databaseService.query
        .mockResolvedValueOnce({
          rows: [{
            id: mockCompetition.id,
            type: 'spring',
            scoring_rules: JSON.stringify(mockCompetition.scoringRules),
            season_year: 2024
          }]
        })
        .mockResolvedValueOnce({
          rows: [{ year: 2024 }]
        });

      const result = await scoringEngine.calculateTournamentPlacementScores(mockCompetition.id, placements);

      expect(result).toHaveLength(0);
    });
  });

  describe('calculateSeasonRanking', () => {
    it('should return correctly formatted season ranking', async () => {
      const mockRankingData = [
        {
          team_id: 'team1',
          team_name: 'Team 1',
          short_name: 'T1',
          region_name: 'LPL',
          region_code: 'LPL',
          total_points: '25',
          spring_points: '15',
          msi_points: '10',
          summer_points: '0',
          worlds_points: '0',
          wins: '10',
          losses: '2',
          matches_played: '12',
          win_rate: '83.33'
        },
        {
          team_id: 'team2',
          team_name: 'Team 2',
          short_name: 'T2',
          region_name: 'LCK',
          region_code: 'LCK',
          total_points: '20',
          spring_points: '12',
          msi_points: '8',
          summer_points: '0',
          worlds_points: '0',
          wins: '8',
          losses: '4',
          matches_played: '12',
          win_rate: '66.67'
        }
      ];

      const { databaseService } = require('../../services/DatabaseService');
      databaseService.query.mockResolvedValue({ rows: mockRankingData });

      const result = await scoringEngine.calculateSeasonRanking(2024);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({
        teamId: 'team1',
        teamName: 'Team 1',
        totalPoints: 25,
        ranking: 1,
        winRate: 83.33
      }));
      expect(result[1]).toEqual(expect.objectContaining({
        teamId: 'team2',
        teamName: 'Team 2',
        totalPoints: 20,
        ranking: 2,
        winRate: 66.67
      }));
    });
  });

  describe('calculateIntercontinentalRanking', () => {
    it('should return top 16 teams for intercontinental competition', async () => {
      const mockTeams = Array.from({ length: 20 }, (_, i) => ({
        team_id: `team${i + 1}`,
        team_name: `Team ${i + 1}`,
        short_name: `T${i + 1}`,
        region_name: 'LPL',
        region_code: 'LPL',
        total_points: `${100 - i * 5}`
      }));

      const { databaseService } = require('../../services/DatabaseService');
      databaseService.query.mockResolvedValue({ rows: mockTeams.slice(0, 16) }); // Database LIMIT 16

      const result = await scoringEngine.calculateIntercontinentalRanking(2023, 2024);

      expect(result).toHaveLength(16);
      expect(result[0].totalPoints).toBe(100);
      expect(result[15].totalPoints).toBe(25);
      expect(result[0].ranking).toBe(1);
      expect(result[15].ranking).toBe(16);
    });
  });

  describe('saveScoreRecord', () => {
    it('should save score record successfully', async () => {
      const scoreRecord = {
        teamId: 'team1',
        competitionId: 'comp1',
        matchId: 'match1',
        points: 3,
        pointType: 'spring_regular',
        seasonYear: 2024,
        earnedAt: new Date(),
        description: 'Regular season win'
      };

      const savedRecord = { ...scoreRecord, id: 'new-id', createdAt: new Date() };

      const { databaseService } = require('../../services/DatabaseService');
      databaseService.query.mockResolvedValue({ rows: [savedRecord] });

      const result = await scoringEngine.saveScoreRecord(scoreRecord);

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO score_records'),
        expect.arrayContaining([
          scoreRecord.teamId,
          scoreRecord.competitionId,
          scoreRecord.matchId,
          scoreRecord.points,
          scoreRecord.pointType,
          scoreRecord.seasonYear,
          scoreRecord.earnedAt,
          scoreRecord.description
        ])
      );
      expect(result).toEqual(savedRecord);
    });
  });

  describe('saveScoreRecords', () => {
    it('should save multiple score records', async () => {
      const scoreRecords = [
        {
          teamId: 'team1',
          competitionId: 'comp1',
          matchId: 'match1',
          points: 3,
          pointType: 'spring_regular',
          seasonYear: 2024,
          earnedAt: new Date(),
          description: 'Win'
        },
        {
          teamId: 'team2',
          competitionId: 'comp1',
          matchId: 'match1',
          points: 1,
          pointType: 'spring_regular',
          seasonYear: 2024,
          earnedAt: new Date(),
          description: 'Loss'
        }
      ];

      const savedRecords = scoreRecords.map((record, index) => ({
        ...record,
        id: `id-${index}`,
        createdAt: new Date()
      }));

      const { databaseService } = require('../../services/DatabaseService');
      databaseService.query.mockResolvedValue({ rows: savedRecords });

      const result = await scoringEngine.saveScoreRecords(scoreRecords);

      expect(result).toHaveLength(2);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO score_records'),
        expect.any(Array)
      );
    });

    it('should return empty array for empty input', async () => {
      const result = await scoringEngine.saveScoreRecords([]);
      expect(result).toEqual([]);
    });
  });

  describe('updateTeamStatistics', () => {
    it('should update team statistics successfully', async () => {
      const { databaseService } = require('../../services/DatabaseService');
      databaseService.query.mockResolvedValue({ rows: [] });

      await expect(scoringEngine.updateTeamStatistics('team1', 2024)).resolves.not.toThrow();

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO team_statistics'),
        ['team1', 2024]
      );
    });
  });
});