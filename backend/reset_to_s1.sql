-- ============================================================
-- 将数据库重置到S1世界赛结束状态
-- ============================================================

BEGIN;

-- 1. 删除S2和S3的世界赛相关数据
DELETE FROM worlds_swiss_standings WHERE worlds_bracket_id IN (SELECT id FROM worlds_brackets WHERE season_id IN ('S2', 'S3'));
DELETE FROM worlds_swiss_matches WHERE worlds_bracket_id IN (SELECT id FROM worlds_brackets WHERE season_id IN ('S2', 'S3'));
DELETE FROM worlds_knockout_matches WHERE worlds_bracket_id IN (SELECT id FROM worlds_brackets WHERE season_id IN ('S2', 'S3'));
DELETE FROM worlds_brackets WHERE season_id IN ('S2', 'S3');

-- 2. 删除S2的Super数据（Super杯涉及S1+S2）
DELETE FROM super_matches WHERE super_id IN (SELECT id FROM super_brackets WHERE season2_id IN (7, 8));
DELETE FROM super_fighter_standings WHERE super_id IN (SELECT id FROM super_brackets WHERE season2_id IN (7, 8));
DELETE FROM super_rounds WHERE super_id IN (SELECT id FROM super_brackets WHERE season2_id IN (7, 8));
DELETE FROM super_brackets WHERE season2_id IN (7, 8);

-- 3. 删除S2和S3的MSI数据
DELETE FROM msi_matches WHERE msi_bracket_id IN (SELECT id FROM msi_brackets WHERE season_id IN (7, 8));
DELETE FROM msi_brackets WHERE season_id IN (7, 8);

-- 4. 删除S2和S3的季后赛数据
DELETE FROM playoff_matches WHERE playoff_bracket_id IN (SELECT id FROM playoff_brackets WHERE competition_id IN (SELECT id FROM competitions WHERE season_id IN (7, 8)));
DELETE FROM playoff_brackets WHERE competition_id IN (SELECT id FROM competitions WHERE season_id IN (7, 8));

-- 5. 删除S2和S3的比赛相关数据
-- 先删除head_to_head_records中引用这些比赛的记录
DELETE FROM head_to_head_records WHERE last_match_id IN (SELECT id FROM matches WHERE competition_id IN (SELECT id FROM competitions WHERE season_id IN (7, 8)));
-- 再删除比赛数据
DELETE FROM matches WHERE competition_id IN (SELECT id FROM competitions WHERE season_id IN (7, 8));

-- 6. 删除S2和S3的积分榜数据
DELETE FROM regional_standings WHERE season_id IN (7, 8);

-- 7. 删除S2和S3的赛事数据
DELETE FROM competition_teams WHERE competition_id IN (SELECT id FROM competitions WHERE season_id IN (7, 8));
DELETE FROM competitions WHERE season_id IN (7, 8);

-- 8. 删除S2和S3的年度积分数据
DELETE FROM annual_rankings WHERE season_id IN (7, 8);

-- 9. 删除S2和S3的荣誉记录
DELETE FROM honor_records WHERE season_id IN (7, 8);

-- 10. 删除所有C洲际赛数据（包括S1）
DELETE FROM clauch_matches WHERE clauch_bracket_id IN (SELECT id FROM clauch_brackets);
DELETE FROM clauch_group_standings WHERE clauch_bracket_id IN (SELECT id FROM clauch_brackets);
DELETE FROM clauch_qualifications WHERE clauch_bracket_id IN (SELECT id FROM clauch_brackets);
DELETE FROM clauch_brackets;

-- 11. 删除S2和S3赛季
DELETE FROM seasons WHERE id IN (7, 8);

-- 12. 将S1赛季状态改为active（以便可以继续操作）
UPDATE seasons SET status = 'active' WHERE id = 1;

COMMIT;

-- 验证结果
SELECT id, year, season_code, status FROM seasons ORDER BY id;

