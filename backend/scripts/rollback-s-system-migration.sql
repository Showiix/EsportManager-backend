-- ===============================================
-- 数据库迁移回滚脚本
-- ===============================================
-- 创建时间: 2025-10-13
-- 目的: 如果迁移出现问题,从备份恢复数据
-- 警告: 此操作会删除迁移后的数据,恢复到迁移前状态
-- ===============================================

-- 开始事务
BEGIN;

SELECT '===========================================' AS message;
SELECT '开始回滚到迁移前状态' AS status, NOW() AS timestamp;
SELECT '===========================================' AS message;

-- ===============================================
-- 第一步: 删除当前表
-- ===============================================

-- 删除外键约束
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS fk_competitions_season;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS fk_matches_competition;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS fk_matches_season;
ALTER TABLE team_competitions DROP CONSTRAINT IF EXISTS fk_team_competitions_competition;
ALTER TABLE playoff_brackets DROP CONSTRAINT IF EXISTS fk_playoff_brackets_season;
ALTER TABLE msi_brackets DROP CONSTRAINT IF EXISTS fk_msi_brackets_season;
ALTER TABLE regional_standings DROP CONSTRAINT IF EXISTS fk_regional_standings_season;
ALTER TABLE annual_rankings DROP CONSTRAINT IF EXISTS fk_annual_rankings_season;
ALTER TABLE honor_records DROP CONSTRAINT IF EXISTS fk_honor_records_season;
ALTER TABLE honor_records DROP CONSTRAINT IF EXISTS fk_honor_records_competition;

-- 删除表
DROP TABLE IF EXISTS seasons CASCADE;
DROP TABLE IF EXISTS competitions CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS team_competitions CASCADE;
DROP TABLE IF EXISTS playoff_brackets CASCADE;
DROP TABLE IF EXISTS playoff_matches CASCADE;
DROP TABLE IF EXISTS msi_brackets CASCADE;
DROP TABLE IF EXISTS msi_matches CASCADE;
DROP TABLE IF EXISTS regional_standings CASCADE;
DROP TABLE IF EXISTS annual_rankings CASCADE;
DROP TABLE IF EXISTS honor_records CASCADE;

SELECT 'Current tables dropped' AS status, NOW() AS timestamp;

-- ===============================================
-- 第二步: 从备份恢复
-- ===============================================

-- 恢复seasons表
CREATE TABLE seasons AS SELECT * FROM seasons_backup;
ALTER TABLE seasons ADD PRIMARY KEY (id);

-- 恢复competitions表
CREATE TABLE competitions AS SELECT * FROM competitions_backup;
ALTER TABLE competitions ADD PRIMARY KEY (id);

-- 恢复matches表
CREATE TABLE matches AS SELECT * FROM matches_backup;
ALTER TABLE matches ADD PRIMARY KEY (id);

-- 恢复team_competitions表
CREATE TABLE team_competitions AS SELECT * FROM team_competitions_backup;

-- 恢复playoff_brackets表
CREATE TABLE playoff_brackets AS SELECT * FROM playoff_brackets_backup;

-- 恢复playoff_matches表
CREATE TABLE playoff_matches AS SELECT * FROM playoff_matches_backup;

-- 恢复msi_brackets表
CREATE TABLE msi_brackets AS SELECT * FROM msi_brackets_backup;

-- 恢复msi_matches表
CREATE TABLE msi_matches AS SELECT * FROM msi_matches_backup;

-- 恢复regional_standings表
CREATE TABLE regional_standings AS SELECT * FROM regional_standings_backup;

-- 恢复annual_rankings表
CREATE TABLE annual_rankings AS SELECT * FROM annual_rankings_backup;

-- 恢复honor_records表
CREATE TABLE honor_records AS SELECT * FROM honor_records_backup;

SELECT 'Tables restored from backup' AS status, NOW() AS timestamp;

-- ===============================================
-- 第三步: 重建外键约束
-- ===============================================

ALTER TABLE competitions
ADD CONSTRAINT fk_competitions_season
FOREIGN KEY (season_id) REFERENCES seasons(id);

ALTER TABLE matches
ADD CONSTRAINT fk_matches_competition
FOREIGN KEY (competition_id) REFERENCES competitions(id);

ALTER TABLE matches
ADD CONSTRAINT fk_matches_season
FOREIGN KEY (season_id) REFERENCES seasons(id);

-- 其他外键约束（根据原始schema添加）

SELECT 'Foreign key constraints recreated' AS status, NOW() AS timestamp;

-- ===============================================
-- 第四步: 验证
-- ===============================================

SELECT 'seasons' as table_name, COUNT(*) as record_count FROM seasons;
SELECT 'competitions' as table_name, COUNT(*) as record_count FROM competitions;
SELECT 'matches' as table_name, COUNT(*) as record_count FROM matches;

-- ===============================================
-- 提交事务
-- ===============================================

SELECT '===========================================' AS message;
SELECT '回滚完成' AS status, NOW() AS timestamp;
SELECT '请检查验证结果，确认无误后执行 COMMIT;' AS next_step;
SELECT '===========================================' AS message;

-- COMMIT;  -- 确认无误后取消此行注释
