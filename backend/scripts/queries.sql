-- =================================================================
-- 常用查询脚本 - 电竞赛事模拟系统
-- =================================================================

-- 常用的数据库查询，用于开发和调试

-- =================================================================
-- 1. 基础查询
-- =================================================================

-- 1.1 查看所有战队及其赛区信息
SELECT
    t.id,
    t.name,
    t.short_name,
    r.name as region_name,
    r.code as region_code,
    t.power_rating,
    t.total_matches,
    t.total_wins,
    t.total_losses,
    CASE
        WHEN t.total_matches > 0
        THEN ROUND((t.total_wins::DECIMAL / t.total_matches) * 100, 2)
        ELSE 0.00
    END as win_rate_calculated
FROM teams t
JOIN regions r ON t.region_id = r.id
WHERE t.is_active = true
ORDER BY r.display_order, t.power_rating DESC;

-- 1.2 查看当前活跃的赛季和赛事
SELECT
    s.name as season_name,
    s.year,
    s.status as season_status,
    s.current_phase,
    c.name as competition_name,
    c.type,
    c.status as competition_status,
    c.start_date,
    c.end_date
FROM seasons s
LEFT JOIN competitions c ON s.id = c.season_id
WHERE s.status = 'active'
ORDER BY c.start_date;

-- =================================================================
-- 2. 比赛相关查询
-- =================================================================

-- 2.1 查看最近的比赛结果
SELECT
    vmr.match_id,
    vmr.competition_name,
    vmr.team_a_name,
    vmr.team_a_short,
    vmr.score_a,
    vmr.score_b,
    vmr.team_b_name,
    vmr.team_b_short,
    vmr.winner_name,
    vmr.format,
    vmr.phase,
    vmr.completed_at
FROM v_match_results vmr
WHERE vmr.status = 'completed'
ORDER BY vmr.completed_at DESC
LIMIT 20;

-- 2.2 查看即将进行的比赛
SELECT
    vmr.match_id,
    vmr.competition_name,
    vmr.team_a_name,
    vmr.team_a_short,
    vmr.team_b_name,
    vmr.team_b_short,
    vmr.format,
    vmr.phase,
    vmr.scheduled_at
FROM v_match_results vmr
WHERE vmr.status = 'scheduled'
AND vmr.scheduled_at > CURRENT_TIMESTAMP
ORDER BY vmr.scheduled_at
LIMIT 20;

-- 2.3 查看某个战队的比赛历史
SELECT
    vmr.match_id,
    vmr.competition_name,
    vmr.competition_type,
    CASE
        WHEN vmr.team_a_name = 'JD Gaming' THEN vmr.team_b_name
        ELSE vmr.team_a_name
    END as opponent,
    CASE
        WHEN vmr.team_a_name = 'JD Gaming' THEN vmr.score_a || ':' || vmr.score_b
        ELSE vmr.score_b || ':' || vmr.score_a
    END as score,
    CASE
        WHEN vmr.winner_name = 'JD Gaming' THEN 'W'
        WHEN vmr.winner_name IS NULL THEN 'D'
        ELSE 'L'
    END as result,
    vmr.completed_at
FROM v_match_results vmr
WHERE (vmr.team_a_name = 'JD Gaming' OR vmr.team_b_name = 'JD Gaming')
AND vmr.status = 'completed'
ORDER BY vmr.completed_at DESC;

-- =================================================================
-- 3. 积分和排名查询
-- =================================================================

-- 3.1 查看当前积分排行榜
SELECT
    vtr.overall_ranking,
    vtr.team_name,
    vtr.short_name,
    vtr.region_name,
    vtr.total_points,
    vtr.spring_points,
    vtr.msi_points,
    vtr.summer_points,
    vtr.worlds_points,
    vtr.matches_played,
    vtr.wins,
    vtr.losses,
    vtr.win_rate
FROM v_team_rankings vtr
WHERE vtr.season_year = 2024
ORDER BY vtr.total_points DESC, vtr.wins DESC
LIMIT 20;

-- 3.2 查看各赛区排名前3的战队
WITH regional_rankings AS (
    SELECT
        vtr.*,
        ROW_NUMBER() OVER (PARTITION BY vtr.region_code ORDER BY vtr.total_points DESC) as regional_rank
    FROM v_team_rankings vtr
    WHERE vtr.season_year = 2024
)
SELECT
    region_name,
    regional_rank,
    team_name,
    short_name,
    total_points,
    matches_played,
    win_rate
FROM regional_rankings
WHERE regional_rank <= 3
ORDER BY region_name, regional_rank;

-- =================================================================
-- 4. 统计分析查询
-- =================================================================

-- 4.1 各赛区整体表现统计
SELECT
    r.name as region_name,
    r.code,
    COUNT(t.id) as team_count,
    ROUND(AVG(t.power_rating), 2) as avg_power_rating,
    SUM(ts.matches_played) as total_matches,
    SUM(ts.wins) as total_wins,
    SUM(ts.total_points) as total_points,
    ROUND(AVG(ts.win_rate), 2) as avg_win_rate
FROM regions r
LEFT JOIN teams t ON r.id = t.region_id AND t.is_active = true
LEFT JOIN team_statistics ts ON t.id = ts.team_id AND ts.season_year = 2024
GROUP BY r.id, r.name, r.code, r.display_order
ORDER BY r.display_order;

-- 4.2 比赛格式统计
SELECT
    format,
    COUNT(*) as match_count,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
    ROUND(
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) * 100,
        2
    ) as completion_rate
FROM matches
GROUP BY format
ORDER BY match_count DESC;

-- =================================================================
-- 5. 数据质量检查查询
-- =================================================================

-- 5.1 检查数据一致性
-- 检查孤立的比赛记录
SELECT 'Orphaned matches (no teams)' as check_type, COUNT(*) as count
FROM matches m
WHERE m.team_a_id NOT IN (SELECT id FROM teams)
   OR m.team_b_id NOT IN (SELECT id FROM teams)

UNION ALL

-- 检查孤立的积分记录
SELECT 'Orphaned score records' as check_type, COUNT(*) as count
FROM score_records sr
WHERE sr.team_id NOT IN (SELECT id FROM teams)

UNION ALL

-- 检查没有统计数据的活跃战队
SELECT 'Teams without statistics' as check_type, COUNT(*) as count
FROM teams t
WHERE t.is_active = true
AND t.id NOT IN (SELECT team_id FROM team_statistics WHERE season_year = 2024);

-- 5.2 检查比赛结果的一致性
SELECT
    'Matches with invalid winners' as check_type,
    COUNT(*) as count
FROM matches m
WHERE m.status = 'completed'
AND m.winner_id IS NOT NULL
AND m.winner_id NOT IN (m.team_a_id, m.team_b_id);

-- =================================================================
-- 6. 性能监控查询
-- =================================================================

-- 6.1 查看表大小
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 6.2 查看索引使用情况
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- =================================================================
-- 7. 业务逻辑查询
-- =================================================================

-- 7.1 计算战队之间的交锋记录
SELECT
    ta.name as team_a,
    tb.name as team_b,
    hth.total_matches,
    hth.team_a_wins,
    hth.team_b_wins,
    hth.last_match_date,
    CASE
        WHEN hth.team_a_wins > hth.team_b_wins THEN ta.name
        WHEN hth.team_b_wins > hth.team_a_wins THEN tb.name
        ELSE 'Tied'
    END as leading_team
FROM head_to_head_records hth
JOIN teams ta ON hth.team_a_id = ta.id
JOIN teams tb ON hth.team_b_id = tb.id
WHERE hth.total_matches > 0
ORDER BY hth.total_matches DESC;

-- 7.2 查看最有价值的积分获得
SELECT
    t.name as team_name,
    c.name as competition_name,
    sr.points,
    sr.point_type,
    sr.description,
    sr.earned_at
FROM score_records sr
JOIN teams t ON sr.team_id = t.id
JOIN competitions c ON sr.competition_id = c.id
WHERE sr.season_year = 2024
ORDER BY sr.points DESC, sr.earned_at DESC
LIMIT 20;

-- =================================================================
-- 8. 快速统计概览
-- =================================================================

-- 数据库概览统计
SELECT 'Database Overview' as section, 'Total Records' as metric, '' as details

UNION ALL

SELECT '', 'Regions', COUNT(*)::TEXT FROM regions

UNION ALL

SELECT '', 'Teams', COUNT(*)::TEXT FROM teams WHERE is_active = true

UNION ALL

SELECT '', 'Competitions', COUNT(*)::TEXT FROM competitions

UNION ALL

SELECT '', 'Matches', COUNT(*)::TEXT FROM matches

UNION ALL

SELECT '', 'Completed Matches', COUNT(*)::TEXT FROM matches WHERE status = 'completed'

UNION ALL

SELECT '', 'Score Records', COUNT(*)::TEXT FROM score_records

UNION ALL

SELECT '', 'Team Statistics', COUNT(*)::TEXT FROM team_statistics WHERE season_year = 2024;