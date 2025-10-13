-- ===============================================
-- 数据库迁移脚本 第二阶段: 切换到新ID系统
-- ===============================================
-- 创建时间: 2025-10-13
-- 目的: 将新ID替换旧ID，更新主键和外键
-- 警告: 此操作不可逆，请确保第一阶段验证通过后再执行
-- ===============================================

-- 开始事务（如果出错可以回滚）
BEGIN;

SELECT '===========================================' AS message;
SELECT '开始第二阶段: 切换到新ID系统' AS status, NOW() AS timestamp;
SELECT '===========================================' AS message;

-- ===============================================
-- 第一步: 删除外键约束
-- ===============================================

-- 删除competitions表的外键
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS fk_competitions_season;
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS competitions_season_id_fkey;

-- 删除matches表的外键
ALTER TABLE matches DROP CONSTRAINT IF EXISTS fk_matches_competition;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS fk_matches_season;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_competition_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_season_id_fkey;

-- 删除team_competitions表的外键
ALTER TABLE team_competitions DROP CONSTRAINT IF EXISTS fk_team_competitions_competition;
ALTER TABLE team_competitions DROP CONSTRAINT IF EXISTS team_competitions_competition_id_fkey;

-- 删除playoff_brackets表的外键
ALTER TABLE playoff_brackets DROP CONSTRAINT IF EXISTS playoff_brackets_season_id_fkey;

-- 删除playoff_matches表的外键
ALTER TABLE playoff_matches DROP CONSTRAINT IF EXISTS playoff_matches_playoff_bracket_id_fkey;

-- 删除msi_brackets表的外键
ALTER TABLE msi_brackets DROP CONSTRAINT IF EXISTS msi_brackets_season_id_fkey;

-- 删除msi_matches表的外键
ALTER TABLE msi_matches DROP CONSTRAINT IF EXISTS msi_matches_msi_bracket_id_fkey;

-- 删除regional_standings表的外键
ALTER TABLE regional_standings DROP CONSTRAINT IF EXISTS regional_standings_season_id_fkey;

-- 删除annual_rankings表的外键
ALTER TABLE annual_rankings DROP CONSTRAINT IF EXISTS annual_rankings_season_id_fkey;

-- 删除honor_records表的外键
ALTER TABLE honor_records DROP CONSTRAINT IF EXISTS honor_records_season_id_fkey;
ALTER TABLE honor_records DROP CONSTRAINT IF EXISTS honor_records_competition_id_fkey;

SELECT 'Foreign key constraints dropped' AS status, NOW() AS timestamp;

-- ===============================================
-- 第二步: 处理 seasons 表（主键变更）
-- ===============================================

-- 删除主键约束
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_pkey;
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS pk_seasons;

-- 删除旧的id列
ALTER TABLE seasons DROP COLUMN id;

-- 重命名new_id为id
ALTER TABLE seasons RENAME COLUMN new_id TO id;

-- 添加主键约束
ALTER TABLE seasons ADD PRIMARY KEY (id);

SELECT 'seasons table migrated' AS status, COUNT(*) AS records FROM seasons;

-- ===============================================
-- 第三步: 处理 competitions 表
-- ===============================================

-- 删除主键约束
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS competitions_pkey;
ALTER TABLE competitions DROP CONSTRAINT IF EXISTS pk_competitions;

-- 删除旧列
ALTER TABLE competitions DROP COLUMN id;
ALTER TABLE competitions DROP COLUMN season_id;

-- 重命名新列
ALTER TABLE competitions RENAME COLUMN new_id TO id;
ALTER TABLE competitions RENAME COLUMN new_season_id TO season_id;

-- 添加主键约束
ALTER TABLE competitions ADD PRIMARY KEY (id);

SELECT 'competitions table migrated' AS status, COUNT(*) AS records FROM competitions;

-- ===============================================
-- 第四步: 处理 matches 表
-- ===============================================

-- 删除主键约束
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_pkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS pk_matches;

-- 删除旧列
ALTER TABLE matches DROP COLUMN id;
ALTER TABLE matches DROP COLUMN competition_id;
ALTER TABLE matches DROP COLUMN season_id;

-- 重命名新列
ALTER TABLE matches RENAME COLUMN new_id TO id;
ALTER TABLE matches RENAME COLUMN new_competition_id TO competition_id;
ALTER TABLE matches RENAME COLUMN new_season_id TO season_id;

-- 添加主键约束
ALTER TABLE matches ADD PRIMARY KEY (id);

SELECT 'matches table migrated' AS status, COUNT(*) AS records FROM matches;

-- ===============================================
-- 第五步: 处理关联表
-- ===============================================

-- team_competitions表
ALTER TABLE team_competitions DROP COLUMN competition_id;
ALTER TABLE team_competitions RENAME COLUMN new_competition_id TO competition_id;

-- playoff_brackets表
ALTER TABLE playoff_brackets DROP COLUMN season_id;
ALTER TABLE playoff_brackets RENAME COLUMN new_season_id TO season_id;

-- playoff_matches表
ALTER TABLE playoff_matches DROP COLUMN playoff_bracket_id;
ALTER TABLE playoff_matches RENAME COLUMN new_playoff_bracket_id TO playoff_bracket_id;

-- msi_brackets表
ALTER TABLE msi_brackets DROP COLUMN season_id;
ALTER TABLE msi_brackets RENAME COLUMN new_season_id TO season_id;

-- msi_matches表
ALTER TABLE msi_matches DROP COLUMN msi_bracket_id;
ALTER TABLE msi_matches RENAME COLUMN new_msi_bracket_id TO msi_bracket_id;

-- regional_standings表
ALTER TABLE regional_standings DROP COLUMN season_id;
ALTER TABLE regional_standings RENAME COLUMN new_season_id TO season_id;

-- annual_rankings表
ALTER TABLE annual_rankings DROP COLUMN season_id;
ALTER TABLE annual_rankings RENAME COLUMN new_season_id TO season_id;

-- honor_records表
ALTER TABLE honor_records DROP COLUMN season_id;
ALTER TABLE honor_records DROP COLUMN competition_id;
ALTER TABLE honor_records RENAME COLUMN new_season_id TO season_id;
ALTER TABLE honor_records RENAME COLUMN new_competition_id TO competition_id;

SELECT 'Associated tables migrated' AS status, NOW() AS timestamp;

-- ===============================================
-- 第六步: 重新添加外键约束
-- ===============================================

-- competitions表的外键
ALTER TABLE competitions
ADD CONSTRAINT fk_competitions_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- matches表的外键
ALTER TABLE matches
ADD CONSTRAINT fk_matches_competition
FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;

ALTER TABLE matches
ADD CONSTRAINT fk_matches_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- team_competitions表的外键
ALTER TABLE team_competitions
ADD CONSTRAINT fk_team_competitions_competition
FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;

-- playoff_brackets表的外键
ALTER TABLE playoff_brackets
ADD CONSTRAINT fk_playoff_brackets_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- msi_brackets表的外键
ALTER TABLE msi_brackets
ADD CONSTRAINT fk_msi_brackets_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- regional_standings表的外键
ALTER TABLE regional_standings
ADD CONSTRAINT fk_regional_standings_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- annual_rankings表的外键
ALTER TABLE annual_rankings
ADD CONSTRAINT fk_annual_rankings_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- honor_records表的外键
ALTER TABLE honor_records
ADD CONSTRAINT fk_honor_records_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

ALTER TABLE honor_records
ADD CONSTRAINT fk_honor_records_competition
FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;

SELECT 'Foreign key constraints recreated' AS status, NOW() AS timestamp;

-- ===============================================
-- 第七步: 创建索引
-- ===============================================

-- seasons表索引
CREATE INDEX IF NOT EXISTS idx_seasons_year ON seasons(year);
CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);

-- competitions表索引
CREATE INDEX IF NOT EXISTS idx_competitions_season ON competitions(season_id);
CREATE INDEX IF NOT EXISTS idx_competitions_season_type ON competitions(season_id, type);
CREATE INDEX IF NOT EXISTS idx_competitions_season_region_type ON competitions(season_id, region_id, type);
CREATE INDEX IF NOT EXISTS idx_competitions_type ON competitions(type);
CREATE INDEX IF NOT EXISTS idx_competitions_region ON competitions(region_id);
CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);

-- matches表索引
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);
CREATE INDEX IF NOT EXISTS idx_matches_season_round ON matches(season_id, round_number);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_teams ON matches(team_a_id, team_b_id);

-- 关联表索引
CREATE INDEX IF NOT EXISTS idx_team_competitions_competition ON team_competitions(competition_id);
CREATE INDEX IF NOT EXISTS idx_playoff_brackets_season ON playoff_brackets(season_id);
CREATE INDEX IF NOT EXISTS idx_msi_brackets_season ON msi_brackets(season_id);
CREATE INDEX IF NOT EXISTS idx_regional_standings_season ON regional_standings(season_id);
CREATE INDEX IF NOT EXISTS idx_annual_rankings_season ON annual_rankings(season_id);
CREATE INDEX IF NOT EXISTS idx_honor_records_season ON honor_records(season_id);
CREATE INDEX IF NOT EXISTS idx_honor_records_competition ON honor_records(competition_id);

SELECT 'Indexes created' AS status, NOW() AS timestamp;

-- ===============================================
-- 第八步: 最终验证
-- ===============================================

-- 验证seasons表
SELECT 'Validation: seasons' AS table_name;
SELECT id, name, display_name, year, status FROM seasons ORDER BY id LIMIT 5;

-- 验证competitions表
SELECT 'Validation: competitions' AS table_name;
SELECT id, season_id, region_id, type, stage, name FROM competitions ORDER BY id LIMIT 5;

-- 验证matches表
SELECT 'Validation: matches' AS table_name;
SELECT id, competition_id, season_id, round_number, match_number FROM matches ORDER BY id LIMIT 5;

-- 验证数据计数
SELECT 'Data count validation' AS check_type;
SELECT
  'seasons' as table_name,
  (SELECT COUNT(*) FROM seasons_backup) as backup_count,
  (SELECT COUNT(*) FROM seasons) as current_count;

SELECT
  'competitions' as table_name,
  (SELECT COUNT(*) FROM competitions_backup) as backup_count,
  (SELECT COUNT(*) FROM competitions) as current_count;

SELECT
  'matches' as table_name,
  (SELECT COUNT(*) FROM matches_backup) as backup_count,
  (SELECT COUNT(*) FROM matches) as current_count;

-- 验证外键完整性
SELECT 'Foreign key integrity check' AS check_type;

-- 检查competitions的season_id是否都有效
SELECT 'Invalid season_id in competitions' AS issue,
       c.id, c.season_id
FROM competitions c
LEFT JOIN seasons s ON c.season_id = s.id
WHERE s.id IS NULL
LIMIT 5;

-- 检查matches的competition_id是否都有效
SELECT 'Invalid competition_id in matches' AS issue,
       m.id, m.competition_id
FROM matches m
LEFT JOIN competitions c ON m.competition_id = c.id
WHERE c.id IS NULL
LIMIT 5;

-- ===============================================
-- 提交事务
-- ===============================================

SELECT '===========================================' AS message;
SELECT '第二阶段完成: 新ID系统已启用' AS status, NOW() AS timestamp;
SELECT '请检查上述验证结果，确认无误后执行 COMMIT;' AS next_step;
SELECT '如果发现问题，执行 ROLLBACK; 回滚所有更改' AS rollback_info;
SELECT '===========================================' AS message;

-- 取消自动提交，等待手动确认
-- COMMIT;  -- 确认无误后取消此行注释
