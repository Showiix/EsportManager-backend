import { Router } from 'express';

const router = Router();

// 主路由入口
router.get('/', (req, res) => {
  res.json({
    message: 'Esports Simulator API',
    version: '1.0.0',
    endpoints: {
      teams: '/api/teams',
      competitions: '/api/competitions',
      matches: '/api/matches',
      statistics: '/api/statistics',
      health: '/health',
    },
  });
});

// TODO: 添加具体的业务路由
// router.use('/teams', teamRoutes);
// router.use('/competitions', competitionRoutes);
// router.use('/matches', matchRoutes);
// router.use('/statistics', statisticsRoutes);

export default router;
