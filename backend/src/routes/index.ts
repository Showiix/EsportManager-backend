import { Router } from 'express';
import { teamController } from '../controllers/TeamController';
import { regionController } from '../controllers/RegionController';
import { competitionController } from '../controllers/CompetitionController';
import { matchController } from '../controllers/MatchController';
import { rankingController } from '../controllers/RankingController';
import { honorHallController } from '../controllers/HonorHallController';
import { playoffController } from '../controllers/PlayoffController';
import { msiController } from '../controllers/MSIController';

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
// 赛区管理路由
// =================================================================

// 赛区查询
router.get('/regions', regionController.getRegions.bind(regionController));
router.get('/regions/:id', regionController.getRegionById.bind(regionController));

// 赛区更新
router.put('/regions/:id', regionController.updateRegion.bind(regionController));

// 赛区统计
router.get('/regions/:id/statistics', regionController.getRegionStatistics.bind(regionController));

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

// 获取当前轮次
router.get('/competitions/:id/current-round', competitionController.getCurrentRound.bind(competitionController));

// 模拟整轮比赛
router.post('/competitions/:id/simulate-round', competitionController.simulateRound.bind(competitionController));

// 结束赛事（常规赛完成）
router.post('/competitions/:id/finish', competitionController.finishCompetition.bind(competitionController));

// =================================================================
// 比赛管理路由
// =================================================================

// 比赛查询
router.get('/matches', matchController.getMatches.bind(matchController));

// 比赛状态查询 (必须在 :id 路由之前，避免路由冲突)
router.get('/matches/upcoming', matchController.getUpcomingMatches.bind(matchController));
router.get('/matches/recent', matchController.getRecentCompletedMatches.bind(matchController));
router.get('/matches/live', matchController.getInProgressMatches.bind(matchController));

// 比赛详情查询 (放在最后，避免与状态查询路由冲突)
router.get('/matches/:id', matchController.getMatchById.bind(matchController));

// 根据赛事获取比赛
router.get('/competitions/:competitionId/matches', matchController.getMatchesByCompetition.bind(matchController));

// 根据队伍获取比赛
router.get('/teams/:teamId/matches', matchController.getMatchesByTeam.bind(matchController));

// 比赛结果管理
router.put('/matches/:id/result', matchController.updateMatchResult.bind(matchController));
router.put('/matches/:id/status', matchController.updateMatchStatus.bind(matchController));

// 比赛模拟
router.post('/matches/:id/simulate', matchController.simulateMatch.bind(matchController));

// =================================================================
// 积分排名路由
// =================================================================

// 获取赛区常规赛积分榜
router.get('/rankings/regional', rankingController.getRegionalStandings.bind(rankingController));

// 获取年度积分排名
router.get('/rankings/annual', rankingController.getAnnualRankings.bind(rankingController));

// 更新赛区常规赛积分榜
router.post('/rankings/regional/update', rankingController.updateRegionalStandings.bind(rankingController));

// 更新年度积分排名
router.post('/rankings/annual/update', rankingController.updateAnnualRankings.bind(rankingController));

// 批量刷新所有排名
router.post('/rankings/refresh', rankingController.refreshAllRankings.bind(rankingController));

// =================================================================
// 荣誉殿堂路由
// =================================================================

// 获取可用赛季列表
router.get('/honor-hall/seasons', honorHallController.getAvailableSeasons.bind(honorHallController));

// 获取指定赛季的荣誉数据
router.get('/honor-hall/seasons/:seasonId/honors', honorHallController.getSeasonHonors.bind(honorHallController));

// 创建荣誉记录
router.post('/honor-hall/records', honorHallController.createHonorRecord.bind(honorHallController));

// 批量创建荣誉记录
router.post('/honor-hall/records/batch', honorHallController.batchCreateHonorRecords.bind(honorHallController));

// =================================================================
// 季后赛路由
// =================================================================

// 生成季后赛对阵(常规赛结束后调用)
router.post('/playoffs/generate', playoffController.generatePlayoff.bind(playoffController));

// 获取季后赛对阵信息
router.get('/playoffs/bracket', playoffController.getPlayoffBracket.bind(playoffController));

// 获取赛区所有季后赛
router.get('/playoffs/region/:regionId', playoffController.getRegionPlayoffs.bind(playoffController));

// 模拟季后赛单场比赛(BO5)
router.post('/playoffs/simulate-match', playoffController.simulatePlayoffMatch.bind(playoffController));

// 获取季后赛资格队伍(常规赛前4名)
router.get('/playoffs/qualified-teams', playoffController.getQualifiedTeams.bind(playoffController));

// 检查是否可以生成季后赛(常规赛是否结束)
router.get('/playoffs/check-eligibility', playoffController.checkPlayoffEligibility.bind(playoffController));

// =================================================================
// MSI季中赛路由
// =================================================================

// 生成MSI对阵(春季赛季后赛全部结束后调用)
router.post('/msi/generate', msiController.generateMSI.bind(msiController));

// 获取MSI对阵信息
router.get('/msi/bracket', msiController.getMSIBracket.bind(msiController));

// 模拟MSI单场比赛(BO5)
router.post('/msi/simulate-match', msiController.simulateMSIMatch.bind(msiController));

// 获取MSI资格队伍(各赛区春季赛前三名)
router.get('/msi/qualified-teams', msiController.getQualifiedTeams.bind(msiController));

// 检查是否可以生成MSI(所有赛区春季赛季后赛是否结束)
router.get('/msi/check-eligibility', msiController.checkMSIEligibility.bind(msiController));

// 获取历史MSI数据
router.get('/msi/historical', msiController.getHistoricalMSI.bind(msiController));

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
      rankings: '/api/rankings',
      honorHall: '/api/honor-hall',
      playoffs: '/api/playoffs',
      msi: '/api/msi',
      health: '/api/health'
    },
    documentation: 'Coming Soon'
  });
});

export default router;
