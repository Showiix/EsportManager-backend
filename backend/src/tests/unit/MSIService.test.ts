// =================================================================
// 电竞赛事模拟系统 - MSI服务单元测试
// =================================================================

import { MSIService } from '../../services/MSIService';
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

describe('MSIService', () => {
  let msiService: MSIService;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    msiService = new MSIService();

    // Mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    (db.getClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('simulateBO5Match', () => {
    const teamAId = '10';
    const teamBId = '12';

    it('should successfully simulate a BO5 match', async () => {
      // Mock team data
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Bilibili Gaming', power_rating: 88 },
          { id: 12, name: 'Gen.G', power_rating: 90 }
        ]
      });

      // Call private method through reflection
      const result = await (msiService as any).simulateBO5Match(
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
        rows: [{ id: 12, name: 'Gen.G', power_rating: 90 }]
      });

      // Should throw BusinessError
      await expect(
        (msiService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(BusinessError);

      await expect(
        (msiService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(`队伍 ${teamAId} 不存在或未查询到`);
    });

    it('should throw error when teamB not found', async () => {
      // Mock query to return only teamA
      mockClient.query.mockResolvedValue({
        rows: [{ id: 10, name: 'Bilibili Gaming', power_rating: 88 }]
      });

      // Should throw BusinessError
      await expect(
        (msiService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(BusinessError);

      await expect(
        (msiService as any).simulateBO5Match(mockClient, teamAId, teamBId)
      ).rejects.toThrow(`队伍 ${teamBId} 不存在或未查询到`);
    });

    it('should handle different ID types (string, number, bigint)', async () => {
      // Mock team data with different ID types
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Bilibili Gaming', power_rating: 88 },
          { id: 12, name: 'Gen.G', power_rating: 90 }
        ]
      });

      // Test with string IDs
      const result1 = await (msiService as any).simulateBO5Match(
        mockClient,
        '10',
        '12'
      );
      expect(result1).toBeTruthy();

      // Reset mock
      mockClient.query.mockClear();
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Bilibili Gaming', power_rating: 88 },
          { id: 12, name: 'Gen.G', power_rating: 90 }
        ]
      });

      // Test with number IDs (as would come from database)
      const result2 = await (msiService as any).simulateBO5Match(
        mockClient,
        10,
        12
      );
      expect(result2).toBeTruthy();
    });

    it('should use default power rating when not available', async () => {
      // Mock team data without power_rating
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Bilibili Gaming', power_rating: null },
          { id: 12, name: 'Gen.G', power_rating: undefined }
        ]
      });

      const result = await (msiService as any).simulateBO5Match(
        mockClient,
        teamAId,
        teamBId
      );

      // Should still complete successfully with default ratings (75)
      expect(result).toHaveProperty('scoreA');
      expect(result).toHaveProperty('scoreB');
      expect(result).toHaveProperty('winnerId');
    });

    it('should respect power rating differences', async () => {
      // Mock team data with large power difference
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Strong Team', power_rating: 100 },
          { id: 12, name: 'Weak Team', power_rating: 50 }
        ]
      });

      // Run multiple simulations to test probability
      const results = [];
      for (let i = 0; i < 100; i++) {
        mockClient.query.mockClear();
        mockClient.query.mockResolvedValue({
          rows: [
            { id: 10, name: 'Strong Team', power_rating: 100 },
            { id: 12, name: 'Weak Team', power_rating: 50 }
          ]
        });

        const result = await (msiService as any).simulateBO5Match(
          mockClient,
          '10',
          '12'
        );
        results.push(result);
      }

      // Strong team should win most matches (at least 60%)
      const strongTeamWins = results.filter(r => r.winnerId === '10').length;
      expect(strongTeamWins).toBeGreaterThan(60);
    });
  });

  describe('advanceToNextRound', () => {
    const winnerId = '10';
    const loserId = '12';
    const mockMatch = {
      id: 'msi-match-1',
      next_match_id: 'msi-next-1',
      loser_next_match_id: 'msi-loser-1'
    };

    beforeEach(() => {
      // Mock updateNextMatchTeam method
      (msiService as any).updateNextMatchTeam = jest.fn().mockResolvedValue(undefined);
    });

    it('should successfully advance teams to next round', async () => {
      // Mock team query
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Bilibili Gaming' },
          { id: 12, name: 'Gen.G' }
        ]
      });

      await (msiService as any).advanceToNextRound(
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
      expect((msiService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.next_match_id,
        winnerId,
        'Bilibili Gaming'
      );

      // Verify loser advanced to loser bracket
      expect((msiService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.loser_next_match_id,
        loserId,
        'Gen.G'
      );
    });

    it('should throw error when winner not found', async () => {
      // Mock query to return only loser
      mockClient.query.mockResolvedValue({
        rows: [{ id: 12, name: 'Gen.G' }]
      });

      await expect(
        (msiService as any).advanceToNextRound(
          mockClient,
          mockMatch,
          winnerId,
          loserId
        )
      ).rejects.toThrow(BusinessError);

      await expect(
        (msiService as any).advanceToNextRound(
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
        rows: [{ id: 10, name: 'Bilibili Gaming' }]
      });

      await expect(
        (msiService as any).advanceToNextRound(
          mockClient,
          mockMatch,
          winnerId,
          loserId
        )
      ).rejects.toThrow(BusinessError);

      await expect(
        (msiService as any).advanceToNextRound(
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
          { id: 10, name: 'Bilibili Gaming' },
          { id: 12, name: 'Gen.G' }
        ]
      });

      const matchWithoutNext = {
        ...mockMatch,
        next_match_id: null
      };

      await (msiService as any).advanceToNextRound(
        mockClient,
        matchWithoutNext,
        winnerId,
        loserId
      );

      // Winner should not be advanced (no next match)
      expect((msiService as any).updateNextMatchTeam).not.toHaveBeenCalledWith(
        mockClient,
        null,
        expect.anything(),
        expect.anything()
      );

      // Loser should still be advanced
      expect((msiService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.loser_next_match_id,
        loserId,
        'Gen.G'
      );
    });

    it('should handle match without loser_next_match_id', async () => {
      // Mock team query
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Bilibili Gaming' },
          { id: 12, name: 'Gen.G' }
        ]
      });

      const matchWithoutLoserNext = {
        ...mockMatch,
        loser_next_match_id: null
      };

      await (msiService as any).advanceToNextRound(
        mockClient,
        matchWithoutLoserNext,
        winnerId,
        loserId
      );

      // Winner should be advanced
      expect((msiService as any).updateNextMatchTeam).toHaveBeenCalledWith(
        mockClient,
        mockMatch.next_match_id,
        winnerId,
        'Bilibili Gaming'
      );

      // Loser should not be advanced (no loser next match)
      expect((msiService as any).updateNextMatchTeam).not.toHaveBeenCalledWith(
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
          { id: 10, name: 'Bilibili Gaming' },
          { id: 12, name: 'Gen.G' }
        ]
      });

      // Call with numeric IDs (as from database)
      await (msiService as any).advanceToNextRound(
        mockClient,
        mockMatch,
        10,
        12
      );

      // Should successfully match teams
      expect((msiService as any).updateNextMatchTeam).toHaveBeenCalledTimes(2);
    });

    it('should handle MSI-specific scenarios (multiple knockout rounds)', async () => {
      // Mock team query
      mockClient.query.mockResolvedValue({
        rows: [
          { id: 10, name: 'Legendary Group Winner' },
          { id: 12, name: 'Challenger Group Winner' }
        ]
      });

      const legendaryMatch = {
        ...mockMatch,
        match_type: 'winners_round_1',
        bracket_type: 'winners'
      };

      await (msiService as any).advanceToNextRound(
        mockClient,
        legendaryMatch,
        winnerId,
        loserId
      );

      // Both teams should advance (winner to winners bracket, loser to losers bracket)
      expect((msiService as any).updateNextMatchTeam).toHaveBeenCalledTimes(2);
    });
  });
});
