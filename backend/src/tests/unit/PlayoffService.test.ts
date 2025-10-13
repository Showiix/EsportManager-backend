// =================================================================
// 电竞赛事模拟系统 - 季后赛服务单元测试
// =================================================================

import { PlayoffService } from '../../services/PlayoffService';
import { BusinessError, ErrorCodes } from '../../types';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { db } from '../../config/database';

// Mock database
jest.mock('../../config/database', () => ({
  db: {
    query: jest.fn(),
    getClient: jest.fn()
  }
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('PlayoffService', () => {
  let playoffService: PlayoffService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    playoffService = new PlayoffService();

    // Mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    (db.getClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('simulateBO5Match', () => {
    const teamAId = '1';
    const teamBId = '2';

    it('should successfully simulate a BO5 match', async () => {
      // Mock team data
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Team A', power_rating: 85 },
          { id: 2, name: 'Team B', power_rating: 75 }
        ]
      });

      // Call private method through reflection
      const result = await (playoffService as any).simulateBO5Match(
        mockClient,
        teamAId,
        teamBId
      );

      // Verify result structure
      expect(result).toHaveProperty('scoreA');
      expect(result).toHaveProperty('scoreB');
      expect(result).toHaveProperty('winnerId');

      // Verify BO5 format (one team should have 3 wins)
      expect(result.scoreA === 3 || result.scoreB === 3).toBe(true);

      // Verify winner ID is one of the two teams
      expect([teamAId, teamBId]).toContain(result.winnerId);

      // Verify database was queried
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, power_rating, name FROM teams'),
        [teamAId, teamBId]
      );
    });

    it('should throw error when teamA not found', async () => {
      // Mock query to return only teamB
      mockClient.query.mockResolvedValue({
        rows: [{ id: 2, name: 'Team B', power_rating: 75 }]
      });

      // Should throw BusinessError
      await expect(
        (playoffService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(BusinessError);

      await expect(
        (playoffService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(`队伍 ${teamAId} 不存在或未查询到`);
    });

    it('should throw error when teamB not found', async () => {
      // Mock query to return only teamA
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Team A', power_rating: 85 }]
      });

      // Should throw BusinessError
      await expect(
        (playoffService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(BusinessError);

      await expect(
        (playoffService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(`队伍 ${teamBId} 不存在或未查询到`);
    });

    it('should handle different ID types (string, number, bigint)', async () => {
      // Mock team data with different ID types
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Team A', power_rating: 85 },
          { id: 2, name: 'Team B', power_rating: 75 }
        ]
      });

      // Test with string IDs
      const result1 = await (playoffService as any).simulateBO5Match(
        mockClient,
        '1',
        '2'
      );
      expect(result1).toBeTruthy();

      // Reset mock
      mockClient.query.mockClear();
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Team A', power_rating: 85 },
          { id: 2, name: 'Team B', power_rating: 75 }
        ]
      });

      // Test with number IDs (as would come from database)
      const result2 = await (playoffService as any).simulateBO5Match(
        mockClient,
        1,
        2
      );
      expect(result2).toBeTruthy();
    });

    it('should use default power rating when not available', async () => {
      // Mock team data without power_rating
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Team A', power_rating: null },
          { id: 2, name: 'Team B', power_rating: undefined }
        ]
      });

      const result = await (playoffService as any).simulateBO5Match(
        mockClient,
        teamAId,
        teamBId
      );

      // Should still complete successfully with default ratings (75)
      expect(result).toHaveProperty('scoreA');
      expect(result).toHaveProperty('scoreB');
      expect(result).toHaveProperty('winnerId');
    });
  });

  describe('advanceToNextRound', () => {
    const winnerId = '1';
    const loserId = '2';
    const mockMatch = {
      id: 'match-1',
      next_match_id: 'next-match-1',
      loser_next_match_id: 'loser-match-1'
    };

    beforeEach(() => {
      // Mock updateNextMatchTeam method
      (playoffService as any).updateNextMatchTeam = jest.fn().mockResolvedValue(undefined);
    });

    it('should successfully advance teams to next round', async () => {
      // Mock team query
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Winner Team' },
          { id: 2, name: 'Loser Team' }
        ]
      });

      await (playoffService as any).advanceToNextRound(
        mockClient,
        mockMatch,
        winnerId,
        loserId
      );

      // Verify teams were queried
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name FROM teams'),
        [winnerId, loserId]
      );

      // Verify winner advanced to next match
      expect((playoffService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.next_match_id,
        winnerId,
        'Winner Team'
      );

      // Verify loser advanced to loser bracket
      expect((playoffService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.loser_next_match_id,
        loserId,
        'Loser Team'
      );
    });

    it('should throw error when winner not found', async () => {
      // Mock query to return only loser
      mockClient.query.mockResolvedValue({
        rows: [{ id: 2, name: 'Loser Team' }]
      });

      await expect(
        (playoffService as any).advanceToNextRound(
          mockClient,
          mockMatch,
          winnerId,
          loserId
        )
      ).rejects.toThrow(BusinessError);

      await expect(
        (playoffService as any).advanceToNextRound(
          mockClient,
          mockMatch,
          winnerId,
          loserId
        )
      ).rejects.toThrow(`获胜队伍 ${winnerId} 不存在`);
    });

    it('should throw error when loser not found', async () => {
      // Mock query to return only winner
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Winner Team' }]
      });

      await expect(
        (playoffService as any).advanceToNextRound(
          mockClient,
          mockMatch,
          winnerId,
          loserId
        )
      ).rejects.toThrow(BusinessError);

      await expect(
        (playoffService as any).advanceToNextRound(
          mockClient,
          mockMatch,
          winnerId,
          loserId
        )
      ).rejects.toThrow(`失败队伍 ${loserId} 不存在`);
    });

    it('should handle match without next_match_id', async () => {
      // Mock team query
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Winner Team' },
          { id: 2, name: 'Loser Team' }
        ]
      });

      const matchWithoutNext = {
        ...mockMatch,
        next_match_id: null
      };

      await (playoffService as any).advanceToNextRound(
        mockClient,
        matchWithoutNext,
        winnerId,
        loserId
      );

      // Winner should not be advanced (no next match)
      expect((playoffService as any).updateNextMatchTeam).not.toHaveBeenCalledWith(
        mockClient,
        null,
        expect.anything(),
        expect.anything()
      );

      // Loser should still be advanced
      expect((playoffService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.loser_next_match_id,
        loserId,
        'Loser Team'
      );
    });

    it('should handle match without loser_next_match_id', async () => {
      // Mock team query
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Winner Team' },
          { id: 2, name: 'Loser Team' }
        ]
      });

      const matchWithoutLoserNext = {
        ...mockMatch,
        loser_next_match_id: null
      };

      await (playoffService as any).advanceToNextRound(
        mockClient,
        matchWithoutLoserNext,
        winnerId,
        loserId
      );

      // Winner should be advanced
      expect((playoffService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.next_match_id,
        winnerId,
        'Winner Team'
      );

      // Loser should not be advanced (no loser next match)
      expect((playoffService as any).updateNextMatchTeam).not.toHaveBeenCalledWith(
        mockClient,
        null,
        expect.anything(),
        expect.anything()
      );
    });

    it('should handle different ID types correctly', async () => {
      // Mock team data with numeric IDs
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Winner Team' },
          { id: 2, name: 'Loser Team' }
        ]
      });

      // Call with numeric IDs (as from database)
      await (playoffService as any).advanceToNextRound(
        mockClient,
        mockMatch,
        1,
        2
      );

      // Should successfully match teams
      expect((playoffService as any).updateNextMatchTeam).toHaveBeenCalledTimes(2);
    });
  });
});
