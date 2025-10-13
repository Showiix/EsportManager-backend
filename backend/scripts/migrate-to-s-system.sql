-- ===============================================
-- 数据库迁移脚本: 统一赛季标识为 S1/S2/S3 系统
-- ===============================================
-- 创建时间: 2025-10-13
-- 目的: 将现有的数字赛季ID迁移为S系统标识
-- 警告: 此操作会修改主键和外键，请先备份数据库
-- ===============================================

-- ===============================================
-- 第一步: 备份现有数据
-- ===============================================

-- 备份现有表数据
CREATE TABLE IF NOT EXISTS seasons_backup AS SELECT * FROM seasons;
CREATE TABLE IF NOT EXISTS competitions_backup AS SELECT * FROM competitions;
CREATE TABLE IF NOT EXISTS matches_backup AS SELECT * FROM matches;
CREATE TABLE IF NOT EXISTS team_competitions_backup AS SELECT * FROM team_competitions;
CREATE TABLE IF NOT EXISTS playoff_brackets_backup AS SELECT * FROM playoff_brackets;
CREATE TABLE IF NOT EXISTS playoff_matches_backup AS SELECT * FROM playoff_matches;
CREATE TABLE IF NOT EXISTS msi_brackets_backup AS SELECT * FROM msi_brackets;
CREATE TABLE IF NOT EXISTS msi_matches_backup AS SELECT * FROM msi_matches;
CREATE TABLE IF NOT EXISTS honor_records_backup AS SELECT * FROM honor_records;
CREATE TABLE IF NOT EXISTS regional_standings_backup AS SELECT * FROM regional_standings;
CREATE TABLE IF NOT EXISTS annual_rankings_backup AS SELECT * FROM annual_rankings;

-- 打印备份完成信息
SELECT 'Backup completed' AS status, NOW() AS timestamp;
SELECT 'seasons_backup' AS table_name, COUNT(*) AS record_count FROM seasons_backup
UNION ALL
SELECT 'competitions_backup', COUNT(*) FROM competitions_backup
UNION ALL
SELECT 'matches_backup', COUNT(*) FROM matches_backup;

-- ===============================================
-- 第二步: 创建临时映射表
-- ===============================================

-- 创建赛季ID映射表
CREATE TEMPORARY TABLE season_id_mapping (
  old_id VARCHAR(100),
  new_id VARCHAR(10)
);

-- 生成赛季ID映射
INSERT INTO season_id_mapping (old_id, new_id)
SELECT
  id as old_id,
  CASE
    WHEN id = '1' THEN 'S1'
    WHEN id = '2' THEN 'S2'
    WHEN id = '3' THEN 'S3'
    ELSE CONCAT('S', id)
  END as new_id
FROM seasons;

-- 创建赛事ID映射表
CREATE TEMPORARY TABLE competition_id_mapping (
  old_id VARCHAR(100),
  new_id VARCHAR(100),
  season_id VARCHAR(10),
  region_id VARCHAR(20),
  type VARCHAR(20),
  stage VARCHAR(20)
);

-- 生成赛事ID映射
INSERT INTO competition_id_mapping (old_id, new_id, season_id, region_id, type, stage)
SELECT
  c.id as old_id,
  CONCAT(
    CASE
      WHEN c.season_id = '1' THEN 'S1'
      WHEN c.season_id = '2' THEN 'S2'
      WHEN c.season_id = '3' THEN 'S3'
      ELSE CONCAT('S', c.season_id)
    END,
    '-',
    UPPER(COALESCE(c.region_id, 'GLOBAL')),
    '-',
    c.type,
    '-',
    COALESCE(c.stage, 'regular')
  ) as new_id,
  CASE
    WHEN c.season_id = '1' THEN 'S1'
    WHEN c.season_id = '2' THEN 'S2'
    WHEN c.season_id = '3' THEN 'S3'
    ELSE CONCAT('S', c.season_id)
  END as season_id,
  c.region_id,
  c.type,
  c.stage
FROM competitions c;

-- 打印映射表信息
SELECT 'Mapping tables created' AS status, NOW() AS timestamp;
SELECT * FROM season_id_mapping ORDER BY old_id;
SELECT * FROM competition_id_mapping ORDER BY old_id LIMIT 10;

-- ===============================================
-- 第三步: 添加新ID列
-- ===============================================

-- seasons表添加新ID列
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS new_id VARCHAR(10);
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS display_name VARCHAR(50);

-- competitions表添加新ID列
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS new_id VARCHAR(100);
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS new_season_id VARCHAR(10);
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS display_name VARCHAR(200);

-- matches表添加新ID列
ALTER TABLE matches ADD COLUMN IF NOT EXISTS new_id VARCHAR(150);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS new_competition_id VARCHAR(100);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS new_season_id VARCHAR(10);

-- team_competitions表添加新列
ALTER TABLE team_competitions ADD COLUMN IF NOT EXISTS new_competition_id VARCHAR(100);

-- playoff_brackets表添加新列
ALTER TABLE playoff_brackets ADD COLUMN IF NOT EXISTS new_season_id VARCHAR(10);

-- playoff_matches表添加新列
ALTER TABLE playoff_matches ADD COLUMN IF NOT EXISTS new_playoff_bracket_id VARCHAR(100);

-- msi_brackets表添加新列
ALTER TABLE msi_brackets ADD COLUMN IF NOT EXISTS new_season_id VARCHAR(10);

-- msi_matches表添加新列
ALTER TABLE msi_matches ADD COLUMN IF NOT EXISTS new_msi_bracket_id VARCHAR(100);

-- regional_standings表添加新列
ALTER TABLE regional_standings ADD COLUMN IF NOT EXISTS new_season_id VARCHAR(10);

-- annual_rankings表添加新列
ALTER TABLE annual_rankings ADD COLUMN IF NOT EXISTS new_season_id VARCHAR(10);

-- honor_records表添加新列
ALTER TABLE honor_records ADD COLUMN IF NOT EXISTS new_season_id VARCHAR(10);
ALTER TABLE honor_records ADD COLUMN IF NOT EXISTS new_competition_id VARCHAR(100);

SELECT 'New columns added' AS status, NOW() AS timestamp;

-- ===============================================
-- 第四步: 更新新ID列的值
-- ===============================================

-- 更新 seasons 表
UPDATE seasons s
SET
  new_id = m.new_id,
  display_name = CONCAT(year, '赛季'),
  name = CONCAT(m.new_id, '赛季')
FROM season_id_mapping m
WHERE s.id = m.old_id;

SELECT 'seasons table updated' AS status, COUNT(*) AS records FROM seasons WHERE new_id IS NOT NULL;

-- 更新 competitions 表
UPDATE competitions c
SET
  new_id = m.new_id,
  new_season_id = m.season_id,
  name = CONCAT(m.season_id, ' ', UPPER(COALESCE(c.region_id, 'GLOBAL')), ' ',
                CASE c.type
                  WHEN 'spring' THEN '春季赛'
                  WHEN 'summer' THEN '夏季赛'
                  WHEN 'msi' THEN 'MSI季中赛'
                  WHEN 'worlds' THEN '全球总决赛'
                  WHEN 'intercontinental' THEN '洲际赛'
                  ELSE c.type
                END,
                ' ',
                CASE COALESCE(c.stage, 'regular')
                  WHEN 'regular' THEN '常规赛'
                  WHEN 'playoff' THEN '季后赛'
                  WHEN 'main' THEN '正赛'
                  ELSE c.stage
                END
  ),
  display_name = CONCAT(
    (SELECT year FROM seasons WHERE id = c.season_id LIMIT 1),
    ' ',
    UPPER(COALESCE(c.region_id, 'GLOBAL')),
    ' ',
    CASE c.type
      WHEN 'spring' THEN '春季赛'
      WHEN 'summer' THEN '夏季赛'
      WHEN 'msi' THEN 'MSI季中赛'
      WHEN 'worlds' THEN '全球总决赛'
      WHEN 'intercontinental' THEN '洲际赛'
      ELSE c.type
    END,
    ' ',
    CASE COALESCE(c.stage, 'regular')
      WHEN 'regular' THEN '常规赛'
      WHEN 'playoff' THEN '季后赛'
      WHEN 'main' THEN '正赛'
      ELSE c.stage
    END
  )
FROM competition_id_mapping m
WHERE c.id = m.old_id;

SELECT 'competitions table updated' AS status, COUNT(*) AS records FROM competitions WHERE new_id IS NOT NULL;

-- 更新 matches 表
UPDATE matches m
SET
  new_id = CONCAT(
    (SELECT new_id FROM competitions c WHERE c.id = m.competition_id LIMIT 1),
    '-R', m.round_number,
    '-M', m.match_number
  ),
  new_competition_id = (SELECT new_id FROM competitions c WHERE c.id = m.competition_id LIMIT 1),
  new_season_id = CASE
    WHEN m.season_id = '1' THEN 'S1'
    WHEN m.season_id = '2' THEN 'S2'
    WHEN m.season_id = '3' THEN 'S3'
    ELSE CONCAT('S', m.season_id)
  END;

SELECT 'matches table updated' AS status, COUNT(*) AS records FROM matches WHERE new_id IS NOT NULL;

-- 更新 team_competitions 表
UPDATE team_competitions tc
SET new_competition_id = (
  SELECT new_id FROM competitions c WHERE c.id = tc.competition_id LIMIT 1
);

SELECT 'team_competitions table updated' AS status, COUNT(*) AS records FROM team_competitions WHERE new_competition_id IS NOT NULL;

-- 更新 playoff_brackets 表
UPDATE playoff_brackets
SET new_season_id = CASE
  WHEN season_id = '1' THEN 'S1'
  WHEN season_id = '2' THEN 'S2'
  WHEN season_id = '3' THEN 'S3'
  ELSE CONCAT('S', season_id)
END;

SELECT 'playoff_brackets table updated' AS status, COUNT(*) AS records FROM playoff_brackets WHERE new_season_id IS NOT NULL;

-- 更新 playoff_matches 表
UPDATE playoff_matches pm
SET new_playoff_bracket_id = pm.playoff_bracket_id;

SELECT 'playoff_matches table updated' AS status, COUNT(*) AS records FROM playoff_matches WHERE new_playoff_bracket_id IS NOT NULL;

-- 更新 msi_brackets 表
UPDATE msi_brackets
SET new_season_id = CASE
  WHEN season_id = '1' THEN 'S1'
  WHEN season_id = '2' THEN 'S2'
  WHEN season_id = '3' THEN 'S3'
  ELSE CONCAT('S', season_id)
END;

SELECT 'msi_brackets table updated' AS status, COUNT(*) AS records FROM msi_brackets WHERE new_season_id IS NOT NULL;

-- 更新 msi_matches 表
UPDATE msi_matches mm
SET new_msi_bracket_id = mm.msi_bracket_id;

SELECT 'msi_matches table updated' AS status, COUNT(*) AS records FROM msi_matches WHERE new_msi_bracket_id IS NOT NULL;

-- 更新 regional_standings 表
UPDATE regional_standings
SET new_season_id = CASE
  WHEN season_id = '1' THEN 'S1'
  WHEN season_id = '2' THEN 'S2'
  WHEN season_id = '3' THEN 'S3'
  ELSE CONCAT('S', season_id)
END;

SELECT 'regional_standings table updated' AS status, COUNT(*) AS records FROM regional_standings WHERE new_season_id IS NOT NULL;

-- 更新 annual_rankings 表
UPDATE annual_rankings
SET new_season_id = CASE
  WHEN season_id = '1' THEN 'S1'
  WHEN season_id = '2' THEN 'S2'
  WHEN season_id = '3' THEN 'S3'
  ELSE CONCAT('S', season_id)
END;

SELECT 'annual_rankings table updated' AS status, COUNT(*) AS records FROM annual_rankings WHERE new_season_id IS NOT NULL;

-- 更新 honor_records 表
UPDATE honor_records hr
SET
  new_season_id = CASE
    WHEN hr.season_id = '1' THEN 'S1'
    WHEN hr.season_id = '2' THEN 'S2'
    WHEN hr.season_id = '3' THEN 'S3'
    ELSE CONCAT('S', hr.season_id)
  END,
  new_competition_id = (
    SELECT new_id FROM competitions c WHERE c.id = hr.competition_id LIMIT 1
  );

SELECT 'honor_records table updated' AS status, COUNT(*) AS records FROM honor_records WHERE new_season_id IS NOT NULL;

-- ===============================================
-- 第五步: 数据验证
-- ===============================================

-- 验证所有新ID都已生成
SELECT 'Validation: seasons' AS table_name,
       COUNT(*) AS total,
       COUNT(new_id) AS with_new_id,
       COUNT(*) - COUNT(new_id) AS missing
FROM seasons;

SELECT 'Validation: competitions' AS table_name,
       COUNT(*) AS total,
       COUNT(new_id) AS with_new_id,
       COUNT(*) - COUNT(new_id) AS missing
FROM competitions;

SELECT 'Validation: matches' AS table_name,
       COUNT(*) AS total,
       COUNT(new_id) AS with_new_id,
       COUNT(*) - COUNT(new_id) AS missing
FROM matches;

-- 检查是否有重复的新ID
SELECT 'Checking duplicates in seasons' AS check_type,
       new_id, COUNT(*) AS count
FROM seasons
WHERE new_id IS NOT NULL
GROUP BY new_id
HAVING COUNT(*) > 1;

SELECT 'Checking duplicates in competitions' AS check_type,
       new_id, COUNT(*) AS count
FROM competitions
WHERE new_id IS NOT NULL
GROUP BY new_id
HAVING COUNT(*) > 1;

SELECT 'Checking duplicates in matches' AS check_type,
       new_id, COUNT(*) AS count
FROM matches
WHERE new_id IS NOT NULL
GROUP BY new_id
HAVING COUNT(*) > 1;

-- ===============================================
-- 完成第一阶段
-- ===============================================

SELECT '===========================================' AS message;
SELECT '阶段一完成: 新ID已生成并填充' AS status, NOW() AS timestamp;
SELECT '下一步: 请检查上述验证结果，确认无误后运行第二阶段脚本' AS next_step;
SELECT '===========================================' AS message;

-- ===============================================
-- 注意事项
-- ===============================================

-- 此脚本仅完成了新ID的生成和填充
-- 尚未修改主键和外键约束
-- 如需继续，请运行 migrate-to-s-system-part2.sql
