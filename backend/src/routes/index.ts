import { Router } from 'express';
import { teamController } from '../controllers/TeamController';
import { competitionController } from '../controllers/CompetitionController';
import { matchController } from '../controllers/MatchController';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'EsportManager API',
    version: '1.0.0'
  });
});

// =================================================================
// 战队管理路由
// =================================================================

// 战队CRUD操作
router.post('/teams', teamController.createTeam.bind(teamController));
router.get('/teams', teamController.getTeams.bind(teamController));
router.get('/teams/:id', teamController.getTeamById.bind(teamController));
router.put('/teams/:id', teamController.updateTeam.bind(teamController));
router.delete('/teams/:id', teamController.deleteTeam.bind(teamController));

// 战队统计和数据
router.get('/teams/:id/statistics', teamController.getTeamStatistics.bind(teamController));
router.get('/teams/:id/matches', teamController.getTeamMatches.bind(teamController));

// 根据赛区获取战队
router.get('/regions/:regionId/teams', teamController.getTeamsByRegion.bind(teamController));

// =================================================================
// 赛事管理路由
// =================================================================

// 赛事CRUD操作
router.post('/competitions', competitionController.createCompetition.bind(competitionController));
router.get('/competitions', competitionController.getCompetitions.bind(competitionController));
router.get('/competitions/:id', competitionController.getCompetitionById.bind(competitionController));
router.put('/competitions/:id/status', competitionController.updateCompetitionStatus.bind(competitionController));

// 根据赛季获取赛事
router.get('/seasons/:seasonId/competitions', competitionController.getCompetitionsBySeason.bind(competitionController));

// 根据类型和年份获取赛事
router.get('/competitions/type/:type/year/:year', competitionController.getCompetitionsByTypeAndYear.bind(competitionController));

// 活跃和即将开始的赛事
router.get('/competitions/active', competitionController.getActiveCompetitions.bind(competitionController));
router.get('/competitions/upcoming', competitionController.getUpcomingCompetitions.bind(competitionController));

// 赛事参赛队伍管理
router.get('/competitions/:id/teams', competitionController.getCompetitionTeams.bind(competitionController));
router.post('/competitions/:id/teams', competitionController.addTeamToCompetition.bind(competitionController));
router.delete('/competitions/:id/teams/:teamId', competitionController.removeTeamFromCompetition.bind(competitionController));

// 赛程生成
router.post('/competitions/:id/generate-schedule', competitionController.generateSchedule.bind(competitionController));

// =================================================================
// 比赛管理路由
// =================================================================

// 比赛查询
router.get('/matches', matchController.getMatches.bind(matchController));
router.get('/matches/:id', matchController.getMatchById.bind(matchController));

// 根据赛事获取比赛
router.get('/competitions/:competitionId/matches', matchController.getMatchesByCompetition.bind(matchController));

// 根据队伍获取比赛
router.get('/teams/:teamId/matches', matchController.getMatchesByTeam.bind(matchController));

// 比赛状态查询
router.get('/matches/upcoming', matchController.getUpcomingMatches.bind(matchController));
router.get('/matches/recent', matchController.getRecentCompletedMatches.bind(matchController));
router.get('/matches/live', matchController.getInProgressMatches.bind(matchController));

// 比赛结果管理
router.put('/matches/:id/result', matchController.updateMatchResult.bind(matchController));
router.put('/matches/:id/status', matchController.updateMatchStatus.bind(matchController));

// 比赛模拟
router.post('/matches/:id/simulate', matchController.simulateMatch.bind(matchController));

// =================================================================
// API信息路由
// =================================================================

// 主路由入口
router.get('/', (req, res) => {
  res.json({
    message: 'EsportManager API',
    version: '1.0.0',
    description: '电竞赛事模拟系统后端API',
    endpoints: {
      teams: '/api/teams',
      competitions: '/api/competitions',
      matches: '/api/matches',
      health: '/api/health'
    },
    documentation: 'Coming Soon'
  });
});

export default router;
