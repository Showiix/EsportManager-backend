-- 更新get_team_points_breakdown函数以支持新的积分字段
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
    spring_playoff_points INTEGER,
    summer_playoff_points INTEGER,
    playoff_points INTEGER,
    msi_points INTEGER,
    worlds_points INTEGER,
    intercontinental_points INTEGER,
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
        ts.spring_playoff_points,
        ts.summer_playoff_points,
        ts.playoff_points,
        ts.msi_points,
        ts.worlds_points,
        ts.intercontinental_points,
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

COMMENT ON FUNCTION get_team_points_breakdown IS '获取战队积分详细信息（包含C洲际赛积分）';

SELECT 'Function get_team_points_breakdown updated successfully!' as result;

