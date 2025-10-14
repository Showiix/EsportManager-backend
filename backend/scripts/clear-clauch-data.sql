-- ============================================================
-- 清除C洲际赛数据脚本
-- 用于测试从头开始生成和模拟C洲际赛
-- ============================================================

BEGIN;

-- 1. 删除C洲际赛的所有比赛记录
DELETE FROM clauch_matches WHERE clauch_bracket_id IN (SELECT id FROM clauch_brackets);

-- 2. 删除C洲际赛的小组积分榜
DELETE FROM clauch_group_standings WHERE clauch_bracket_id IN (SELECT id FROM clauch_brackets);

-- 3. 删除C洲际赛的晋级队伍记录
DELETE FROM clauch_qualifications WHERE clauch_bracket_id IN (SELECT id FROM clauch_brackets);

-- 4. 删除C洲际赛对阵表
DELETE FROM clauch_brackets;

-- 5. 删除score_records中的C洲际赛积分记录
DELETE FROM score_records WHERE point_type = 'intercontinental';

-- 6. 删除honor_records中的C洲际赛荣誉记录
DELETE FROM honor_records 
WHERE competition_id IN (
    SELECT id FROM competitions WHERE type = 'clauch'
);

-- 7. 更新team_statistics表，清除洲际赛积分
UPDATE team_statistics 
SET 
    intercontinental_points = 0,
    total_points = COALESCE(spring_points, 0) + 
                   COALESCE(summer_points, 0) + 
                   COALESCE(playoff_points, 0) + 
                   COALESCE(msi_points, 0) + 
                   COALESCE(worlds_points, 0),
    last_updated = NOW()
WHERE season_year = 2024;

-- 8. 更新annual_rankings表，清除洲际赛积分
UPDATE annual_rankings
SET
    intercontinental_points = 0,
    total_points = COALESCE(spring_points, 0) + 
                   COALESCE(summer_points, 0) + 
                   COALESCE(playoff_points, 0) + 
                   COALESCE(msi_points, 0) + 
                   COALESCE(worlds_points, 0),
    last_updated = NOW()
WHERE season_id = 1;

COMMIT;

-- 查看清理结果
SELECT 'C洲际赛数据已清除' as status;

-- 显示当前积分排名（前5名）
SELECT 
  t.name as team_name,
  ts.total_points,
  ts.playoff_points,
  ts.msi_points,
  ts.worlds_points,
  ts.intercontinental_points
FROM team_statistics ts
JOIN teams t ON t.id = ts.team_id
WHERE ts.season_year = 2024
ORDER BY ts.total_points DESC
LIMIT 5;

