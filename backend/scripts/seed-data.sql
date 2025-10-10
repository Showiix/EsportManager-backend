-- =================================================================
-- 种子数据插入脚本 - 电竞赛事模拟系统
-- =================================================================

-- 插入更多战队数据和初始化比赛数据

-- =================================================================
-- 1. 为每个战队创建统计记录
-- =================================================================

INSERT INTO team_statistics (team_id, season_year, total_points, matches_played, wins, losses, win_rate)
SELECT
    id as team_id,
    2024 as season_year,
    0 as total_points,
    0 as matches_played,
    0 as wins,
    0 as losses,
    0.00 as win_rate
FROM teams
WHERE is_active = true;

-- =================================================================
-- 2. 添加示例比赛数据 (LPL春季赛)
-- =================================================================

-- 为春季赛添加参赛队伍
INSERT INTO competition_teams (competition_id, team_id, seed)
SELECT
    (SELECT id FROM competitions WHERE type = 'spring' AND name = 'S1春季赛'),
    t.id,
    ROW_NUMBER() OVER (PARTITION BY r.code ORDER BY t.power_rating DESC)
FROM teams t
JOIN regions r ON t.region_id = r.id
WHERE t.is_active = true;

-- =================================================================
-- 3. 创建示例比赛 (每个赛区内的循环赛)
-- =================================================================

-- LPL内部比赛
WITH lpl_teams AS (
    SELECT t.id, t.name, ROW_NUMBER() OVER (ORDER BY t.power_rating DESC) as rn
    FROM teams t
    JOIN regions r ON t.region_id = r.id
    WHERE r.code = 'LPL' AND t.is_active = true
    LIMIT 10
)
INSERT INTO matches (competition_id, team_a_id, team_b_id, format, phase, round_number, match_number, status, scheduled_at)
SELECT
    (SELECT id FROM competitions WHERE type = 'spring' AND name = 'S1春季赛'),
    a.id,
    b.id,
    'BO3',
    'regular_season',
    1,
    ROW_NUMBER() OVER (),
    'scheduled',
    CURRENT_TIMESTAMP + (ROW_NUMBER() OVER () || ' days')::INTERVAL
FROM lpl_teams a
CROSS JOIN lpl_teams b
WHERE a.id < b.id
LIMIT 15;

-- LCK内部比赛
WITH lck_teams AS (
    SELECT t.id, t.name, ROW_NUMBER() OVER (ORDER BY t.power_rating DESC) as rn
    FROM teams t
    JOIN regions r ON t.region_id = r.id
    WHERE r.code = 'LCK' AND t.is_active = true
    LIMIT 10
)
INSERT INTO matches (competition_id, team_a_id, team_b_id, format, phase, round_number, match_number, status, scheduled_at)
SELECT
    (SELECT id FROM competitions WHERE type = 'spring' AND name = 'S1春季赛'),
    a.id,
    b.id,
    'BO3',
    'regular_season',
    1,
    ROW_NUMBER() OVER () + 100,
    'scheduled',
    CURRENT_TIMESTAMP + (ROW_NUMBER() OVER () + 1 || ' days')::INTERVAL
FROM lck_teams a
CROSS JOIN lck_teams b
WHERE a.id < b.id
LIMIT 15;

-- =================================================================
-- 4. 模拟一些已完成的比赛
-- =================================================================

-- 随机完成一些比赛并设置结果
UPDATE matches SET
    status = 'completed',
    score_a = CASE WHEN random() > 0.5 THEN 2 ELSE CASE WHEN random() > 0.3 THEN 1 ELSE 0 END END,
    score_b = CASE WHEN random() > 0.5 THEN 2 ELSE CASE WHEN random() > 0.3 THEN 1 ELSE 0 END END,
    started_at = scheduled_at,
    completed_at = scheduled_at + INTERVAL '2 hours'
WHERE id IN (
    SELECT id FROM matches
    WHERE status = 'scheduled'
    ORDER BY random()
    LIMIT 10
);

-- 设置获胜者
UPDATE matches SET
    winner_id = CASE
        WHEN score_a > score_b THEN team_a_id
        WHEN score_b > score_a THEN team_b_id
        ELSE NULL
    END
WHERE status = 'completed' AND winner_id IS NULL;

-- =================================================================
-- 5. 插入积分记录
-- =================================================================

-- 为完成的比赛插入积分记录
INSERT INTO score_records (team_id, competition_id, match_id, points, point_type, season_year, description)
SELECT
    m.winner_id,
    m.competition_id,
    m.id,
    CASE
        WHEN m.score_a = 2 AND m.score_b = 0 THEN 3  -- 2:0 获胜
        WHEN m.score_a = 0 AND m.score_b = 2 THEN 3  -- 2:0 获胜
        WHEN m.score_a = 2 AND m.score_b = 1 THEN 2  -- 2:1 获胜
        WHEN m.score_a = 1 AND m.score_b = 2 THEN 2  -- 2:1 获胜
        ELSE 1
    END,
    'regular_season_win',
    2024,
    '常规赛获胜积分'
FROM matches m
WHERE m.status = 'completed' AND m.winner_id IS NOT NULL;

-- 为失败者插入积分记录
INSERT INTO score_records (team_id, competition_id, match_id, points, point_type, season_year, description)
SELECT
    CASE WHEN m.winner_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END,
    m.competition_id,
    m.id,
    CASE
        WHEN (m.score_a = 1 AND m.score_b = 2) OR (m.score_a = 2 AND m.score_b = 1) THEN 1  -- 1:2 失败
        ELSE 0
    END,
    'regular_season_loss',
    2024,
    '常规赛失败积分'
FROM matches m
WHERE m.status = 'completed' AND m.winner_id IS NOT NULL;

-- =================================================================
-- 6. 更新战队统计数据
-- =================================================================

-- 更新team_statistics表
UPDATE team_statistics ts SET
    spring_points = (
        SELECT COALESCE(SUM(sr.points), 0)
        FROM score_records sr
        JOIN competitions c ON sr.competition_id = c.id
        WHERE sr.team_id = ts.team_id
        AND sr.season_year = ts.season_year
        AND c.type = 'spring'
    ),
    total_points = (
        SELECT COALESCE(SUM(sr.points), 0)
        FROM score_records sr
        WHERE sr.team_id = ts.team_id
        AND sr.season_year = ts.season_year
    ),
    matches_played = (
        SELECT COUNT(*)
        FROM matches m
        WHERE (m.team_a_id = ts.team_id OR m.team_b_id = ts.team_id)
        AND m.status = 'completed'
    ),
    wins = (
        SELECT COUNT(*)
        FROM matches m
        WHERE m.winner_id = ts.team_id
        AND m.status = 'completed'
    ),
    losses = (
        SELECT COUNT(*)
        FROM matches m
        WHERE (m.team_a_id = ts.team_id OR m.team_b_id = ts.team_id)
        AND m.status = 'completed'
        AND m.winner_id != ts.team_id
    ),
    last_updated = CURRENT_TIMESTAMP
WHERE ts.season_year = 2024;

-- 计算胜率
UPDATE team_statistics SET
    win_rate = CASE
        WHEN matches_played > 0 THEN ROUND((wins::DECIMAL / matches_played) * 100, 2)
        ELSE 0.00
    END
WHERE season_year = 2024;

-- 计算当前排名
WITH rankings AS (
    SELECT
        team_id,
        ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC, win_rate DESC) as ranking
    FROM team_statistics
    WHERE season_year = 2024
)
UPDATE team_statistics ts SET
    current_ranking = r.ranking,
    peak_ranking = COALESCE(LEAST(peak_ranking, r.ranking), r.ranking)
FROM rankings r
WHERE ts.team_id = r.team_id AND ts.season_year = 2024;

-- =================================================================
-- 7. 创建更多赛事数据
-- =================================================================

-- 创建夏季赛
INSERT INTO competitions (season_id, type, name, format, scoring_rules, max_teams, start_date, end_date) VALUES
((SELECT id FROM seasons WHERE name = 'S1'), 'summer', 'S1夏季赛',
 '{"type": "league", "regular_season": {"format": "double_round_robin", "match_format": "BO3"}, "playoffs": {"format": "double_elimination", "match_format": "BO5"}}',
 '{"regular": {"win_2_0": 3, "win_2_1": 2, "loss_1_2": 1, "loss_0_2": 0}, "playoffs": {"champion": 12, "runner_up": 10, "third_place": 8, "fourth_place": 6}}',
 40, '2024-06-15', '2024-09-15');

-- 创建MSI
INSERT INTO competitions (season_id, type, name, format, scoring_rules, max_teams, start_date, end_date) VALUES
((SELECT id FROM seasons WHERE name = 'S1'), 'msi', 'S1季中冠军赛',
 '{"type": "international", "group_stage": {"format": "round_robin", "match_format": "BO1"}, "knockout": {"format": "single_elimination", "match_format": "BO5"}}',
 '{"group_stage": {"win": 2, "loss": 0}, "knockout": {"champion": 15, "runner_up": 12, "semifinal": 8, "quarterfinal": 4}}',
 12, '2024-05-01', '2024-05-20');

-- 创建世界赛
INSERT INTO competitions (season_id, type, name, format, scoring_rules, max_teams, start_date, end_date) VALUES
((SELECT id FROM seasons WHERE name = 'S1'), 'worlds', 'S1全球总决赛',
 '{"type": "international", "play_in": {"format": "round_robin", "match_format": "BO1"}, "group_stage": {"format": "round_robin", "match_format": "BO1"}, "knockout": {"format": "single_elimination", "match_format": "BO5"}}',
 '{"play_in": {"advance": 1}, "group_stage": {"win": 2, "loss": 0}, "knockout": {"champion": 20, "runner_up": 15, "semifinal": 10, "quarterfinal": 6}}',
 24, '2024-10-01', '2024-11-15');

SELECT 'Seed data insertion completed successfully!' as message;
SELECT 'Teams with statistics: ' || count(*) as teams_with_stats FROM team_statistics WHERE season_year = 2024;
SELECT 'Completed matches: ' || count(*) as completed_matches FROM matches WHERE status = 'completed';
SELECT 'Total competitions: ' || count(*) as total_competitions FROM competitions;