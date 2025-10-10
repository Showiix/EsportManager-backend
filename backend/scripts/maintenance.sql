-- =================================================================
-- 数据库维护脚本 - 电竞赛事模拟系统
-- =================================================================

-- 用于数据库维护、清理和优化的脚本

-- =================================================================
-- 1. 数据库重置和清理
-- =================================================================

-- 1.1 清理所有数据但保留表结构
CREATE OR REPLACE FUNCTION reset_all_data()
RETURNS void AS $$
BEGIN
    -- 禁用触发器
    SET session_replication_role = replica;

    -- 清空所有表数据
    TRUNCATE TABLE score_records RESTART IDENTITY CASCADE;
    TRUNCATE TABLE team_statistics RESTART IDENTITY CASCADE;
    TRUNCATE TABLE head_to_head_records RESTART IDENTITY CASCADE;
    TRUNCATE TABLE matches RESTART IDENTITY CASCADE;
    TRUNCATE TABLE competition_teams RESTART IDENTITY CASCADE;
    TRUNCATE TABLE competitions RESTART IDENTITY CASCADE;
    TRUNCATE TABLE seasons RESTART IDENTITY CASCADE;
    TRUNCATE TABLE teams RESTART IDENTITY CASCADE;
    TRUNCATE TABLE regions RESTART IDENTITY CASCADE;

    -- 重新启用触发器
    SET session_replication_role = DEFAULT;

    RAISE NOTICE 'All data has been cleared successfully!';
END;
$$ LANGUAGE plpgsql;

-- 1.2 重置特定赛季数据
CREATE OR REPLACE FUNCTION reset_season_data(season_year_param INTEGER)
RETURNS void AS $$
BEGIN
    -- 删除积分记录
    DELETE FROM score_records WHERE season_year = season_year_param;

    -- 删除统计数据
    DELETE FROM team_statistics WHERE season_year = season_year_param;

    -- 删除比赛记录
    DELETE FROM matches m
    WHERE m.competition_id IN (
        SELECT c.id FROM competitions c
        JOIN seasons s ON c.season_id = s.id
        WHERE s.year = season_year_param
    );

    -- 删除参赛队伍关联
    DELETE FROM competition_teams ct
    WHERE ct.competition_id IN (
        SELECT c.id FROM competitions c
        JOIN seasons s ON c.season_id = s.id
        WHERE s.year = season_year_param
    );

    -- 删除赛事
    DELETE FROM competitions c
    WHERE c.season_id IN (
        SELECT s.id FROM seasons s WHERE s.year = season_year_param
    );

    -- 删除赛季
    DELETE FROM seasons WHERE year = season_year_param;

    -- 重置战队统计
    UPDATE teams SET
        total_matches = 0,
        total_wins = 0,
        total_losses = 0,
        net_round_difference = 0;

    RAISE NOTICE 'Season % data has been reset successfully!', season_year_param;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 2. 数据修复函数
-- =================================================================

-- 2.1 修复战队统计数据
CREATE OR REPLACE FUNCTION fix_team_statistics()
RETURNS void AS $$
BEGIN
    -- 重新计算战队基础统计
    UPDATE teams SET
        total_matches = (
            SELECT COUNT(*)
            FROM matches m
            WHERE (m.team_a_id = teams.id OR m.team_b_id = teams.id)
            AND m.status = 'completed'
        ),
        total_wins = (
            SELECT COUNT(*)
            FROM matches m
            WHERE m.winner_id = teams.id
        ),
        total_losses = (
            SELECT COUNT(*)
            FROM matches m
            WHERE (m.team_a_id = teams.id OR m.team_b_id = teams.id)
            AND m.status = 'completed'
            AND m.winner_id != teams.id
        ),
        net_round_difference = (
            SELECT COALESCE(SUM(
                CASE
                    WHEN m.team_a_id = teams.id THEN (m.score_a - m.score_b)
                    WHEN m.team_b_id = teams.id THEN (m.score_b - m.score_a)
                    ELSE 0
                END
            ), 0)
            FROM matches m
            WHERE (m.team_a_id = teams.id OR m.team_b_id = teams.id)
            AND m.status = 'completed'
        );

    -- 更新team_statistics表
    UPDATE team_statistics ts SET
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
        ),
        losses = (
            SELECT COUNT(*)
            FROM matches m
            WHERE (m.team_a_id = ts.team_id OR m.team_b_id = ts.team_id)
            AND m.status = 'completed'
            AND m.winner_id != ts.team_id
        ),
        spring_points = (
            SELECT COALESCE(SUM(sr.points), 0)
            FROM score_records sr
            JOIN competitions c ON sr.competition_id = c.id
            WHERE sr.team_id = ts.team_id
            AND sr.season_year = ts.season_year
            AND c.type = 'spring'
        ),
        msi_points = (
            SELECT COALESCE(SUM(sr.points), 0)
            FROM score_records sr
            JOIN competitions c ON sr.competition_id = c.id
            WHERE sr.team_id = ts.team_id
            AND sr.season_year = ts.season_year
            AND c.type = 'msi'
        ),
        summer_points = (
            SELECT COALESCE(SUM(sr.points), 0)
            FROM score_records sr
            JOIN competitions c ON sr.competition_id = c.id
            WHERE sr.team_id = ts.team_id
            AND sr.season_year = ts.season_year
            AND c.type = 'summer'
        ),
        worlds_points = (
            SELECT COALESCE(SUM(sr.points), 0)
            FROM score_records sr
            JOIN competitions c ON sr.competition_id = c.id
            WHERE sr.team_id = ts.team_id
            AND sr.season_year = ts.season_year
            AND c.type = 'worlds'
        ),
        total_points = (
            SELECT COALESCE(SUM(sr.points), 0)
            FROM score_records sr
            WHERE sr.team_id = ts.team_id
            AND sr.season_year = ts.season_year
        );

    -- 重新计算胜率
    UPDATE team_statistics SET
        win_rate = CASE
            WHEN matches_played > 0 THEN ROUND((wins::DECIMAL / matches_played) * 100, 2)
            ELSE 0.00
        END;

    RAISE NOTICE 'Team statistics have been fixed successfully!';
END;
$$ LANGUAGE plpgsql;

-- 2.2 修复交锋记录
CREATE OR REPLACE FUNCTION fix_head_to_head_records()
RETURNS void AS $$
BEGIN
    -- 清空现有交锋记录
    TRUNCATE TABLE head_to_head_records RESTART IDENTITY;

    -- 重新生成交锋记录
    INSERT INTO head_to_head_records (team_a_id, team_b_id, total_matches, team_a_wins, team_b_wins, last_match_date, last_match_id)
    SELECT
        LEAST(m.team_a_id, m.team_b_id) as team_a_id,
        GREATEST(m.team_a_id, m.team_b_id) as team_b_id,
        COUNT(*) as total_matches,
        SUM(CASE WHEN m.winner_id = LEAST(m.team_a_id, m.team_b_id) THEN 1 ELSE 0 END) as team_a_wins,
        SUM(CASE WHEN m.winner_id = GREATEST(m.team_a_id, m.team_b_id) THEN 1 ELSE 0 END) as team_b_wins,
        MAX(m.completed_at::DATE) as last_match_date,
        (SELECT id FROM matches WHERE completed_at = MAX(m.completed_at) AND
         ((team_a_id = LEAST(m.team_a_id, m.team_b_id) AND team_b_id = GREATEST(m.team_a_id, m.team_b_id)) OR
          (team_a_id = GREATEST(m.team_a_id, m.team_b_id) AND team_b_id = LEAST(m.team_a_id, m.team_b_id)))
         LIMIT 1) as last_match_id
    FROM matches m
    WHERE m.status = 'completed'
    GROUP BY LEAST(m.team_a_id, m.team_b_id), GREATEST(m.team_a_id, m.team_b_id);

    RAISE NOTICE 'Head-to-head records have been fixed successfully!';
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 3. 数据库优化
-- =================================================================

-- 3.1 更新统计信息
CREATE OR REPLACE FUNCTION update_database_statistics()
RETURNS void AS $$
BEGIN
    -- 更新所有表的统计信息
    ANALYZE regions;
    ANALYZE teams;
    ANALYZE seasons;
    ANALYZE competitions;
    ANALYZE competition_teams;
    ANALYZE matches;
    ANALYZE score_records;
    ANALYZE team_statistics;
    ANALYZE head_to_head_records;

    RAISE NOTICE 'Database statistics updated successfully!';
END;
$$ LANGUAGE plpgsql;

-- 3.2 重建索引
CREATE OR REPLACE FUNCTION rebuild_indexes()
RETURNS void AS $$
BEGIN
    -- 重建所有索引
    REINDEX TABLE regions;
    REINDEX TABLE teams;
    REINDEX TABLE seasons;
    REINDEX TABLE competitions;
    REINDEX TABLE competition_teams;
    REINDEX TABLE matches;
    REINDEX TABLE score_records;
    REINDEX TABLE team_statistics;
    REINDEX TABLE head_to_head_records;

    RAISE NOTICE 'All indexes rebuilt successfully!';
END;
$$ LANGUAGE plpgsql;

-- 3.3 清理垃圾数据
CREATE OR REPLACE FUNCTION vacuum_database()
RETURNS void AS $$
BEGIN
    VACUUM ANALYZE;
    RAISE NOTICE 'Database vacuum completed successfully!';
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 4. 数据验证函数
-- =================================================================

-- 4.1 验证数据完整性
CREATE OR REPLACE FUNCTION validate_data_integrity()
RETURNS TABLE(check_name TEXT, issue_count INTEGER, description TEXT) AS $$
BEGIN
    RETURN QUERY
    -- 检查孤立的比赛记录
    SELECT
        'Orphaned Matches' as check_name,
        COUNT(*)::INTEGER as issue_count,
        'Matches with non-existent teams' as description
    FROM matches m
    WHERE m.team_a_id NOT IN (SELECT id FROM teams)
       OR m.team_b_id NOT IN (SELECT id FROM teams)

    UNION ALL

    -- 检查孤立的积分记录
    SELECT
        'Orphaned Score Records' as check_name,
        COUNT(*)::INTEGER as issue_count,
        'Score records with non-existent teams or competitions' as description
    FROM score_records sr
    WHERE sr.team_id NOT IN (SELECT id FROM teams)
       OR sr.competition_id NOT IN (SELECT id FROM competitions)

    UNION ALL

    -- 检查无效的获胜者
    SELECT
        'Invalid Winners' as check_name,
        COUNT(*)::INTEGER as issue_count,
        'Completed matches with invalid winner_id' as description
    FROM matches m
    WHERE m.status = 'completed'
    AND m.winner_id IS NOT NULL
    AND m.winner_id NOT IN (m.team_a_id, m.team_b_id)

    UNION ALL

    -- 检查没有统计数据的活跃战队
    SELECT
        'Missing Team Statistics' as check_name,
        COUNT(*)::INTEGER as issue_count,
        'Active teams without statistics for current season' as description
    FROM teams t
    WHERE t.is_active = true
    AND t.id NOT IN (SELECT team_id FROM team_statistics WHERE season_year = EXTRACT(YEAR FROM CURRENT_DATE))

    UNION ALL

    -- 检查积分不一致
    SELECT
        'Inconsistent Points' as check_name,
        COUNT(*)::INTEGER as issue_count,
        'Teams with mismatched points in team_statistics' as description
    FROM team_statistics ts
    WHERE ts.total_points != (
        SELECT COALESCE(SUM(sr.points), 0)
        FROM score_records sr
        WHERE sr.team_id = ts.team_id
        AND sr.season_year = ts.season_year
    );
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 5. 定期维护任务
-- =================================================================

-- 5.1 每日维护任务
CREATE OR REPLACE FUNCTION daily_maintenance()
RETURNS void AS $$
BEGIN
    -- 更新统计信息
    PERFORM update_database_statistics();

    -- 验证数据完整性
    PERFORM validate_data_integrity();

    -- 轻量级清理
    VACUUM ANALYZE;

    RAISE NOTICE 'Daily maintenance completed at %', CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- 5.2 每周维护任务
CREATE OR REPLACE FUNCTION weekly_maintenance()
RETURNS void AS $$
BEGIN
    -- 修复统计数据
    PERFORM fix_team_statistics();

    -- 修复交锋记录
    PERFORM fix_head_to_head_records();

    -- 重建索引
    PERFORM rebuild_indexes();

    -- 全面清理
    PERFORM vacuum_database();

    RAISE NOTICE 'Weekly maintenance completed at %', CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 6. 备份和恢复辅助函数
-- =================================================================

-- 6.1 导出基础数据
CREATE OR REPLACE FUNCTION export_base_data()
RETURNS void AS $$
BEGIN
    -- 这个函数生成基础数据的备份命令提示
    RAISE NOTICE 'To backup base data, run:';
    RAISE NOTICE 'pg_dump -h localhost -p 5432 -U postgres -d esports_simulator --data-only --table=regions --table=teams > base_data_backup.sql';
END;
$$ LANGUAGE plpgsql;

-- 6.2 检查备份状态
CREATE OR REPLACE FUNCTION check_backup_status()
RETURNS TABLE(table_name TEXT, record_count BIGINT, last_modified TIMESTAMP) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.table_name::TEXT,
        (SELECT COUNT(*) FROM regions) as record_count,
        (SELECT MAX(updated_at) FROM regions) as last_modified
    FROM information_schema.tables t
    WHERE t.table_name = 'regions' AND t.table_schema = 'public'

    UNION ALL

    SELECT
        t.table_name::TEXT,
        (SELECT COUNT(*) FROM teams) as record_count,
        (SELECT MAX(updated_at) FROM teams) as last_modified
    FROM information_schema.tables t
    WHERE t.table_name = 'teams' AND t.table_schema = 'public'

    UNION ALL

    SELECT
        t.table_name::TEXT,
        (SELECT COUNT(*) FROM matches) as record_count,
        (SELECT MAX(updated_at) FROM matches) as last_modified
    FROM information_schema.tables t
    WHERE t.table_name = 'matches' AND t.table_schema = 'public';
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 使用说明
-- =================================================================

/*
维护脚本使用说明：

1. 每日维护：
   SELECT daily_maintenance();

2. 每周维护：
   SELECT weekly_maintenance();

3. 重置所有数据：
   SELECT reset_all_data();

4. 重置特定赛季：
   SELECT reset_season_data(2024);

5. 修复统计数据：
   SELECT fix_team_statistics();

6. 验证数据完整性：
   SELECT * FROM validate_data_integrity();

7. 更新数据库统计：
   SELECT update_database_statistics();

8. 检查备份状态：
   SELECT * FROM check_backup_status();
*/