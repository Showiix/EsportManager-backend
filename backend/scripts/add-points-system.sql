-- =================================================================
-- 赛事积分系统增强脚本
-- 日期: 2025-10-13
-- 目的: 添加playoff_points字段并创建积分分配函数
-- =================================================================

-- 1. 检查并添加playoff_points字段到team_statistics表
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'team_statistics' AND column_name = 'playoff_points'
    ) THEN
        ALTER TABLE team_statistics ADD COLUMN playoff_points INTEGER DEFAULT 0;
        RAISE NOTICE 'Added playoff_points column to team_statistics table';
    END IF;
END $$;

-- 2. 更新total_points计算逻辑（包含playoff_points）
-- 注意：洲际赛积分不计入total_points
COMMENT ON COLUMN team_statistics.total_points IS '年度总积分 = spring_points + summer_points + playoff_points + msi_points + worlds_points (不包含洲际赛)';
COMMENT ON COLUMN team_statistics.playoff_points IS '季后赛积分（春季赛+夏季赛）';

-- 3. 创建积分分配辅助函数
CREATE OR REPLACE FUNCTION award_points_to_team(
    p_team_id INTEGER,
    p_season_year INTEGER,
    p_points INTEGER,
    p_point_type VARCHAR(50),
    p_competition_id INTEGER DEFAULT NULL,
    p_match_id INTEGER DEFAULT NULL,
    p_description TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_existing_stat_id INTEGER;
BEGIN
    -- 1. 确保team_statistics记录存在
    SELECT id INTO v_existing_stat_id
    FROM team_statistics
    WHERE team_id = p_team_id AND season_year = p_season_year;

    IF v_existing_stat_id IS NULL THEN
        -- 创建新记录
        INSERT INTO team_statistics (team_id, season_year, total_points)
        VALUES (p_team_id, p_season_year, 0);
    END IF;

    -- 2. 记录积分到score_records
    INSERT INTO score_records (
        team_id,
        competition_id,
        match_id,
        points,
        point_type,
        season_year,
        description
    ) VALUES (
        p_team_id,
        p_competition_id,
        p_match_id,
        p_points,
        p_point_type,
        p_season_year,
        p_description
    );

    -- 3. 更新team_statistics中的对应积分字段
    CASE p_point_type
        WHEN 'spring_regular' THEN
            UPDATE team_statistics
            SET spring_points = spring_points + p_points
            WHERE team_id = p_team_id AND season_year = p_season_year;

        WHEN 'summer_regular' THEN
            UPDATE team_statistics
            SET summer_points = summer_points + p_points
            WHERE team_id = p_team_id AND season_year = p_season_year;

        WHEN 'spring_playoff', 'summer_playoff' THEN
            UPDATE team_statistics
            SET playoff_points = playoff_points + p_points
            WHERE team_id = p_team_id AND season_year = p_season_year;

        WHEN 'msi' THEN
            UPDATE team_statistics
            SET msi_points = msi_points + p_points
            WHERE team_id = p_team_id AND season_year = p_season_year;

        WHEN 'worlds' THEN
            UPDATE team_statistics
            SET worlds_points = worlds_points + p_points
            WHERE team_id = p_team_id AND season_year = p_season_year;
        
        ELSE
            -- 其他类型积分（如洲际赛）不计入分类积分
            NULL;
    END CASE;

    -- 4. 更新总积分（不包含洲际赛）
    UPDATE team_statistics
    SET total_points = spring_points + summer_points + playoff_points + msi_points + worlds_points,
        last_updated = CURRENT_TIMESTAMP
    WHERE team_id = p_team_id AND season_year = p_season_year;

    RAISE NOTICE 'Awarded % points to team_id=% for % (season %)', p_points, p_team_id, p_point_type, p_season_year;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION award_points_to_team IS '给战队分配积分，自动更新team_statistics和score_records';

-- 4. 创建查询战队积分详情的函数
CREATE OR REPLACE FUNCTION get_team_points_breakdown(
    p_team_id INTEGER,
    p_season_year INTEGER
) RETURNS TABLE (
    team_id INTEGER,
    team_name VARCHAR,
    season_year INTEGER,
    total_points INTEGER,
    spring_points INTEGER,
    summer_points INTEGER,
    playoff_points INTEGER,
    msi_points INTEGER,
    worlds_points INTEGER,
    point_details JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ts.team_id,
        t.name,
        ts.season_year,
        ts.total_points,
        ts.spring_points,
        ts.summer_points,
        ts.playoff_points,
        ts.msi_points,
        ts.worlds_points,
        (
            SELECT json_agg(
                json_build_object(
                    'point_type', sr.point_type,
                    'points', sr.points,
                    'earned_at', sr.earned_at,
                    'description', sr.description
                ) ORDER BY sr.earned_at
            )::JSONB
            FROM score_records sr
            WHERE sr.team_id = ts.team_id AND sr.season_year = ts.season_year
        ) as point_details
    FROM team_statistics ts
    JOIN teams t ON ts.team_id = t.id
    WHERE ts.team_id = p_team_id AND ts.season_year = p_season_year;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_team_points_breakdown IS '获取战队积分详细信息';

-- 5. 创建批量重新计算积分的函数
CREATE OR REPLACE FUNCTION recalculate_team_points(
    p_season_year INTEGER
) RETURNS TABLE (
    team_id INTEGER,
    team_name VARCHAR,
    old_total_points INTEGER,
    new_total_points INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH points_summary AS (
        SELECT
            sr.team_id,
            SUM(CASE WHEN sr.point_type = 'spring_regular' THEN sr.points ELSE 0 END) as spring_pts,
            SUM(CASE WHEN sr.point_type = 'summer_regular' THEN sr.points ELSE 0 END) as summer_pts,
            SUM(CASE WHEN sr.point_type IN ('spring_playoff', 'summer_playoff') THEN sr.points ELSE 0 END) as playoff_pts,
            SUM(CASE WHEN sr.point_type = 'msi' THEN sr.points ELSE 0 END) as msi_pts,
            SUM(CASE WHEN sr.point_type = 'worlds' THEN sr.points ELSE 0 END) as worlds_pts
        FROM score_records sr
        WHERE sr.season_year = p_season_year
        GROUP BY sr.team_id
    )
    SELECT
        ts.team_id,
        t.name,
        ts.total_points as old_total,
        COALESCE(ps.spring_pts, 0) + COALESCE(ps.summer_pts, 0) + 
        COALESCE(ps.playoff_pts, 0) + COALESCE(ps.msi_pts, 0) + 
        COALESCE(ps.worlds_pts, 0) as new_total
    FROM team_statistics ts
    JOIN teams t ON ts.team_id = t.id
    LEFT JOIN points_summary ps ON ts.team_id = ps.team_id
    WHERE ts.season_year = p_season_year;

    -- 执行更新
    UPDATE team_statistics ts
    SET
        spring_points = COALESCE(ps.spring_pts, 0),
        summer_points = COALESCE(ps.summer_pts, 0),
        playoff_points = COALESCE(ps.playoff_pts, 0),
        msi_points = COALESCE(ps.msi_pts, 0),
        worlds_points = COALESCE(ps.worlds_pts, 0),
        total_points = COALESCE(ps.spring_pts, 0) + COALESCE(ps.summer_pts, 0) + 
                      COALESCE(ps.playoff_pts, 0) + COALESCE(ps.msi_pts, 0) + 
                      COALESCE(ps.worlds_pts, 0),
        last_updated = CURRENT_TIMESTAMP
    FROM (
        SELECT
            sr.team_id,
            SUM(CASE WHEN sr.point_type = 'spring_regular' THEN sr.points ELSE 0 END) as spring_pts,
            SUM(CASE WHEN sr.point_type = 'summer_regular' THEN sr.points ELSE 0 END) as summer_pts,
            SUM(CASE WHEN sr.point_type IN ('spring_playoff', 'summer_playoff') THEN sr.points ELSE 0 END) as playoff_pts,
            SUM(CASE WHEN sr.point_type = 'msi' THEN sr.points ELSE 0 END) as msi_pts,
            SUM(CASE WHEN sr.point_type = 'worlds' THEN sr.points ELSE 0 END) as worlds_pts
        FROM score_records sr
        WHERE sr.season_year = p_season_year
        GROUP BY sr.team_id
    ) ps
    WHERE ts.team_id = ps.team_id AND ts.season_year = p_season_year;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_team_points IS '重新计算指定赛季所有战队的积分';

-- =================================================================
-- 测试数据（可选）
-- =================================================================

-- 测试award_points_to_team函数
-- SELECT award_points_to_team(1, 2024, 12, 'spring_playoff', NULL, NULL, '春季赛冠军');
-- SELECT * FROM get_team_points_breakdown(1, 2024);

-- =================================================================
-- 完成信息
-- =================================================================

SELECT '积分系统增强脚本执行成功!' as message;
SELECT 'Created functions: award_points_to_team, get_team_points_breakdown, recalculate_team_points' as functions;

