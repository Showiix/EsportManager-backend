-- ===============================================
-- 清理备份表脚本
-- ===============================================
-- 创建时间: 2025-10-13
-- 目的: 迁移成功并验证无误后，清理备份表释放空间
-- 警告: 执行此脚本后将无法回滚，请确保迁移完全成功
-- ===============================================

-- 开始事务
BEGIN;

SELECT '===========================================' AS message;
SELECT '开始清理备份表' AS status, NOW() AS timestamp;
SELECT '===========================================' AS message;

-- 显示备份表占用空间
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE '%_backup'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 删除备份表
DROP TABLE IF EXISTS seasons_backup;
DROP TABLE IF EXISTS competitions_backup;
DROP TABLE IF EXISTS matches_backup;
DROP TABLE IF EXISTS team_competitions_backup;
DROP TABLE IF EXISTS playoff_brackets_backup;
DROP TABLE IF EXISTS playoff_matches_backup;
DROP TABLE IF EXISTS msi_brackets_backup;
DROP TABLE IF EXISTS msi_matches_backup;
DROP TABLE IF EXISTS honor_records_backup;
DROP TABLE IF EXISTS regional_standings_backup;
DROP TABLE IF EXISTS annual_rankings_backup;

SELECT 'Backup tables dropped' AS status, NOW() AS timestamp;

-- 运行VACUUM清理空间
VACUUM ANALYZE;

SELECT '===========================================' AS message;
SELECT '清理完成' AS status, NOW() AS timestamp;
SELECT '请执行 COMMIT; 确认删除' AS next_step;
SELECT '===========================================' AS message;

-- COMMIT;  -- 确认无误后取消此行注释
