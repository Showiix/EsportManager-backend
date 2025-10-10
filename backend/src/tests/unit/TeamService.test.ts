// =================================================================
// 电竞赛事模拟系统 - 战队服务单元测试
// =================================================================

import { TeamService } from '../../services/TeamService';
import { TeamRepository } from '../../repositories/TeamRepository';
import { CreateTeamDto, UpdateTeamDto, Team, BusinessError } from '../../types';
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

// Mock TeamRepository
jest.mock('../../repositories/TeamRepository');

describe('TeamService', () => {
  let teamService: TeamService;
  let mockTeamRepository: jest.Mocked<TeamRepository>;

  const mockTeam: Team = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Team',
    shortName: 'TT',
    regionId: '123e4567-e89b-12d3-a456-426614174001',
    powerRating: 85,
    foundedDate: new Date('2020-01-01'),
    logoUrl: 'https://example.com/logo.png',
    isActive: true,
    totalMatches: 10,
    totalWins: 7,
    totalLosses: 3,
    netRoundDifference: 5,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    teamService = new TeamService();
    mockTeamRepository = new TeamRepository() as jest.Mocked<TeamRepository>;
    (teamService as any).teamRepository = mockTeamRepository;
  });

  describe('createTeam', () => {
    const createTeamDto: CreateTeamDto = {
      name: 'Test Team',
      shortName: 'TT',
      regionId: '123e4567-e89b-12d3-a456-426614174001',
      powerRating: 85,
      foundedDate: new Date('2020-01-01'),
      logoUrl: 'https://example.com/logo.png'
    };

    it('should successfully create a team', async () => {
      // Mock getTeams to return empty results (no name conflict)
      jest.spyOn(teamService as any, 'getTeams').mockResolvedValue({ teams: [], total: 0 });
      mockTeamRepository.create.mockResolvedValue(mockTeam);

      const result = await teamService.createTeam(createTeamDto);

      expect(mockTeamRepository.create).toHaveBeenCalledWith(createTeamDto);
      expect(result).toEqual(mockTeam);
    });

    it('should throw error if team creation fails', async () => {
      // Mock getTeams to return empty results (no name conflict)
      jest.spyOn(teamService as any, 'getTeams').mockResolvedValue({ teams: [], total: 0 });

      const error = new Error('Database error');
      mockTeamRepository.create.mockRejectedValue(error);

      await expect(teamService.createTeam(createTeamDto)).rejects.toThrow('Database error');
    });
  });

  describe('getTeamById', () => {
    it('should return team when found', async () => {
      mockTeamRepository.findById.mockResolvedValue(mockTeam);

      const result = await teamService.getTeamById(mockTeam.id);

      expect(mockTeamRepository.findById).toHaveBeenCalledWith(mockTeam.id, {});
      expect(result).toEqual(mockTeam);
    });

    it('should throw BusinessError when team not found', async () => {
      mockTeamRepository.findById.mockResolvedValue(null);

      await expect(teamService.getTeamById('nonexistent-id')).rejects.toThrow(BusinessError);
      await expect(teamService.getTeamById('nonexistent-id')).rejects.toThrow('Team with id nonexistent-id not found');
    });

    it('should include relations when requested', async () => {
      mockTeamRepository.findById.mockResolvedValue(mockTeam);

      await teamService.getTeamById(mockTeam.id, true);

      expect(mockTeamRepository.findById).toHaveBeenCalledWith(mockTeam.id, { include: ['region'] });
    });
  });

  describe('updateTeam', () => {
    const updateDto: UpdateTeamDto = {
      name: 'Updated Team Name',
      powerRating: 90
    };

    it('should successfully update team', async () => {
      const updatedTeam = { ...mockTeam, ...updateDto };
      mockTeamRepository.update.mockResolvedValue(updatedTeam);

      const result = await teamService.updateTeam(mockTeam.id, updateDto);

      expect(mockTeamRepository.update).toHaveBeenCalledWith(mockTeam.id, updateDto);
      expect(result).toEqual(updatedTeam);
    });

    it('should throw BusinessError when team not found', async () => {
      mockTeamRepository.update.mockResolvedValue(null);

      await expect(teamService.updateTeam('nonexistent-id', updateDto)).rejects.toThrow(BusinessError);
      await expect(teamService.updateTeam('nonexistent-id', updateDto)).rejects.toThrow('Team with id nonexistent-id not found');
    });
  });

  describe('deleteTeam', () => {
    it('should successfully delete team', async () => {
      mockTeamRepository.findById.mockResolvedValue(mockTeam);
      mockTeamRepository.delete.mockResolvedValue(true);

      await expect(teamService.deleteTeam(mockTeam.id)).resolves.not.toThrow();

      expect(mockTeamRepository.delete).toHaveBeenCalledWith(mockTeam.id);
    });

    it('should throw BusinessError when team not found', async () => {
      mockTeamRepository.findById.mockResolvedValue(mockTeam);
      mockTeamRepository.delete.mockResolvedValue(false);

      await expect(teamService.deleteTeam('nonexistent-id')).rejects.toThrow(BusinessError);
    });
  });

  describe('getTeamsByRegion', () => {
    it('should return teams for specified region', async () => {
      const teams = [mockTeam];
      mockTeamRepository.findByRegion.mockResolvedValue(teams);

      const result = await teamService.getTeamsByRegion(mockTeam.regionId);

      expect(mockTeamRepository.findByRegion).toHaveBeenCalledWith(mockTeam.regionId);
      expect(result).toEqual(teams);
    });

    it('should return empty array when no teams found', async () => {
      mockTeamRepository.findByRegion.mockResolvedValue([]);

      const result = await teamService.getTeamsByRegion('nonexistent-region');

      expect(result).toEqual([]);
    });
  });

  describe('getTeams', () => {
    it('should return paginated teams list', async () => {
      const teams = [mockTeam];
      const total = 1;

      mockTeamRepository.findAll.mockResolvedValue(teams);
      mockTeamRepository.count.mockResolvedValue(total);

      const result = await teamService.getTeams({
        pagination: { page: 1, limit: 10 }
      });

      expect(result).toEqual({ teams, total });
    });
  });

  describe('getTeamStatistics', () => {
    it('should calculate team statistics correctly', async () => {
      const matches = [
        { id: '1', winner_id: mockTeam.id, status: 'completed', completed_at: new Date('2024-03-01'), scheduled_at: new Date('2024-03-01') },
        { id: '2', winner_id: 'other-team', status: 'completed', completed_at: new Date('2024-03-02'), scheduled_at: new Date('2024-03-02') },
        { id: '3', winner_id: mockTeam.id, status: 'completed', completed_at: new Date('2024-03-03'), scheduled_at: new Date('2024-03-03') }
      ];

      const scores = [
        { points: 10, competition_type: 'spring' },
        { points: 5, competition_type: 'summer' }
      ];

      mockTeamRepository.getTeamMatches.mockResolvedValue(matches as any);
      mockTeamRepository.getTeamScores.mockResolvedValue(scores as any);
      mockTeamRepository.getTeamStatistics.mockResolvedValue({});

      const result = await teamService.getTeamStatistics(mockTeam.id, 2024);

      expect(result.totalPoints).toBe(15);
      expect(result.springPoints).toBe(10);
      expect(result.summerPoints).toBe(5);
      expect(result.wins).toBe(2);
      expect(result.losses).toBe(1);
      expect(result.winRate).toBe(66.67);
    });
  });
});