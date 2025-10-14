// =================================================================
// 电竞赛事模拟系统 - 积分管理路由
// =================================================================

import { Router } from 'express';
import { pointsController } from '../controllers/PointsController';

const router = Router();

/**
 * @route   GET /api/points/team/:teamId/:seasonYear
 * @desc    获取战队积分详情
 * @access  Public
 */
router.get('/team/:teamId/:seasonYear', (req, res) => 
  pointsController.getTeamPointsBreakdown(req, res)
);

/**
 * @route   GET /api/points/season/:seasonYear
 * @desc    获取赛季积分排名
 * @access  Public
 */
router.get('/season/:seasonYear', (req, res) => 
  pointsController.getSeasonPointsRanking(req, res)
);

/**
 * @route   POST /api/points/recalculate/:seasonYear
 * @desc    重新计算赛季积分
 * @access  Public
 */
router.post('/recalculate/:seasonYear', (req, res) => 
  pointsController.recalculateSeasonPoints(req, res)
);

/**
 * @route   GET /api/points/history/:teamId
 * @desc    获取战队积分历史
 * @access  Public
 * @query   seasonYear (optional)
 */
router.get('/history/:teamId', (req, res) => 
  pointsController.getTeamPointsHistory(req, res)
);

/**
 * @route   GET /api/points/region/:regionId/:seasonYear
 * @desc    获取赛区积分排名
 * @access  Public
 */
router.get('/region/:regionId/:seasonYear', (req, res) => 
  pointsController.getRegionPointsRanking(req, res)
);

/**
 * @route   GET /api/points/two-year/:season1Year/:season2Year
 * @desc    获取两年积分总和排名（用于Super洲际赛）
 * @access  Public
 */
router.get('/two-year/:season1Year/:season2Year', (req, res) => 
  pointsController.getTwoYearPointsRanking(req, res)
);

export default router;

