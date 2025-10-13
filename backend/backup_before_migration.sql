--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: calculate_win_rate(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_win_rate(wins integer, total_matches integer) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    IF total_matches = 0 THEN
        RETURN 0.00;
    END IF;
    RETURN ROUND((wins::DECIMAL / total_matches::DECIMAL) * 100, 2);
END;
$$;


ALTER FUNCTION public.calculate_win_rate(wins integer, total_matches integer) OWNER TO postgres;

--
-- Name: FUNCTION calculate_win_rate(wins integer, total_matches integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.calculate_win_rate(wins integer, total_matches integer) IS '计算胜率百分比';


--
-- Name: process_match_result(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.process_match_result() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- 只在比赛完成时处理
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- 更新战队统计
        UPDATE teams SET
            total_matches = total_matches + 1,
            total_wins = CASE WHEN NEW.winner_id = id THEN total_wins + 1 ELSE total_wins END,
            total_losses = CASE WHEN NEW.winner_id != id THEN total_losses + 1 ELSE total_losses END,
            net_round_difference = CASE
                WHEN id = NEW.team_a_id THEN net_round_difference + (NEW.score_a - NEW.score_b)
                WHEN id = NEW.team_b_id THEN net_round_difference + (NEW.score_b - NEW.score_a)
                ELSE net_round_difference
            END
        WHERE id IN (NEW.team_a_id, NEW.team_b_id);

        -- 更新或创建交锋记录
        INSERT INTO head_to_head_records (team_a_id, team_b_id, total_matches, team_a_wins, team_b_wins, last_match_date, last_match_id)
        VALUES (
            LEAST(NEW.team_a_id, NEW.team_b_id),
            GREATEST(NEW.team_a_id, NEW.team_b_id),
            1,
            CASE WHEN NEW.winner_id = LEAST(NEW.team_a_id, NEW.team_b_id) THEN 1 ELSE 0 END,
            CASE WHEN NEW.winner_id = GREATEST(NEW.team_a_id, NEW.team_b_id) THEN 1 ELSE 0 END,
            CURRENT_DATE,
            NEW.id
        )
        ON CONFLICT (team_a_id, team_b_id) DO UPDATE SET
            total_matches = head_to_head_records.total_matches + 1,
            team_a_wins = CASE WHEN NEW.winner_id = head_to_head_records.team_a_id
                          THEN head_to_head_records.team_a_wins + 1
                          ELSE head_to_head_records.team_a_wins END,
            team_b_wins = CASE WHEN NEW.winner_id = head_to_head_records.team_b_id
                          THEN head_to_head_records.team_b_wins + 1
                          ELSE head_to_head_records.team_b_wins END,
            last_match_date = CURRENT_DATE,
            last_match_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.process_match_result() OWNER TO postgres;

--
-- Name: refresh_regional_standings(integer, integer, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.refresh_regional_standings(p_region_id integer, p_season_id integer, p_competition_type character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- 根据比赛结果重新计算积分榜
    -- 这个函数会在RankingService中调用
    -- 暂时留空，由后端服务实现具体逻辑
    RAISE NOTICE 'Refreshing regional standings for region_id=%, season_id=%, type=%',
        p_region_id, p_season_id, p_competition_type;
END;
$$;


ALTER FUNCTION public.refresh_regional_standings(p_region_id integer, p_season_id integer, p_competition_type character varying) OWNER TO postgres;

--
-- Name: FUNCTION refresh_regional_standings(p_region_id integer, p_season_id integer, p_competition_type character varying); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.refresh_regional_standings(p_region_id integer, p_season_id integer, p_competition_type character varying) IS '刷新赛区常规赛积分榜';


--
-- Name: update_msi_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_msi_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_msi_updated_at() OWNER TO postgres;

--
-- Name: update_playoff_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_playoff_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.update_playoff_updated_at() OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: annual_rankings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.annual_rankings (
    id integer NOT NULL,
    team_id integer NOT NULL,
    season_id integer NOT NULL,
    total_points integer DEFAULT 0,
    spring_points integer DEFAULT 0,
    summer_points integer DEFAULT 0,
    playoff_points integer DEFAULT 0,
    msi_points integer DEFAULT 0,
    worlds_points integer DEFAULT 0,
    intercontinental_points integer DEFAULT 0,
    achievements jsonb DEFAULT '[]'::jsonb,
    "position" integer,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.annual_rankings OWNER TO postgres;

--
-- Name: TABLE annual_rankings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.annual_rankings IS '年度积分排名表';


--
-- Name: COLUMN annual_rankings.total_points; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.annual_rankings.total_points IS '年度总积分（不包含洲际赛荣誉积分）';


--
-- Name: COLUMN annual_rankings.intercontinental_points; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.annual_rankings.intercontinental_points IS '洲际赛荣誉积分（仅展示，不计入总分）';


--
-- Name: COLUMN annual_rankings.achievements; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.annual_rankings.achievements IS 'JSON数组，存储成就列表';


--
-- Name: annual_rankings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.annual_rankings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.annual_rankings_id_seq OWNER TO postgres;

--
-- Name: annual_rankings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.annual_rankings_id_seq OWNED BY public.annual_rankings.id;


--
-- Name: competition_teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competition_teams (
    id integer NOT NULL,
    competition_id integer,
    team_id integer,
    seed integer,
    group_name character varying(10),
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.competition_teams OWNER TO postgres;

--
-- Name: competition_teams_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.competition_teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.competition_teams_id_seq OWNER TO postgres;

--
-- Name: competition_teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.competition_teams_id_seq OWNED BY public.competition_teams.id;


--
-- Name: competitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.competitions (
    id integer NOT NULL,
    season_id integer,
    type character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    format jsonb DEFAULT '{}'::jsonb NOT NULL,
    scoring_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'planning'::character varying,
    max_teams integer DEFAULT 40,
    start_date date,
    end_date date,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT competitions_status_check CHECK (((status)::text = ANY ((ARRAY['planning'::character varying, 'active'::character varying, 'completed'::character varying])::text[]))),
    CONSTRAINT competitions_type_check CHECK (((type)::text = ANY ((ARRAY['spring'::character varying, 'summer'::character varying, 'msi'::character varying, 'worlds'::character varying])::text[])))
);


ALTER TABLE public.competitions OWNER TO postgres;

--
-- Name: competitions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.competitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.competitions_id_seq OWNER TO postgres;

--
-- Name: competitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.competitions_id_seq OWNED BY public.competitions.id;


--
-- Name: head_to_head_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.head_to_head_records (
    id integer NOT NULL,
    team_a_id integer,
    team_b_id integer,
    total_matches integer DEFAULT 0,
    team_a_wins integer DEFAULT 0,
    team_b_wins integer DEFAULT 0,
    last_match_date date,
    last_match_id integer,
    CONSTRAINT head_to_head_records_check CHECK ((team_a_id < team_b_id))
);


ALTER TABLE public.head_to_head_records OWNER TO postgres;

--
-- Name: head_to_head_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.head_to_head_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.head_to_head_records_id_seq OWNER TO postgres;

--
-- Name: head_to_head_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.head_to_head_records_id_seq OWNED BY public.head_to_head_records.id;


--
-- Name: honor_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.honor_records (
    id integer NOT NULL,
    season_id integer NOT NULL,
    competition_id integer NOT NULL,
    team_id integer NOT NULL,
    "position" integer NOT NULL,
    points integer DEFAULT 0,
    achievement_date timestamp without time zone,
    special_record text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT honor_records_position_check CHECK ((("position" >= 1) AND ("position" <= 4)))
);


ALTER TABLE public.honor_records OWNER TO postgres;

--
-- Name: TABLE honor_records; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.honor_records IS '荣誉记录表，存储各赛事的冠亚季军';


--
-- Name: COLUMN honor_records."position"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.honor_records."position" IS '名次：1=冠军, 2=亚军, 3=季军, 4=第四名';


--
-- Name: COLUMN honor_records.special_record; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.honor_records.special_record IS '特殊记录，如"三连冠"、"不败夺冠"等';


--
-- Name: honor_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.honor_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.honor_records_id_seq OWNER TO postgres;

--
-- Name: honor_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.honor_records_id_seq OWNED BY public.honor_records.id;


--
-- Name: matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matches (
    id integer NOT NULL,
    competition_id integer,
    team_a_id integer,
    team_b_id integer,
    score_a integer DEFAULT 0,
    score_b integer DEFAULT 0,
    winner_id integer,
    format character varying(10) DEFAULT 'BO3'::character varying,
    phase character varying(50) NOT NULL,
    round_number integer,
    match_number integer,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    scheduled_at timestamp without time zone,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT matches_check CHECK ((team_a_id <> team_b_id)),
    CONSTRAINT matches_check1 CHECK ((((winner_id = team_a_id) OR (winner_id = team_b_id)) OR (winner_id IS NULL))),
    CONSTRAINT matches_format_check CHECK (((format)::text = ANY ((ARRAY['BO1'::character varying, 'BO3'::character varying, 'BO5'::character varying])::text[]))),
    CONSTRAINT matches_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


ALTER TABLE public.matches OWNER TO postgres;

--
-- Name: matches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.matches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.matches_id_seq OWNER TO postgres;

--
-- Name: matches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.matches_id_seq OWNED BY public.matches.id;


--
-- Name: msi_brackets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.msi_brackets (
    id integer NOT NULL,
    season_id integer NOT NULL,
    season_year integer NOT NULL,
    status character varying(20) DEFAULT 'not_started'::character varying NOT NULL,
    qualified_teams jsonb NOT NULL,
    legendary_group jsonb NOT NULL,
    challenger_group jsonb NOT NULL,
    qualifier_group jsonb NOT NULL,
    champion_id integer,
    runner_up_id integer,
    third_place_id integer,
    fourth_place_id integer,
    loser_round_2 jsonb,
    loser_round_1 jsonb,
    points_distribution jsonb DEFAULT '{"champion": 20, "runnerUp": 16, "thirdPlace": 12, "fourthPlace": 8, "loserRound1": 4, "loserRound2": 6}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT msi_brackets_status_check CHECK (((status)::text = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.msi_brackets OWNER TO postgres;

--
-- Name: TABLE msi_brackets; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.msi_brackets IS 'MSI季中邀请赛对阵表';


--
-- Name: COLUMN msi_brackets.qualified_teams; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_brackets.qualified_teams IS '12支参赛队伍的完整信息(JSON数组)';


--
-- Name: COLUMN msi_brackets.legendary_group; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_brackets.legendary_group IS '传奇组4队:各赛区春季赛冠军';


--
-- Name: COLUMN msi_brackets.challenger_group; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_brackets.challenger_group IS '挑战者组4队:各赛区春季赛亚军';


--
-- Name: COLUMN msi_brackets.qualifier_group; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_brackets.qualifier_group IS '资格赛组4队:各赛区春季赛季军';


--
-- Name: COLUMN msi_brackets.points_distribution; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_brackets.points_distribution IS '积分分配规则(JSON对象)';


--
-- Name: msi_brackets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.msi_brackets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.msi_brackets_id_seq OWNER TO postgres;

--
-- Name: msi_brackets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.msi_brackets_id_seq OWNED BY public.msi_brackets.id;


--
-- Name: msi_matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.msi_matches (
    id integer NOT NULL,
    msi_bracket_id integer NOT NULL,
    round_number integer NOT NULL,
    match_type character varying(30) NOT NULL,
    bracket_type character varying(20) NOT NULL,
    best_of integer DEFAULT 5 NOT NULL,
    match_number integer,
    team_a_id integer,
    team_b_id integer,
    team_a_name character varying(100),
    team_b_name character varying(100),
    team_a_seed integer,
    team_b_seed integer,
    score_a integer DEFAULT 0 NOT NULL,
    score_b integer DEFAULT 0 NOT NULL,
    winner_id integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    next_match_id integer,
    loser_next_match_id integer,
    scheduled_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT msi_matches_bracket_type_check CHECK (((bracket_type)::text = ANY ((ARRAY['winners'::character varying, 'losers'::character varying, 'qualifier'::character varying, 'challenger'::character varying, 'grand_final'::character varying])::text[]))),
    CONSTRAINT msi_matches_match_type_check CHECK (((match_type)::text = ANY ((ARRAY['qualifier_knockout'::character varying, 'challenger_match'::character varying, 'losers_round_1'::character varying, 'losers_round_2'::character varying, 'winners_round_1'::character varying, 'losers_round_3'::character varying, 'losers_round_4'::character varying, 'winners_round_2'::character varying, 'losers_final'::character varying, 'grand_final'::character varying])::text[]))),
    CONSTRAINT msi_matches_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.msi_matches OWNER TO postgres;

--
-- Name: TABLE msi_matches; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.msi_matches IS 'MSI季中邀请赛比赛表';


--
-- Name: COLUMN msi_matches.match_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_matches.match_type IS '比赛类型:qualifier_knockout, challenger_match, losers_round_1-4, winners_round_1-2, losers_final, grand_final';


--
-- Name: COLUMN msi_matches.bracket_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_matches.bracket_type IS '对阵组类型:winners, losers, qualifier, challenger, grand_final';


--
-- Name: COLUMN msi_matches.best_of; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_matches.best_of IS 'BO几,MSI全部为BO5';


--
-- Name: COLUMN msi_matches.next_match_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_matches.next_match_id IS '胜者进入的下一场比赛';


--
-- Name: COLUMN msi_matches.loser_next_match_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.msi_matches.loser_next_match_id IS '败者进入的下一场比赛(双败淘汰特有)';


--
-- Name: msi_matches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.msi_matches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.msi_matches_id_seq OWNER TO postgres;

--
-- Name: msi_matches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.msi_matches_id_seq OWNED BY public.msi_matches.id;


--
-- Name: playoff_brackets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.playoff_brackets (
    id character varying(36) NOT NULL,
    competition_id integer,
    region_id integer,
    region_name character varying(100) NOT NULL,
    competition_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'not_started'::character varying,
    qualified_teams jsonb DEFAULT '[]'::jsonb,
    champion_id integer,
    runner_up_id integer,
    third_place_id integer,
    fourth_place_id integer,
    points_distribution jsonb DEFAULT '{"champion": 12, "runnerUp": 10, "thirdPlace": 8, "fourthPlace": 6}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.playoff_brackets OWNER TO postgres;

--
-- Name: playoff_matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.playoff_matches (
    id character varying(36) NOT NULL,
    playoff_bracket_id character varying(36),
    competition_id integer,
    round_number integer NOT NULL,
    match_type character varying(20) NOT NULL,
    best_of integer DEFAULT 5,
    team_a_id integer,
    team_b_id integer,
    team_a_name character varying(255),
    team_b_name character varying(255),
    team_a_seed integer,
    team_b_seed integer,
    score_a integer DEFAULT 0,
    score_b integer DEFAULT 0,
    winner_id integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    next_match_id character varying(36),
    loser_next_match_id character varying(36),
    scheduled_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.playoff_matches OWNER TO postgres;

--
-- Name: regional_standings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.regional_standings (
    id integer NOT NULL,
    team_id integer NOT NULL,
    region_id integer NOT NULL,
    season_id integer NOT NULL,
    competition_type character varying(20) NOT NULL,
    matches_played integer DEFAULT 0,
    wins integer DEFAULT 0,
    losses integer DEFAULT 0,
    win_rate numeric(5,2) DEFAULT 0.00,
    regular_season_points integer DEFAULT 0,
    round_differential integer DEFAULT 0,
    "position" integer,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT regional_standings_competition_type_check CHECK (((competition_type)::text = ANY ((ARRAY['spring'::character varying, 'summer'::character varying])::text[])))
);


ALTER TABLE public.regional_standings OWNER TO postgres;

--
-- Name: TABLE regional_standings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.regional_standings IS '赛区常规赛积分榜表';


--
-- Name: COLUMN regional_standings.competition_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.regional_standings.competition_type IS '赛事类型：spring春季赛, summer夏季赛';


--
-- Name: COLUMN regional_standings.win_rate; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.regional_standings.win_rate IS '胜率百分比，如 83.33';


--
-- Name: COLUMN regional_standings.round_differential; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.regional_standings.round_differential IS '小场分差 = 赢的小场数 - 输的小场数';


--
-- Name: regional_standings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.regional_standings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.regional_standings_id_seq OWNER TO postgres;

--
-- Name: regional_standings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.regional_standings_id_seq OWNED BY public.regional_standings.id;


--
-- Name: regions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.regions (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(10) NOT NULL,
    description text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.regions OWNER TO postgres;

--
-- Name: regions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.regions_id_seq OWNER TO postgres;

--
-- Name: regions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.regions_id_seq OWNED BY public.regions.id;


--
-- Name: score_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.score_records (
    id integer NOT NULL,
    team_id integer,
    competition_id integer,
    match_id integer,
    points integer DEFAULT 0 NOT NULL,
    point_type character varying(50) NOT NULL,
    season_year integer NOT NULL,
    earned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.score_records OWNER TO postgres;

--
-- Name: score_records_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.score_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.score_records_id_seq OWNER TO postgres;

--
-- Name: score_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.score_records_id_seq OWNED BY public.score_records.id;


--
-- Name: seasons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.seasons (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    year integer NOT NULL,
    status character varying(20) DEFAULT 'planning'::character varying,
    current_phase character varying(50),
    start_date date,
    end_date date,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT seasons_status_check CHECK (((status)::text = ANY ((ARRAY['planning'::character varying, 'active'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.seasons OWNER TO postgres;

--
-- Name: seasons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.seasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.seasons_id_seq OWNER TO postgres;

--
-- Name: seasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.seasons_id_seq OWNED BY public.seasons.id;


--
-- Name: team_statistics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_statistics (
    id integer NOT NULL,
    team_id integer,
    season_year integer NOT NULL,
    total_points integer DEFAULT 0,
    spring_points integer DEFAULT 0,
    msi_points integer DEFAULT 0,
    summer_points integer DEFAULT 0,
    worlds_points integer DEFAULT 0,
    current_ranking integer,
    peak_ranking integer,
    matches_played integer DEFAULT 0,
    wins integer DEFAULT 0,
    losses integer DEFAULT 0,
    win_rate numeric(5,2) DEFAULT 0.00,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.team_statistics OWNER TO postgres;

--
-- Name: team_statistics_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_statistics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.team_statistics_id_seq OWNER TO postgres;

--
-- Name: team_statistics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_statistics_id_seq OWNED BY public.team_statistics.id;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    short_name character varying(10) NOT NULL,
    region_id integer,
    power_rating integer DEFAULT 50,
    founded_date date,
    logo_url character varying(255),
    is_active boolean DEFAULT true,
    total_matches integer DEFAULT 0,
    total_wins integer DEFAULT 0,
    total_losses integer DEFAULT 0,
    net_round_difference integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT teams_power_rating_check CHECK (((power_rating >= 0) AND (power_rating <= 100)))
);


ALTER TABLE public.teams OWNER TO postgres;

--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.teams_id_seq OWNER TO postgres;

--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;


--
-- Name: v_annual_rankings; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_annual_rankings AS
 SELECT ar.id,
    ar.team_id,
    t.name AS team_name,
    t.short_name,
    t.region_id,
    r.name AS region_name,
    r.code AS region_code,
    ar.season_id,
    s.name AS season_name,
    s.year AS season_year,
    ar.total_points,
    ar.spring_points,
    ar.summer_points,
    ar.playoff_points,
    ar.msi_points,
    ar.worlds_points,
    ar.intercontinental_points,
    ar.achievements,
    ar."position",
    ar.last_updated
   FROM (((public.annual_rankings ar
     JOIN public.teams t ON ((ar.team_id = t.id)))
     JOIN public.regions r ON ((t.region_id = r.id)))
     JOIN public.seasons s ON ((ar.season_id = s.id)))
  WHERE (t.is_active = true)
  ORDER BY ar.season_id, ar."position";


ALTER VIEW public.v_annual_rankings OWNER TO postgres;

--
-- Name: VIEW v_annual_rankings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.v_annual_rankings IS '年度积分排名视图，包含完整的队伍和赛季信息';


--
-- Name: v_honor_hall; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_honor_hall AS
 SELECT hr.id,
    hr.season_id,
    s.name AS season_name,
    s.year AS season_year,
    hr.competition_id,
    c.name AS competition_name,
    c.type AS competition_type,
    hr.team_id,
    t.name AS team_name,
    t.short_name,
    t.region_id,
    r.name AS region_name,
    r.code AS region_code,
    hr."position",
        CASE hr."position"
            WHEN 1 THEN '冠军'::text
            WHEN 2 THEN '亚军'::text
            WHEN 3 THEN '季军'::text
            WHEN 4 THEN '第四名'::text
            ELSE '其他'::text
        END AS position_name,
    hr.points,
    hr.achievement_date,
    hr.special_record,
    hr.created_at
   FROM ((((public.honor_records hr
     JOIN public.seasons s ON ((hr.season_id = s.id)))
     JOIN public.competitions c ON ((hr.competition_id = c.id)))
     JOIN public.teams t ON ((hr.team_id = t.id)))
     JOIN public.regions r ON ((t.region_id = r.id)))
  WHERE (t.is_active = true)
  ORDER BY hr.season_id DESC, c.type, hr."position";


ALTER VIEW public.v_honor_hall OWNER TO postgres;

--
-- Name: VIEW v_honor_hall; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.v_honor_hall IS '荣誉殿堂视图，展示所有赛事的冠亚季军';


--
-- Name: v_match_results; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_match_results AS
 SELECT m.id AS match_id,
    c.name AS competition_name,
    c.type AS competition_type,
    ta.name AS team_a_name,
    ta.short_name AS team_a_short,
    tb.name AS team_b_name,
    tb.short_name AS team_b_short,
    m.score_a,
    m.score_b,
    tw.name AS winner_name,
    tw.short_name AS winner_short,
    m.format,
    m.phase,
    m.round_number,
    m.status,
    m.scheduled_at,
    m.started_at,
    m.completed_at,
    s.name AS season_name,
    s.year AS season_year
   FROM (((((public.matches m
     JOIN public.competitions c ON ((m.competition_id = c.id)))
     JOIN public.seasons s ON ((c.season_id = s.id)))
     JOIN public.teams ta ON ((m.team_a_id = ta.id)))
     JOIN public.teams tb ON ((m.team_b_id = tb.id)))
     LEFT JOIN public.teams tw ON ((m.winner_id = tw.id)));


ALTER VIEW public.v_match_results OWNER TO postgres;

--
-- Name: v_regional_standings; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_regional_standings AS
 SELECT rs.id,
    rs.team_id,
    t.name AS team_name,
    t.short_name,
    rs.region_id,
    r.name AS region_name,
    r.code AS region_code,
    rs.season_id,
    s.name AS season_name,
    s.year AS season_year,
    rs.competition_type,
    rs.matches_played,
    rs.wins,
    rs.losses,
    rs.win_rate,
    rs.regular_season_points,
    rs.round_differential,
    rs."position",
    rs.last_updated
   FROM (((public.regional_standings rs
     JOIN public.teams t ON ((rs.team_id = t.id)))
     JOIN public.regions r ON ((rs.region_id = r.id)))
     JOIN public.seasons s ON ((rs.season_id = s.id)))
  WHERE (t.is_active = true)
  ORDER BY rs.region_id, rs.season_id, rs.competition_type, rs."position";


ALTER VIEW public.v_regional_standings OWNER TO postgres;

--
-- Name: VIEW v_regional_standings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.v_regional_standings IS '赛区积分榜视图，包含完整的队伍和赛区信息';


--
-- Name: v_team_rankings; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_team_rankings AS
 SELECT ts.team_id,
    t.name AS team_name,
    t.short_name,
    r.name AS region_name,
    r.code AS region_code,
    ts.season_year,
    ts.total_points,
    ts.spring_points,
    ts.msi_points,
    ts.summer_points,
    ts.worlds_points,
    ts.current_ranking,
    ts.peak_ranking,
    ts.matches_played,
    ts.wins,
    ts.losses,
    ts.win_rate,
    t.power_rating,
    row_number() OVER (PARTITION BY ts.season_year ORDER BY ts.total_points DESC) AS overall_ranking
   FROM ((public.team_statistics ts
     JOIN public.teams t ON ((ts.team_id = t.id)))
     JOIN public.regions r ON ((t.region_id = r.id)))
  WHERE (t.is_active = true);


ALTER VIEW public.v_team_rankings OWNER TO postgres;

--
-- Name: annual_rankings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.annual_rankings ALTER COLUMN id SET DEFAULT nextval('public.annual_rankings_id_seq'::regclass);


--
-- Name: competition_teams id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_teams ALTER COLUMN id SET DEFAULT nextval('public.competition_teams_id_seq'::regclass);


--
-- Name: competitions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competitions ALTER COLUMN id SET DEFAULT nextval('public.competitions_id_seq'::regclass);


--
-- Name: head_to_head_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.head_to_head_records ALTER COLUMN id SET DEFAULT nextval('public.head_to_head_records_id_seq'::regclass);


--
-- Name: honor_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.honor_records ALTER COLUMN id SET DEFAULT nextval('public.honor_records_id_seq'::regclass);


--
-- Name: matches id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches ALTER COLUMN id SET DEFAULT nextval('public.matches_id_seq'::regclass);


--
-- Name: msi_brackets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_brackets ALTER COLUMN id SET DEFAULT nextval('public.msi_brackets_id_seq'::regclass);


--
-- Name: msi_matches id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches ALTER COLUMN id SET DEFAULT nextval('public.msi_matches_id_seq'::regclass);


--
-- Name: regional_standings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regional_standings ALTER COLUMN id SET DEFAULT nextval('public.regional_standings_id_seq'::regclass);


--
-- Name: regions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions ALTER COLUMN id SET DEFAULT nextval('public.regions_id_seq'::regclass);


--
-- Name: score_records id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.score_records ALTER COLUMN id SET DEFAULT nextval('public.score_records_id_seq'::regclass);


--
-- Name: seasons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seasons ALTER COLUMN id SET DEFAULT nextval('public.seasons_id_seq'::regclass);


--
-- Name: team_statistics id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_statistics ALTER COLUMN id SET DEFAULT nextval('public.team_statistics_id_seq'::regclass);


--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Data for Name: annual_rankings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.annual_rankings (id, team_id, season_id, total_points, spring_points, summer_points, playoff_points, msi_points, worlds_points, intercontinental_points, achievements, "position", last_updated, created_at, updated_at) FROM stdin;
1	29	1	0	0	0	0	0	0	0	[]	1	2025-10-12 00:42:49.593624	2025-10-12 00:42:49.593624	2025-10-12 00:42:49.633259
2	4	1	0	0	0	0	0	0	0	[]	2	2025-10-12 00:42:49.596109	2025-10-12 00:42:49.596109	2025-10-12 00:42:49.633259
3	34	1	0	0	0	0	0	0	0	[]	3	2025-10-12 00:42:49.597161	2025-10-12 00:42:49.597161	2025-10-12 00:42:49.633259
4	40	1	0	0	0	0	0	0	0	[]	4	2025-10-12 00:42:49.598085	2025-10-12 00:42:49.598085	2025-10-12 00:42:49.633259
5	32	1	0	0	0	0	0	0	0	[]	5	2025-10-12 00:42:49.599816	2025-10-12 00:42:49.599816	2025-10-12 00:42:49.633259
6	7	1	0	0	0	0	0	0	0	[]	6	2025-10-12 00:42:49.601011	2025-10-12 00:42:49.601011	2025-10-12 00:42:49.633259
7	10	1	0	0	0	0	0	0	0	[]	7	2025-10-12 00:42:49.602042	2025-10-12 00:42:49.602042	2025-10-12 00:42:49.633259
8	9	1	0	0	0	0	0	0	0	[]	8	2025-10-12 00:42:49.602873	2025-10-12 00:42:49.602873	2025-10-12 00:42:49.633259
9	35	1	0	0	0	0	0	0	0	[]	9	2025-10-12 00:42:49.603946	2025-10-12 00:42:49.603946	2025-10-12 00:42:49.633259
10	38	1	0	0	0	0	0	0	0	[]	10	2025-10-12 00:42:49.605062	2025-10-12 00:42:49.605062	2025-10-12 00:42:49.633259
11	15	1	0	0	0	0	0	0	0	[]	11	2025-10-12 00:42:49.606551	2025-10-12 00:42:49.606551	2025-10-12 00:42:49.633259
12	6	1	0	0	0	0	0	0	0	[]	12	2025-10-12 00:42:49.607546	2025-10-12 00:42:49.607546	2025-10-12 00:42:49.633259
13	26	1	0	0	0	0	0	0	0	[]	13	2025-10-12 00:42:49.608399	2025-10-12 00:42:49.608399	2025-10-12 00:42:49.633259
14	12	1	0	0	0	0	0	0	0	[]	14	2025-10-12 00:42:49.609203	2025-10-12 00:42:49.609203	2025-10-12 00:42:49.633259
15	39	1	0	0	0	0	0	0	0	[]	15	2025-10-12 00:42:49.610036	2025-10-12 00:42:49.610036	2025-10-12 00:42:49.633259
16	24	1	0	0	0	0	0	0	0	[]	16	2025-10-12 00:42:49.611004	2025-10-12 00:42:49.611004	2025-10-12 00:42:49.633259
17	19	1	0	0	0	0	0	0	0	[]	17	2025-10-12 00:42:49.611858	2025-10-12 00:42:49.611858	2025-10-12 00:42:49.633259
18	36	1	0	0	0	0	0	0	0	[]	18	2025-10-12 00:42:49.612726	2025-10-12 00:42:49.612726	2025-10-12 00:42:49.633259
19	25	1	0	0	0	0	0	0	0	[]	19	2025-10-12 00:42:49.613976	2025-10-12 00:42:49.613976	2025-10-12 00:42:49.633259
20	31	1	0	0	0	0	0	0	0	[]	20	2025-10-12 00:42:49.614919	2025-10-12 00:42:49.614919	2025-10-12 00:42:49.633259
21	30	1	0	0	0	0	0	0	0	[]	21	2025-10-12 00:42:49.615795	2025-10-12 00:42:49.615795	2025-10-12 00:42:49.633259
22	21	1	0	0	0	0	0	0	0	[]	22	2025-10-12 00:42:49.616717	2025-10-12 00:42:49.616717	2025-10-12 00:42:49.633259
23	14	1	0	0	0	0	0	0	0	[]	23	2025-10-12 00:42:49.617651	2025-10-12 00:42:49.617651	2025-10-12 00:42:49.633259
24	3	1	0	0	0	0	0	0	0	[]	24	2025-10-12 00:42:49.61852	2025-10-12 00:42:49.61852	2025-10-12 00:42:49.633259
25	17	1	0	0	0	0	0	0	0	[]	25	2025-10-12 00:42:49.619344	2025-10-12 00:42:49.619344	2025-10-12 00:42:49.633259
26	37	1	0	0	0	0	0	0	0	[]	26	2025-10-12 00:42:49.620135	2025-10-12 00:42:49.620135	2025-10-12 00:42:49.633259
27	28	1	0	0	0	0	0	0	0	[]	27	2025-10-12 00:42:49.620921	2025-10-12 00:42:49.620921	2025-10-12 00:42:49.633259
28	22	1	0	0	0	0	0	0	0	[]	28	2025-10-12 00:42:49.621694	2025-10-12 00:42:49.621694	2025-10-12 00:42:49.633259
29	20	1	0	0	0	0	0	0	0	[]	29	2025-10-12 00:42:49.622489	2025-10-12 00:42:49.622489	2025-10-12 00:42:49.633259
30	33	1	0	0	0	0	0	0	0	[]	30	2025-10-12 00:42:49.623274	2025-10-12 00:42:49.623274	2025-10-12 00:42:49.633259
31	13	1	0	0	0	0	0	0	0	[]	31	2025-10-12 00:42:49.624324	2025-10-12 00:42:49.624324	2025-10-12 00:42:49.633259
32	1	1	0	0	0	0	0	0	0	[]	32	2025-10-12 00:42:49.625195	2025-10-12 00:42:49.625195	2025-10-12 00:42:49.633259
33	5	1	0	0	0	0	0	0	0	[]	33	2025-10-12 00:42:49.626125	2025-10-12 00:42:49.626125	2025-10-12 00:42:49.633259
34	18	1	0	0	0	0	0	0	0	[]	34	2025-10-12 00:42:49.627134	2025-10-12 00:42:49.627134	2025-10-12 00:42:49.633259
35	2	1	0	0	0	0	0	0	0	[]	35	2025-10-12 00:42:49.628121	2025-10-12 00:42:49.628121	2025-10-12 00:42:49.633259
36	16	1	0	0	0	0	0	0	0	[]	36	2025-10-12 00:42:49.629294	2025-10-12 00:42:49.629294	2025-10-12 00:42:49.633259
37	27	1	0	0	0	0	0	0	0	[]	37	2025-10-12 00:42:49.630252	2025-10-12 00:42:49.630252	2025-10-12 00:42:49.633259
38	23	1	0	0	0	0	0	0	0	[]	38	2025-10-12 00:42:49.631115	2025-10-12 00:42:49.631115	2025-10-12 00:42:49.633259
39	8	1	0	0	0	0	0	0	0	[]	39	2025-10-12 00:42:49.631908	2025-10-12 00:42:49.631908	2025-10-12 00:42:49.633259
40	11	1	0	0	0	0	0	0	0	[]	40	2025-10-12 00:42:49.632915	2025-10-12 00:42:49.632915	2025-10-12 00:42:49.633259
\.


--
-- Data for Name: competition_teams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.competition_teams (id, competition_id, team_id, seed, group_name, joined_at) FROM stdin;
1	1	11	1	\N	2025-10-11 18:41:38.827974
2	1	12	2	\N	2025-10-11 18:41:38.827974
3	1	13	3	\N	2025-10-11 18:41:38.827974
4	1	14	4	\N	2025-10-11 18:41:38.827974
5	1	15	5	\N	2025-10-11 18:41:38.827974
6	1	16	6	\N	2025-10-11 18:41:38.827974
7	1	17	7	\N	2025-10-11 18:41:38.827974
8	1	18	8	\N	2025-10-11 18:41:38.827974
9	1	19	9	\N	2025-10-11 18:41:38.827974
10	1	20	10	\N	2025-10-11 18:41:38.827974
11	1	31	1	\N	2025-10-11 18:41:38.827974
12	1	32	2	\N	2025-10-11 18:41:38.827974
13	1	33	3	\N	2025-10-11 18:41:38.827974
14	1	34	4	\N	2025-10-11 18:41:38.827974
15	1	35	5	\N	2025-10-11 18:41:38.827974
16	1	36	6	\N	2025-10-11 18:41:38.827974
17	1	37	7	\N	2025-10-11 18:41:38.827974
18	1	38	8	\N	2025-10-11 18:41:38.827974
19	1	39	9	\N	2025-10-11 18:41:38.827974
20	1	40	10	\N	2025-10-11 18:41:38.827974
21	1	21	1	\N	2025-10-11 18:41:38.827974
22	1	22	2	\N	2025-10-11 18:41:38.827974
23	1	23	3	\N	2025-10-11 18:41:38.827974
24	1	24	4	\N	2025-10-11 18:41:38.827974
25	1	25	5	\N	2025-10-11 18:41:38.827974
26	1	26	6	\N	2025-10-11 18:41:38.827974
27	1	27	7	\N	2025-10-11 18:41:38.827974
28	1	28	8	\N	2025-10-11 18:41:38.827974
29	1	29	9	\N	2025-10-11 18:41:38.827974
30	1	30	10	\N	2025-10-11 18:41:38.827974
31	1	1	1	\N	2025-10-11 18:41:38.827974
32	1	2	2	\N	2025-10-11 18:41:38.827974
33	1	3	3	\N	2025-10-11 18:41:38.827974
34	1	4	4	\N	2025-10-11 18:41:38.827974
35	1	5	5	\N	2025-10-11 18:41:38.827974
36	1	6	6	\N	2025-10-11 18:41:38.827974
37	1	7	7	\N	2025-10-11 18:41:38.827974
38	1	8	8	\N	2025-10-11 18:41:38.827974
39	1	9	9	\N	2025-10-11 18:41:38.827974
40	1	10	10	\N	2025-10-11 18:41:38.827974
41	7	11	1	\N	2025-10-13 00:52:52.871317
42	7	1	2	\N	2025-10-13 00:52:52.891427
43	7	12	3	\N	2025-10-13 00:52:52.901124
44	7	2	4	\N	2025-10-13 00:52:52.909346
45	7	13	5	\N	2025-10-13 00:52:52.91772
46	7	21	6	\N	2025-10-13 00:52:52.926523
47	7	3	7	\N	2025-10-13 00:52:52.939899
48	7	31	8	\N	2025-10-13 00:52:52.956048
49	7	14	9	\N	2025-10-13 00:52:52.96677
50	7	22	10	\N	2025-10-13 00:52:52.976625
51	7	4	11	\N	2025-10-13 00:52:52.988434
52	7	15	12	\N	2025-10-13 00:52:52.998978
53	7	32	13	\N	2025-10-13 00:52:53.007613
54	7	23	14	\N	2025-10-13 00:52:53.017372
55	7	5	15	\N	2025-10-13 00:52:53.026782
56	7	33	16	\N	2025-10-13 00:52:53.035663
57	7	16	17	\N	2025-10-13 00:52:53.046411
58	7	24	18	\N	2025-10-13 00:52:53.054771
59	7	6	19	\N	2025-10-13 00:52:53.066706
60	7	17	20	\N	2025-10-13 00:52:53.074734
61	7	34	21	\N	2025-10-13 00:52:53.085055
62	7	7	22	\N	2025-10-13 00:52:53.092626
63	7	25	23	\N	2025-10-13 00:52:53.100605
64	7	8	24	\N	2025-10-13 00:52:53.108304
65	7	18	25	\N	2025-10-13 00:52:53.115736
66	7	35	26	\N	2025-10-13 00:52:53.123104
67	7	26	27	\N	2025-10-13 00:52:53.130492
68	7	9	28	\N	2025-10-13 00:52:53.137639
69	7	19	29	\N	2025-10-13 00:52:53.144848
70	7	36	30	\N	2025-10-13 00:52:53.153749
71	7	10	31	\N	2025-10-13 00:52:53.165572
72	7	27	32	\N	2025-10-13 00:52:53.174611
73	7	20	33	\N	2025-10-13 00:52:53.181858
74	7	37	34	\N	2025-10-13 00:52:53.189232
75	7	28	35	\N	2025-10-13 00:52:53.197452
76	7	38	36	\N	2025-10-13 00:52:53.204962
77	7	29	37	\N	2025-10-13 00:52:53.212283
78	7	39	38	\N	2025-10-13 00:52:53.219391
79	7	30	39	\N	2025-10-13 00:52:53.226775
80	7	40	40	\N	2025-10-13 00:52:53.234334
\.


--
-- Data for Name: competitions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.competitions (id, season_id, type, name, format, scoring_rules, status, max_teams, start_date, end_date, description, created_at, updated_at) FROM stdin;
3	1	msi	S1季中冠军赛	{"type": "international", "knockout": {"format": "single_elimination", "match_format": "BO5"}, "group_stage": {"format": "round_robin", "match_format": "BO1"}}	{"knockout": {"champion": 15, "runner_up": 12, "semifinal": 8, "quarterfinal": 4}, "group_stage": {"win": 2, "loss": 0}}	planning	12	2024-05-01	2024-05-20	\N	2025-10-11 18:41:39.048689	2025-10-11 18:41:39.048689
4	1	worlds	S1全球总决赛	{"type": "international", "play_in": {"format": "round_robin", "match_format": "BO1"}, "knockout": {"format": "single_elimination", "match_format": "BO5"}, "group_stage": {"format": "round_robin", "match_format": "BO1"}}	{"play_in": {"advance": 1}, "knockout": {"champion": 20, "runner_up": 15, "semifinal": 10, "quarterfinal": 6}, "group_stage": {"win": 2, "loss": 0}}	planning	24	2024-10-01	2024-11-15	\N	2025-10-11 18:41:39.049058	2025-10-11 18:41:39.049058
1	1	spring	S1春季赛	{"type": "league", "playoffs": {"format": "double_elimination", "match_format": "BO5"}, "regular_season": {"format": "double_round_robin", "match_format": "BO3"}}	{"regular": {"win_2_0": 3, "win_2_1": 2, "loss_0_2": 0, "loss_1_2": 1}, "playoffs": {"champion": 12, "runner_up": 10, "third_place": 8, "fourth_place": 6}}	completed	40	2024-01-15	2024-04-15	\N	2025-10-11 18:41:03.407488	2025-10-12 08:55:08.246019
7	1	summer	2025 夏季赛	{"type": "league", "regularSeason": {"format": "round-robin", "matchFormat": "BO3"}}	{"regular": {"0-2": 0, "1-2": 1, "2-0": 3, "2-1": 2}}	active	40	2025-10-12	2026-01-10	\N	2025-10-13 00:52:52.834662	2025-10-13 00:52:53.287906
\.


--
-- Data for Name: head_to_head_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.head_to_head_records (id, team_a_id, team_b_id, total_matches, team_a_wins, team_b_wins, last_match_date, last_match_id) FROM stdin;
3154	13	18	4	2	2	2025-10-12	6408
3153	12	19	4	2	2	2025-10-12	6407
3152	11	20	4	2	2	2025-10-12	6406
3151	21	30	4	2	2	2025-10-12	6496
3157	22	29	4	2	2	2025-10-12	6497
3158	23	28	4	2	2	2025-10-12	6498
3159	24	27	4	2	2	2025-10-12	6499
3160	25	26	4	2	2	2025-10-12	6500
3237	22	24	4	2	2	2025-10-12	6507
3238	21	25	4	2	2	2025-10-12	6508
3192	12	20	4	2	2	2025-10-12	6411
3191	22	30	4	2	2	2025-10-12	6501
3197	21	23	4	2	2	2025-10-12	6502
3198	24	29	4	2	2	2025-10-12	6503
3239	26	29	4	2	2	2025-10-12	6509
3199	25	28	4	2	2	2025-10-12	6504
3200	26	27	4	2	2	2025-10-12	6505
3209	6	7	4	2	2	2025-10-12	6325
3208	5	8	4	2	2	2025-10-12	6324
3207	4	9	4	2	2	2025-10-12	6323
3206	1	3	4	2	2	2025-10-12	6322
3210	2	10	4	2	2	2025-10-12	6321
3240	27	28	4	2	2	2025-10-12	6510
3249	7	8	4	2	2	2025-10-12	6330
3248	6	9	4	2	2	2025-10-12	6329
3247	1	5	4	2	2	2025-10-12	6328
3246	2	4	4	2	2	2025-10-12	6327
3250	3	10	4	2	2	2025-10-12	6326
3170	1	10	5	2	3	2025-10-13	6991
3166	2	9	5	2	3	2025-10-13	6992
3167	3	8	5	2	3	2025-10-13	6993
3168	4	7	5	2	3	2025-10-13	6994
3169	5	6	5	2	3	2025-10-13	6995
3285	38	39	4	2	2	2025-10-12	6605
3284	31	37	4	2	2	2025-10-12	6604
3283	32	36	4	2	2	2025-10-12	6603
3282	33	35	4	2	2	2025-10-12	6602
3281	34	40	4	2	2	2025-10-12	6601
3276	18	19	4	2	2	2025-10-12	6425
3275	11	17	4	2	2	2025-10-12	6424
3274	12	16	4	2	2	2025-10-12	6423
3273	13	15	4	2	2	2025-10-12	6422
3272	14	20	4	2	2	2025-10-12	6421
3271	24	30	4	2	2	2025-10-12	6511
3245	37	38	4	2	2	2025-10-12	6600
3277	23	25	4	2	2	2025-10-12	6512
3244	36	39	4	2	2	2025-10-12	6599
3243	31	35	4	2	2	2025-10-12	6598
3242	32	34	4	2	2	2025-10-12	6597
3241	33	40	4	2	2	2025-10-12	6596
3236	17	18	4	2	2	2025-10-12	6420
3235	16	19	4	2	2	2025-10-12	6419
3234	11	15	4	2	2	2025-10-12	6418
3233	12	14	4	2	2	2025-10-12	6417
3232	13	20	4	2	2	2025-10-12	6416
3165	35	36	4	2	2	2025-10-12	6590
3164	34	37	4	2	2	2025-10-12	6589
3163	33	38	4	2	2	2025-10-12	6588
3162	32	39	4	2	2	2025-10-12	6587
3161	31	40	4	2	2	2025-10-12	6586
3156	15	16	4	2	2	2025-10-12	6410
3155	14	17	4	2	2	2025-10-12	6409
3231	23	30	4	2	2	2025-10-12	6506
3278	22	26	4	2	2	2025-10-12	6513
3279	21	27	4	2	2	2025-10-12	6514
3280	28	29	4	2	2	2025-10-12	6515
3286	3	5	4	2	2	2025-10-12	6332
3205	36	37	4	2	2	2025-10-12	6595
3204	35	38	4	2	2	2025-10-12	6594
3203	34	39	4	2	2	2025-10-12	6593
3202	31	33	4	2	2	2025-10-12	6592
3201	32	40	4	2	2	2025-10-12	6591
3196	16	17	4	2	2	2025-10-12	6415
3195	15	18	4	2	2	2025-10-12	6414
3194	14	19	4	2	2	2025-10-12	6413
3193	11	13	4	2	2	2025-10-12	6412
3324	32	38	4	2	2	2025-10-12	6609
3316	11	19	4	2	2	2025-10-12	6430
3314	13	17	4	2	2	2025-10-12	6428
3312	15	20	4	2	2	2025-10-12	6426
3318	23	27	4	2	2	2025-10-12	6518
3320	21	29	4	2	2	2025-10-12	6520
3328	2	8	4	2	2	2025-10-12	6339
3326	4	6	4	2	2	2025-10-12	6337
3330	5	10	4	2	2	2025-10-12	6336
3439	22	25	4	2	2	2025-10-12	6534
3447	1	6	4	2	2	2025-10-12	6353
3449	3	4	4	2	2	2025-10-12	6355
3485	34	35	4	2	2	2025-10-12	6630
3481	39	40	4	2	2	2025-10-12	6626
3483	32	37	4	2	2	2025-10-12	6628
3472	19	20	4	2	2	2025-10-12	6446
3473	11	18	4	2	2	2025-10-12	6447
3475	13	16	4	2	2	2025-10-12	6449
3477	21	28	4	2	2	2025-10-12	6537
3479	23	26	4	2	2	2025-10-12	6539
3487	2	7	4	2	2	2025-10-12	6358
3489	4	5	4	2	2	2025-10-12	6360
3289	8	9	4	2	2	2025-10-12	6335
3287	2	6	4	2	2	2025-10-12	6333
3290	4	10	4	2	2	2025-10-12	6331
3322	34	36	4	2	2	2025-10-12	6607
3362	35	37	4	2	2	2025-10-12	6612
3364	33	39	4	2	2	2025-10-12	6614
3357	25	27	4	2	2	2025-10-12	6522
3351	26	30	4	2	2	2025-10-12	6521
3355	13	19	4	2	2	2025-10-12	6434
3360	21	22	4	2	2	2025-10-12	6525
3353	15	17	4	2	2	2025-10-12	6432
3370	6	10	4	2	2	2025-10-12	6341
3366	5	7	4	2	2	2025-10-12	6342
3368	3	9	4	2	2	2025-10-12	6344
3402	36	38	4	2	2	2025-10-12	6617
3404	31	34	4	2	2	2025-10-12	6619
3400	22	23	4	2	2	2025-10-12	6530
3398	25	29	4	2	2	2025-10-12	6528
3396	12	13	4	2	2	2025-10-12	6440
3394	15	19	4	2	2	2025-10-12	6438
3392	17	20	4	2	2	2025-10-12	6436
3408	1	4	4	2	2	2025-10-12	6349
3406	6	8	4	2	2	2025-10-12	6347
3410	7	10	4	2	2	2025-10-12	6346
3441	38	40	4	2	2	2025-10-12	6621
3443	31	36	4	2	2	2025-10-12	6623
3445	33	34	4	2	2	2025-10-12	6625
3435	12	15	4	2	2	2025-10-12	6444
3433	17	19	4	2	2	2025-10-12	6442
3431	28	30	4	2	2	2025-10-12	6531
3438	21	26	4	2	2	2025-10-12	6533
3327	3	7	4	2	2	2025-10-12	6338
3482	31	38	4	2	2	2025-10-12	6627
3484	33	36	4	2	2	2025-10-12	6629
3474	12	17	4	2	2	2025-10-12	6448
3476	14	15	4	2	2	2025-10-12	6450
3471	29	30	4	2	2	2025-10-12	6536
3478	22	27	4	2	2	2025-10-12	6538
3480	24	25	4	2	2	2025-10-12	6540
3490	9	10	4	2	2	2025-10-12	6356
3486	1	8	4	2	2	2025-10-12	6357
3488	3	6	4	2	2	2025-10-12	6359
3361	36	40	4	2	2	2025-10-12	6611
3288	1	7	4	2	2	2025-10-12	6334
3363	34	38	4	2	2	2025-10-12	6613
3365	31	32	4	2	2	2025-10-12	6615
3354	14	18	4	2	2	2025-10-12	6433
3359	23	29	4	2	2	2025-10-12	6524
3358	24	28	4	2	2	2025-10-12	6523
3356	11	12	4	2	2	2025-10-12	6435
3352	16	20	4	2	2	2025-10-12	6431
3367	4	8	4	2	2	2025-10-12	6343
3369	1	2	4	2	2	2025-10-12	6345
3321	35	40	4	2	2	2025-10-12	6606
3323	33	37	4	2	2	2025-10-12	6608
3325	31	39	4	2	2	2025-10-12	6610
3315	12	18	4	2	2	2025-10-12	6429
3313	14	16	4	2	2	2025-10-12	6427
3311	25	30	4	2	2	2025-10-12	6516
3317	24	26	4	2	2	2025-10-12	6517
3319	22	28	4	2	2	2025-10-12	6519
3329	1	9	4	2	2	2025-10-12	6340
3403	35	39	4	2	2	2025-10-12	6618
3401	37	40	4	2	2	2025-10-12	6616
3405	32	33	4	2	2	2025-10-12	6620
3391	27	30	4	2	2	2025-10-12	6526
3397	26	28	4	2	2	2025-10-12	6527
3399	21	24	4	2	2	2025-10-12	6529
3395	11	14	4	2	2	2025-10-12	6439
3393	16	18	4	2	2	2025-10-12	6437
3409	2	3	4	2	2	2025-10-12	6350
3407	5	9	4	2	2	2025-10-12	6348
3442	37	39	4	2	2	2025-10-12	6622
3444	32	35	4	2	2	2025-10-12	6624
3436	13	14	4	2	2	2025-10-12	6445
3434	11	16	4	2	2	2025-10-12	6443
3432	18	20	4	2	2	2025-10-12	6441
3437	27	29	4	2	2	2025-10-12	6532
3440	23	24	4	2	2	2025-10-12	6535
3450	8	10	4	2	2	2025-10-12	6351
3446	7	9	4	2	2	2025-10-12	6352
3448	2	5	4	2	2	2025-10-12	6354
\.


--
-- Data for Name: honor_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.honor_records (id, season_id, competition_id, team_id, "position", points, achievement_date, special_record, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.matches (id, competition_id, team_a_id, team_b_id, score_a, score_b, winner_id, format, phase, round_number, match_number, status, scheduled_at, started_at, completed_at, notes, created_at, updated_at) FROM stdin;
6633	1	3	8	0	2	8	BO3	regular_season	1	3	completed	2025-10-12 08:53:06.277	\N	2025-10-12 08:54:38.487	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.487431
6634	1	4	7	0	2	7	BO3	regular_season	1	4	completed	2025-10-12 08:53:06.277	\N	2025-10-12 08:54:38.491	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.491493
6635	1	5	6	0	2	6	BO3	regular_season	1	5	completed	2025-10-12 08:53:06.277	\N	2025-10-12 08:54:38.495	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.495462
6631	1	1	10	0	2	10	BO3	regular_season	1	1	completed	2025-10-12 08:53:06.277	\N	2025-10-12 08:54:38.499	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.500026
6637	1	3	1	0	2	1	BO3	regular_season	2	7	completed	2025-10-13 08:53:06.277	\N	2025-10-12 08:54:38.985	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.986083
6639	1	5	8	0	2	8	BO3	regular_season	2	9	completed	2025-10-13 08:53:06.277	\N	2025-10-12 08:54:38.993	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.993738
6640	1	6	7	0	2	7	BO3	regular_season	2	10	completed	2025-10-13 08:53:06.277	\N	2025-10-12 08:54:38.996	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.996597
6636	1	2	10	0	2	10	BO3	regular_season	2	6	completed	2025-10-13 08:53:06.277	\N	2025-10-12 08:54:39.002	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.002474
6642	1	4	2	0	2	2	BO3	regular_season	3	12	completed	2025-10-14 08:53:06.277	\N	2025-10-12 08:54:39.501	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.501694
6643	1	5	1	0	2	1	BO3	regular_season	3	13	completed	2025-10-14 08:53:06.277	\N	2025-10-12 08:54:39.505	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.505121
6644	1	6	9	0	2	9	BO3	regular_season	3	14	completed	2025-10-14 08:53:06.277	\N	2025-10-12 08:54:39.509	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.509364
6641	1	3	10	0	2	10	BO3	regular_season	3	11	completed	2025-10-14 08:53:06.277	\N	2025-10-12 08:54:39.533	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.533902
6647	1	5	3	0	2	3	BO3	regular_season	4	17	completed	2025-10-15 08:53:06.277	\N	2025-10-12 08:54:40.046	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.046254
6648	1	6	2	0	2	2	BO3	regular_season	4	18	completed	2025-10-15 08:53:06.277	\N	2025-10-12 08:54:40.05	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.05036
6649	1	7	1	0	2	1	BO3	regular_season	4	19	completed	2025-10-15 08:53:06.277	\N	2025-10-12 08:54:40.054	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.054539
6650	1	8	9	0	2	9	BO3	regular_season	4	20	completed	2025-10-15 08:53:06.277	\N	2025-10-12 08:54:40.057	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.057884
6646	1	4	10	0	2	10	BO3	regular_season	4	16	completed	2025-10-15 08:53:06.277	\N	2025-10-12 08:54:40.06	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.060697
6653	1	7	3	0	2	3	BO3	regular_season	5	23	completed	2025-10-16 08:53:06.277	\N	2025-10-12 08:54:40.562	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.562197
6654	1	8	2	0	2	2	BO3	regular_season	5	24	completed	2025-10-16 08:53:06.277	\N	2025-10-12 08:54:40.563	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.564043
6655	1	9	1	0	2	1	BO3	regular_season	5	25	completed	2025-10-16 08:53:06.277	\N	2025-10-12 08:54:40.57	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.570837
6651	1	5	10	0	2	10	BO3	regular_season	5	21	completed	2025-10-16 08:53:06.277	\N	2025-10-12 08:54:40.573	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.573236
6657	1	7	5	0	2	5	BO3	regular_season	6	27	completed	2025-10-17 08:53:06.277	\N	2025-10-12 08:54:41.04	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.040592
6658	1	8	4	0	2	4	BO3	regular_season	6	28	completed	2025-10-17 08:53:06.277	\N	2025-10-12 08:54:41.042	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.042617
6660	1	1	2	0	2	2	BO3	regular_season	6	30	completed	2025-10-17 08:53:06.277	\N	2025-10-12 08:54:41.048	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.04884
6656	1	6	10	0	2	10	BO3	regular_season	6	26	completed	2025-10-17 08:53:06.277	\N	2025-10-12 08:54:41.051	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.051835
6662	1	8	6	0	2	6	BO3	regular_season	7	32	completed	2025-10-18 08:53:06.277	\N	2025-10-12 08:54:41.544	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.54468
6663	1	9	5	0	2	5	BO3	regular_season	7	33	completed	2025-10-18 08:53:06.277	\N	2025-10-12 08:54:41.548	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.548438
6664	1	1	4	0	2	4	BO3	regular_season	7	34	completed	2025-10-18 08:53:06.277	\N	2025-10-12 08:54:41.554	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.554248
6665	1	2	3	0	2	3	BO3	regular_season	7	35	completed	2025-10-18 08:53:06.277	\N	2025-10-12 08:54:41.556	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.557088
6667	1	9	7	0	2	7	BO3	regular_season	8	37	completed	2025-10-19 08:53:06.277	\N	2025-10-12 08:54:42.072	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.072508
6668	1	1	6	0	2	6	BO3	regular_season	8	38	completed	2025-10-19 08:53:06.277	\N	2025-10-12 08:54:42.075	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.075477
6669	1	2	5	0	2	5	BO3	regular_season	8	39	completed	2025-10-19 08:53:06.277	\N	2025-10-12 08:54:42.078	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.078587
6670	1	3	4	0	2	4	BO3	regular_season	8	40	completed	2025-10-19 08:53:06.277	\N	2025-10-12 08:54:42.08	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.080703
6666	1	8	10	0	2	10	BO3	regular_season	8	36	completed	2025-10-19 08:53:06.277	\N	2025-10-12 08:54:42.084	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.084682
6672	1	1	8	0	2	8	BO3	regular_season	9	42	completed	2025-10-20 08:53:06.277	\N	2025-10-12 08:54:42.586	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.58707
6674	1	3	6	0	2	6	BO3	regular_season	9	44	completed	2025-10-20 08:53:06.277	\N	2025-10-12 08:54:42.591	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.591879
6675	1	4	5	0	2	5	BO3	regular_season	9	45	completed	2025-10-20 08:53:06.277	\N	2025-10-12 08:54:42.593	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.593496
6671	1	9	10	0	2	10	BO3	regular_season	9	41	completed	2025-10-20 08:53:06.277	\N	2025-10-12 08:54:42.596	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.59703
6677	1	9	2	0	2	2	BO3	regular_season	10	47	completed	2025-10-21 08:53:06.277	\N	2025-10-12 08:54:43.077	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.077478
6678	1	8	3	0	2	3	BO3	regular_season	10	48	completed	2025-10-21 08:53:06.277	\N	2025-10-12 08:54:43.08	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.08022
6679	1	7	4	0	2	4	BO3	regular_season	10	49	completed	2025-10-21 08:53:06.277	\N	2025-10-12 08:54:43.082	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.082698
6676	1	10	1	0	2	1	BO3	regular_season	10	46	completed	2025-10-21 08:53:06.277	\N	2025-10-12 08:54:43.087	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.087201
6682	1	1	3	0	2	3	BO3	regular_season	11	52	completed	2025-10-22 08:53:06.277	\N	2025-10-12 08:54:43.617	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.617555
6683	1	9	4	0	2	4	BO3	regular_season	11	53	completed	2025-10-22 08:53:06.277	\N	2025-10-12 08:54:43.618	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.61903
6684	1	8	5	0	2	5	BO3	regular_season	11	54	completed	2025-10-22 08:53:06.277	\N	2025-10-12 08:54:43.62	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.620374
6685	1	7	6	0	2	6	BO3	regular_season	11	55	completed	2025-10-22 08:53:06.277	\N	2025-10-12 08:54:43.621	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.621594
6681	1	10	2	0	2	2	BO3	regular_season	11	51	completed	2025-10-22 08:53:06.277	\N	2025-10-12 08:54:43.622	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.62297
6688	1	1	5	0	2	5	BO3	regular_season	12	58	completed	2025-10-23 08:53:06.277	\N	2025-10-12 08:54:44.054	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.055084
6689	1	9	6	0	2	6	BO3	regular_season	12	59	completed	2025-10-23 08:53:06.277	\N	2025-10-12 08:54:44.057	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.05787
6690	1	8	7	0	2	7	BO3	regular_season	12	60	completed	2025-10-23 08:53:06.277	\N	2025-10-12 08:54:44.06	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.060193
6686	1	10	3	0	2	3	BO3	regular_season	12	56	completed	2025-10-23 08:53:06.277	\N	2025-10-12 08:54:44.062	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.062748
6692	1	3	5	0	2	5	BO3	regular_season	13	62	completed	2025-10-24 08:53:06.277	\N	2025-10-12 08:54:44.557	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.557174
6693	1	2	6	0	2	6	BO3	regular_season	13	63	completed	2025-10-24 08:53:06.277	\N	2025-10-12 08:54:44.559	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.559246
6695	1	9	8	0	2	8	BO3	regular_season	13	65	completed	2025-10-24 08:53:06.277	\N	2025-10-12 08:54:44.563	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.563941
6691	1	10	4	0	2	4	BO3	regular_season	13	61	completed	2025-10-24 08:53:06.277	\N	2025-10-12 08:54:44.567	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.567331
6722	1	12	19	0	2	19	BO3	regular_season	1	92	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.418	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.418533
6723	1	13	18	0	2	18	BO3	regular_season	1	93	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.428	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.428967
6724	1	14	17	0	2	17	BO3	regular_season	1	94	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.431	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.431613
6725	1	15	16	0	2	16	BO3	regular_season	1	95	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.437	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.438675
6726	1	12	20	0	2	20	BO3	regular_season	2	96	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.946	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.946746
6728	1	14	19	0	2	19	BO3	regular_season	2	98	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.952	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.952876
6729	1	15	18	0	2	18	BO3	regular_season	2	99	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.955	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.955465
6730	1	16	17	0	2	17	BO3	regular_season	2	100	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.958	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.958342
6731	1	13	20	0	2	20	BO3	regular_season	3	101	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.448	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.449061
6732	1	14	12	0	2	12	BO3	regular_season	3	102	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.453	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.453721
6733	1	15	11	0	2	11	BO3	regular_season	3	103	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.456	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.456512
6735	1	17	18	0	2	18	BO3	regular_season	3	105	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.462	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.462894
6736	1	14	20	0	2	20	BO3	regular_season	4	106	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:39.993	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.993609
6737	1	15	13	0	2	13	BO3	regular_season	4	107	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:39.996	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.996725
6738	1	16	12	0	2	12	BO3	regular_season	4	108	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.000596
6739	1	17	11	0	2	11	BO3	regular_season	4	109	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.004	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.004546
6740	1	18	19	0	2	19	BO3	regular_season	4	110	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.013	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.013605
6742	1	16	14	0	2	14	BO3	regular_season	5	112	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.512	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.51214
6743	1	17	13	0	2	13	BO3	regular_season	5	113	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.514	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.514859
6744	1	18	12	0	2	12	BO3	regular_season	5	114	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.517	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.517543
6745	1	19	11	0	2	11	BO3	regular_season	5	115	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.52	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.520304
6746	1	16	20	0	2	20	BO3	regular_season	6	116	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:40.99	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.99048
6747	1	17	15	0	2	15	BO3	regular_season	6	117	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:40.993	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.994032
6749	1	19	13	0	2	13	BO3	regular_season	6	119	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:40.999	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.99931
6750	1	11	12	0	2	12	BO3	regular_season	6	120	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.003	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.003342
6751	1	17	20	0	2	20	BO3	regular_season	7	121	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.495	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.495746
6752	1	18	16	0	2	16	BO3	regular_season	7	122	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.498	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.498143
6753	1	19	15	0	2	15	BO3	regular_season	7	123	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.504	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.504314
6754	1	11	14	0	2	14	BO3	regular_season	7	124	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.507	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.507503
6756	1	18	20	0	2	20	BO3	regular_season	8	126	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.028	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.028802
6757	1	19	17	0	2	17	BO3	regular_season	8	127	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.03	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.031163
6758	1	11	16	0	2	16	BO3	regular_season	8	128	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.036	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.036846
6759	1	12	15	0	2	15	BO3	regular_season	8	129	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.039	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.039208
6760	1	13	14	0	2	14	BO3	regular_season	8	130	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.042	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.042304
6697	1	4	6	0	2	6	BO3	regular_season	14	67	completed	2025-10-25 08:53:06.277	\N	2025-10-12 08:54:45.055	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.055204
6699	1	2	8	0	2	8	BO3	regular_season	14	69	completed	2025-10-25 08:53:06.277	\N	2025-10-12 08:54:45.063	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.063469
6700	1	1	9	0	2	9	BO3	regular_season	14	70	completed	2025-10-25 08:53:06.277	\N	2025-10-12 08:54:45.066	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.066826
6696	1	10	5	0	2	5	BO3	regular_season	14	66	completed	2025-10-25 08:53:06.277	\N	2025-10-12 08:54:45.068	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.068991
6701	1	10	6	0	2	6	BO3	regular_season	15	71	completed	2025-10-26 08:53:06.277	\N	2025-10-12 08:54:45.515	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.515358
6702	1	5	7	0	2	7	BO3	regular_season	15	72	completed	2025-10-26 08:53:06.277	\N	2025-10-12 08:54:45.517	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.51794
6703	1	4	8	0	2	8	BO3	regular_season	15	73	completed	2025-10-26 08:53:06.277	\N	2025-10-12 08:54:45.52	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.520773
6705	1	2	1	0	2	1	BO3	regular_season	15	75	completed	2025-10-26 08:53:06.277	\N	2025-10-12 08:54:45.525	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.52557
6706	1	10	7	0	2	7	BO3	regular_season	16	76	completed	2025-10-27 08:53:06.277	\N	2025-10-12 08:54:45.967	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.967629
6707	1	6	8	0	2	8	BO3	regular_season	16	77	completed	2025-10-27 08:53:06.277	\N	2025-10-12 08:54:45.97	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.970245
6708	1	5	9	0	2	9	BO3	regular_season	16	78	completed	2025-10-27 08:53:06.277	\N	2025-10-12 08:54:45.973	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.97321
6709	1	4	1	0	2	1	BO3	regular_season	16	79	completed	2025-10-27 08:53:06.277	\N	2025-10-12 08:54:45.975	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.975573
6710	1	3	2	0	2	2	BO3	regular_season	16	80	completed	2025-10-27 08:53:06.277	\N	2025-10-12 08:54:45.98	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.980723
6713	1	6	1	0	2	1	BO3	regular_season	17	83	completed	2025-10-28 08:53:06.277	\N	2025-10-12 08:54:46.447	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.448047
6714	1	5	2	0	2	2	BO3	regular_season	17	84	completed	2025-10-28 08:53:06.277	\N	2025-10-12 08:54:46.449	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.449808
6715	1	4	3	0	2	3	BO3	regular_season	17	85	completed	2025-10-28 08:53:06.277	\N	2025-10-12 08:54:46.451	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.451238
6711	1	10	8	0	2	8	BO3	regular_season	17	81	completed	2025-10-28 08:53:06.277	\N	2025-10-12 08:54:46.452	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.452867
6717	1	8	1	0	2	1	BO3	regular_season	18	87	completed	2025-10-29 08:53:06.277	\N	2025-10-12 08:54:46.901	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.901868
6718	1	7	2	0	2	2	BO3	regular_season	18	88	completed	2025-10-29 08:53:06.277	\N	2025-10-12 08:54:46.904	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.904112
6720	1	5	4	0	2	4	BO3	regular_season	18	90	completed	2025-10-29 08:53:06.277	\N	2025-10-12 08:54:46.908	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.908689
6716	1	10	9	0	2	9	BO3	regular_season	18	86	completed	2025-10-29 08:53:06.277	\N	2025-10-12 08:54:46.91	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.910677
6812	1	22	29	0	2	29	BO3	regular_season	1	182	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.444	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.444945
6813	1	23	28	0	2	28	BO3	regular_season	1	183	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.449	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.449276
6814	1	24	27	0	2	27	BO3	regular_season	1	184	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.451	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.452086
6815	1	25	26	0	2	26	BO3	regular_season	1	185	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.454	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.454956
6816	1	22	30	0	2	30	BO3	regular_season	2	186	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.939	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.939142
6818	1	24	29	0	2	29	BO3	regular_season	2	188	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.962	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.963046
6819	1	25	28	0	2	28	BO3	regular_season	2	189	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.967	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.967603
6820	1	26	27	0	2	27	BO3	regular_season	2	190	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.97	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.970439
6821	1	23	30	0	2	30	BO3	regular_season	3	191	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.438	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.438327
6822	1	24	22	0	2	22	BO3	regular_season	3	192	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.466	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.466861
6823	1	25	21	0	2	21	BO3	regular_season	3	193	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.47	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.470777
6825	1	27	28	0	2	28	BO3	regular_season	3	195	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.479	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.479341
6761	1	19	20	0	2	20	BO3	regular_season	9	131	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.537	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.537183
6762	1	11	18	0	2	18	BO3	regular_season	9	132	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.539	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.540026
6763	1	12	17	0	2	17	BO3	regular_season	9	133	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.544	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.544794
6764	1	13	16	0	2	16	BO3	regular_season	9	134	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.547	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.547391
6765	1	14	15	0	2	15	BO3	regular_season	9	135	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.55	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.550887
6767	1	19	12	0	2	12	BO3	regular_season	10	137	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.01	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.011009
6768	1	18	13	0	2	13	BO3	regular_season	10	138	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.013	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.013717
6769	1	17	14	0	2	14	BO3	regular_season	10	139	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.021	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.021555
6770	1	16	15	0	2	15	BO3	regular_season	10	140	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.025	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.0253
6771	1	20	12	0	2	12	BO3	regular_season	11	141	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.569	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.570024
6772	1	11	13	0	2	13	BO3	regular_season	11	142	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.573	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.573875
6774	1	18	15	0	2	15	BO3	regular_season	11	144	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.579	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.57927
6775	1	17	16	0	2	16	BO3	regular_season	11	145	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.581	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.581545
6776	1	20	13	0	2	13	BO3	regular_season	12	146	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:43.998	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.998951
6777	1	12	14	0	2	14	BO3	regular_season	12	147	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.011	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.011323
6778	1	11	15	0	2	15	BO3	regular_season	12	148	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.019	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.019332
6779	1	19	16	0	2	16	BO3	regular_season	12	149	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.021	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.021854
6781	1	20	14	0	2	14	BO3	regular_season	13	151	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.505	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.505606
6782	1	13	15	0	2	15	BO3	regular_season	13	152	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.511	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.511389
6783	1	12	16	0	2	16	BO3	regular_season	13	153	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.513	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.513859
6784	1	11	17	0	2	17	BO3	regular_season	13	154	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.516	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.516897
6785	1	19	18	0	2	18	BO3	regular_season	13	155	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.519	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.519852
6786	1	20	15	0	2	15	BO3	regular_season	14	156	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:44.998	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.998388
6788	1	13	17	0	2	17	BO3	regular_season	14	158	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.01	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.010629
6789	1	12	18	0	2	18	BO3	regular_season	14	159	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.013	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.014186
6790	1	11	19	0	2	19	BO3	regular_season	14	160	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.019	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.019763
6791	1	20	16	0	2	16	BO3	regular_season	15	161	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.477	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.477775
6792	1	15	17	0	2	17	BO3	regular_season	15	162	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.479	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.479915
6793	1	14	18	0	2	18	BO3	regular_season	15	163	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.482	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.482202
6795	1	12	11	0	2	11	BO3	regular_season	15	165	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.488	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.488431
6796	1	20	17	0	2	17	BO3	regular_season	16	166	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.922	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.922184
6797	1	16	18	0	2	18	BO3	regular_season	16	167	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.925	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.925634
6798	1	15	19	0	2	19	BO3	regular_season	16	168	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.928	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.928658
6799	1	14	11	0	2	11	BO3	regular_season	16	169	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.931	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.931718
6800	1	13	12	0	2	12	BO3	regular_season	16	170	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.936	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.936807
6802	1	17	19	0	2	19	BO3	regular_season	17	172	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.392	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.39245
6803	1	16	11	0	2	11	BO3	regular_season	17	173	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.394	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.394411
6804	1	15	12	0	2	12	BO3	regular_season	17	174	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.397	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.397373
6805	1	14	13	0	2	13	BO3	regular_season	17	175	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.402	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.402373
6806	1	20	19	0	2	19	BO3	regular_season	18	176	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.876	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.876132
6807	1	18	11	0	2	11	BO3	regular_season	18	177	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.879	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.879368
6809	1	16	13	0	2	13	BO3	regular_season	18	179	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.884	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.884583
6810	1	15	14	0	2	14	BO3	regular_season	18	180	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.887	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.887591
6827	1	25	23	0	2	23	BO3	regular_season	4	197	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.016	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.016109
6828	1	26	22	0	2	22	BO3	regular_season	4	198	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.019	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.019187
6829	1	27	21	0	2	21	BO3	regular_season	4	199	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.022	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.022644
6830	1	28	29	0	2	29	BO3	regular_season	4	200	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.025	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.025873
6831	1	25	30	0	2	30	BO3	regular_season	5	201	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.505	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.505299
6833	1	27	23	0	2	23	BO3	regular_season	5	203	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.524	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.524841
6834	1	28	22	0	2	22	BO3	regular_season	5	204	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.527	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.52753
6835	1	29	21	0	2	21	BO3	regular_season	5	205	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.53	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.530578
6836	1	26	30	0	2	30	BO3	regular_season	6	206	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:40.985	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.986123
6837	1	27	25	0	2	25	BO3	regular_season	6	207	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.005	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.005313
6838	1	28	24	0	2	24	BO3	regular_season	6	208	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.008	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.008366
6840	1	21	22	0	2	22	BO3	regular_season	6	210	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.014	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.014419
6841	1	27	30	0	2	30	BO3	regular_season	7	211	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.49	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.490131
6842	1	28	26	0	2	26	BO3	regular_season	7	212	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.511	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.511775
6843	1	29	25	0	2	25	BO3	regular_season	7	213	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.514	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.514459
6844	1	21	24	0	2	24	BO3	regular_season	7	214	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.519	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.519935
6845	1	22	23	0	2	23	BO3	regular_season	7	215	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.522	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.523034
6847	1	29	27	0	2	27	BO3	regular_season	8	217	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.045	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.045541
6848	1	21	26	0	2	26	BO3	regular_season	8	218	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.049	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.049199
6849	1	22	25	0	2	25	BO3	regular_season	8	219	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.052	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.052509
6850	1	23	24	0	2	24	BO3	regular_season	8	220	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.055	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.055144
6851	1	29	30	0	2	30	BO3	regular_season	9	221	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.531	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.531803
6852	1	21	28	0	2	28	BO3	regular_season	9	222	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.558	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.55869
6854	1	23	26	0	2	26	BO3	regular_season	9	224	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.57	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.570608
6855	1	24	25	0	2	25	BO3	regular_season	9	225	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.573	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.573269
6856	1	30	21	0	2	21	BO3	regular_season	10	226	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.002	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.002592
6857	1	29	22	0	2	22	BO3	regular_season	10	227	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.042	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.042892
6858	1	28	23	0	2	23	BO3	regular_season	10	228	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.053	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.053426
6859	1	27	24	0	2	24	BO3	regular_season	10	229	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.058	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.058092
6861	1	30	22	0	2	22	BO3	regular_season	11	231	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.566	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.566267
6862	1	21	23	0	2	23	BO3	regular_season	11	232	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.584	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.584227
6863	1	29	24	0	2	24	BO3	regular_season	11	233	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.587	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.587463
6864	1	28	25	0	2	25	BO3	regular_season	11	234	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.589	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.589905
6865	1	27	26	0	2	26	BO3	regular_season	11	235	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.594	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.594479
6866	1	30	23	0	2	23	BO3	regular_season	12	236	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:43.995	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.995508
6868	1	21	25	0	2	25	BO3	regular_season	12	238	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.028	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.028224
6869	1	29	26	0	2	26	BO3	regular_season	12	239	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.031	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.031755
6870	1	28	27	0	2	27	BO3	regular_season	12	240	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.034	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.03451
6871	1	30	24	0	2	24	BO3	regular_season	13	241	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.502	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.502417
6872	1	23	25	0	2	25	BO3	regular_season	13	242	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.522	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.522357
6873	1	22	26	0	2	26	BO3	regular_season	13	243	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.525	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.526025
6875	1	29	28	0	2	28	BO3	regular_season	13	245	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.536	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.536921
6876	1	30	25	0	2	25	BO3	regular_season	14	246	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:44.995	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.995436
6877	1	24	26	0	2	26	BO3	regular_season	14	247	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.024	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.024559
6878	1	23	27	0	2	27	BO3	regular_season	14	248	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.028	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.028413
6879	1	22	28	0	2	28	BO3	regular_season	14	249	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.033	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.0339
6880	1	21	29	0	2	29	BO3	regular_season	14	250	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.035	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.035962
6882	1	25	27	0	2	27	BO3	regular_season	15	252	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.49	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.490997
6883	1	24	28	0	2	28	BO3	regular_season	15	253	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.493	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.493566
6884	1	23	29	0	2	29	BO3	regular_season	15	254	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.496	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.496097
6885	1	22	21	0	2	21	BO3	regular_season	15	255	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.498	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.49844
6886	1	30	27	0	2	27	BO3	regular_season	16	256	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.912	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.913026
6887	1	26	28	0	2	28	BO3	regular_season	16	257	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.939	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.940023
6889	1	24	21	0	2	21	BO3	regular_season	16	259	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.946	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.946434
6890	1	23	22	0	2	22	BO3	regular_season	16	260	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.952	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.952816
6902	1	32	39	0	2	39	BO3	regular_season	1	272	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.465	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.465963
6903	1	33	38	0	2	38	BO3	regular_season	1	273	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.468	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.468473
6904	1	34	37	0	2	37	BO3	regular_season	1	274	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.47	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.471007
6905	1	35	36	0	2	36	BO3	regular_season	1	275	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.474	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.474773
6906	1	32	40	0	2	40	BO3	regular_season	2	276	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.973	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.973342
6908	1	34	39	0	2	39	BO3	regular_season	2	278	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.977	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.97799
6909	1	35	38	0	2	38	BO3	regular_season	2	279	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.98	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.980543
6910	1	36	37	0	2	37	BO3	regular_season	2	280	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.983	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.983312
6911	1	33	40	0	2	40	BO3	regular_season	3	281	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.488	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.48856
6912	1	34	32	0	2	32	BO3	regular_season	3	282	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.491	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.491274
6913	1	35	31	0	2	31	BO3	regular_season	3	283	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.493	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.493281
6915	1	37	38	0	2	38	BO3	regular_season	3	285	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.498	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.499008
6916	1	34	40	0	2	40	BO3	regular_season	4	286	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.028	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.028518
6917	1	35	33	0	2	33	BO3	regular_season	4	287	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.03	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.031114
6918	1	36	32	0	2	32	BO3	regular_season	4	288	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.034	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.034094
6919	1	37	31	0	2	31	BO3	regular_season	4	289	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.037	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.037963
6920	1	38	39	0	2	39	BO3	regular_season	4	290	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:40.041	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.041426
6922	1	36	34	0	2	34	BO3	regular_season	5	292	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.541	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.542085
6923	1	37	33	0	2	33	BO3	regular_season	5	293	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.547	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.547441
6924	1	38	32	0	2	32	BO3	regular_season	5	294	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.553	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.553956
6925	1	39	31	0	2	31	BO3	regular_season	5	295	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.557	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.557627
6926	1	36	40	0	2	40	BO3	regular_season	6	296	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.018	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.018479
6927	1	37	35	0	2	35	BO3	regular_season	6	297	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.022	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.022292
6929	1	39	33	0	2	33	BO3	regular_season	6	299	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.029	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.029688
6930	1	31	32	0	2	32	BO3	regular_season	6	300	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.038	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.0383
6931	1	37	40	0	2	40	BO3	regular_season	7	301	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.526	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.526819
6932	1	38	36	0	2	36	BO3	regular_season	7	302	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.529	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.529765
6933	1	39	35	0	2	35	BO3	regular_season	7	303	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.533	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.534087
6934	1	31	34	0	2	34	BO3	regular_season	7	304	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.537	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.537437
6936	1	38	40	0	2	40	BO3	regular_season	8	306	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.057	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.05734
6937	1	39	37	0	2	37	BO3	regular_season	8	307	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.06	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.060446
6938	1	31	36	0	2	36	BO3	regular_season	8	308	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.063	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.063777
6939	1	32	35	0	2	35	BO3	regular_season	8	309	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.066	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.066934
6940	1	33	34	0	2	34	BO3	regular_season	8	310	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.07	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.07022
6941	1	39	40	0	2	40	BO3	regular_season	9	311	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.575	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.575316
6943	1	32	37	0	2	37	BO3	regular_season	9	313	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.579	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.579316
6944	1	33	36	0	2	36	BO3	regular_season	9	314	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.581	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.581157
6945	1	34	35	0	2	35	BO3	regular_season	9	315	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.583	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.583317
6946	1	40	31	0	2	31	BO3	regular_season	10	316	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.063	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.063924
6947	1	39	32	0	2	32	BO3	regular_season	10	317	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.066	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.066942
6948	1	38	33	0	2	33	BO3	regular_season	10	318	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.069	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.069371
6950	1	36	35	0	2	35	BO3	regular_season	10	320	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.074	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.075105
6951	1	40	32	0	2	32	BO3	regular_season	11	321	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.597	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.597247
6952	1	31	33	0	2	33	BO3	regular_season	11	322	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.603	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.603973
6953	1	39	34	0	2	34	BO3	regular_season	11	323	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.613	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.61319
6954	1	38	35	0	2	35	BO3	regular_season	11	324	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.614	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.614784
6955	1	37	36	0	2	36	BO3	regular_season	11	325	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.616	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.61633
6892	1	27	29	0	2	29	BO3	regular_season	17	262	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.405	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.405565
6893	1	26	21	0	2	21	BO3	regular_season	17	263	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.408	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.408331
6894	1	25	22	0	2	22	BO3	regular_season	17	264	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.41	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.41085
6895	1	24	23	0	2	23	BO3	regular_season	17	265	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.413	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.413251
6900	1	25	24	0	2	24	BO3	regular_season	18	270	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.862	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.862385
6896	1	30	29	0	2	29	BO3	regular_season	18	266	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.891	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.89124
6898	1	27	22	0	2	22	BO3	regular_season	18	268	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.897	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.897714
6899	1	26	23	0	2	23	BO3	regular_season	18	269	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.9	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.900061
6996	7	2	10	0	0	\N	BO3	regular_season	2	6	scheduled	2025-10-14 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
6997	7	3	1	0	0	\N	BO3	regular_season	2	7	scheduled	2025-10-14 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
6998	7	4	9	0	0	\N	BO3	regular_season	2	8	scheduled	2025-10-14 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
6999	7	5	8	0	0	\N	BO3	regular_season	2	9	scheduled	2025-10-14 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7000	7	6	7	0	0	\N	BO3	regular_season	2	10	scheduled	2025-10-14 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7001	7	3	10	0	0	\N	BO3	regular_season	3	11	scheduled	2025-10-15 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7002	7	4	2	0	0	\N	BO3	regular_season	3	12	scheduled	2025-10-15 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7003	7	5	1	0	0	\N	BO3	regular_season	3	13	scheduled	2025-10-15 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7004	7	6	9	0	0	\N	BO3	regular_season	3	14	scheduled	2025-10-15 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7005	7	7	8	0	0	\N	BO3	regular_season	3	15	scheduled	2025-10-15 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7006	7	4	10	0	0	\N	BO3	regular_season	4	16	scheduled	2025-10-16 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7007	7	5	3	0	0	\N	BO3	regular_season	4	17	scheduled	2025-10-16 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7008	7	6	2	0	0	\N	BO3	regular_season	4	18	scheduled	2025-10-16 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7009	7	7	1	0	0	\N	BO3	regular_season	4	19	scheduled	2025-10-16 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7010	7	8	9	0	0	\N	BO3	regular_season	4	20	scheduled	2025-10-16 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7011	7	5	10	0	0	\N	BO3	regular_season	5	21	scheduled	2025-10-17 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7012	7	6	4	0	0	\N	BO3	regular_season	5	22	scheduled	2025-10-17 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7013	7	7	3	0	0	\N	BO3	regular_season	5	23	scheduled	2025-10-17 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7014	7	8	2	0	0	\N	BO3	regular_season	5	24	scheduled	2025-10-17 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7015	7	9	1	0	0	\N	BO3	regular_season	5	25	scheduled	2025-10-17 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7016	7	6	10	0	0	\N	BO3	regular_season	6	26	scheduled	2025-10-18 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7017	7	7	5	0	0	\N	BO3	regular_season	6	27	scheduled	2025-10-18 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7018	7	8	4	0	0	\N	BO3	regular_season	6	28	scheduled	2025-10-18 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7019	7	9	3	0	0	\N	BO3	regular_season	6	29	scheduled	2025-10-18 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7020	7	1	2	0	0	\N	BO3	regular_season	6	30	scheduled	2025-10-18 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7021	7	7	10	0	0	\N	BO3	regular_season	7	31	scheduled	2025-10-19 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
6956	1	40	33	0	2	33	BO3	regular_season	12	326	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.036	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.036998
6957	1	32	34	0	2	34	BO3	regular_season	12	327	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.039	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.039378
6958	1	31	35	0	2	35	BO3	regular_season	12	328	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.043	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.043816
6959	1	39	36	0	2	36	BO3	regular_season	12	329	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.047	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.047113
6960	1	38	37	0	2	37	BO3	regular_season	12	330	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.05	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.050558
6961	1	40	34	0	2	34	BO3	regular_season	13	331	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.539	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.539368
6962	1	33	35	0	2	35	BO3	regular_season	13	332	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.542	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.542175
6963	1	32	36	0	2	36	BO3	regular_season	13	333	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.546	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.546104
6964	1	31	37	0	2	37	BO3	regular_season	13	334	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.548	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.54824
6965	1	39	38	0	2	38	BO3	regular_season	13	335	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.554	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.554609
6966	1	40	35	0	2	35	BO3	regular_season	14	336	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.038	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.038748
6967	1	34	36	0	2	36	BO3	regular_season	14	337	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.046	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.046336
6968	1	33	37	0	2	37	BO3	regular_season	14	338	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.048	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.048301
6969	1	32	38	0	2	38	BO3	regular_season	14	339	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.05	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.051042
6970	1	31	39	0	2	39	BO3	regular_season	14	340	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.053	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.053183
6971	1	40	36	0	2	36	BO3	regular_season	15	341	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.501	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.501216
6972	1	35	37	0	2	37	BO3	regular_season	15	342	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.503	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.503543
6973	1	34	38	0	2	38	BO3	regular_season	15	343	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.505	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.505422
6974	1	33	39	0	2	39	BO3	regular_season	15	344	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.509	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.509775
6975	1	32	31	0	2	31	BO3	regular_season	15	345	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.512	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.512287
6976	1	40	37	0	2	37	BO3	regular_season	16	346	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.955	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.955558
6977	1	36	38	0	2	38	BO3	regular_season	16	347	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.957	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.958043
6978	1	35	39	0	2	39	BO3	regular_season	16	348	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.96	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.960383
6979	1	34	31	0	2	31	BO3	regular_season	16	349	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.962	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.963011
6980	1	33	32	0	2	32	BO3	regular_season	16	350	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.965	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.965157
6981	1	40	38	0	2	38	BO3	regular_season	17	351	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.417	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.426055
6982	1	37	39	0	2	39	BO3	regular_season	17	352	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.432	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.433811
6983	1	36	31	0	2	31	BO3	regular_season	17	353	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.436	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.436561
6984	1	35	32	0	2	32	BO3	regular_season	17	354	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.438	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.438568
6985	1	34	33	0	2	33	BO3	regular_season	17	355	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.443	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.4431
6990	1	35	34	0	2	34	BO3	regular_season	18	360	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.857	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.857244
6986	1	40	39	0	2	39	BO3	regular_season	18	356	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.864	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.864949
6987	1	38	31	0	2	31	BO3	regular_season	18	357	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.868	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.868152
6988	1	37	32	0	2	32	BO3	regular_season	18	358	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.871	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.871158
6989	1	36	33	0	2	33	BO3	regular_season	18	359	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.873	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.873162
6811	1	21	30	0	2	30	BO3	regular_season	1	181	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.265	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.265597
6721	1	11	20	0	2	20	BO3	regular_season	1	91	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.415	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.415814
6901	1	31	40	0	2	40	BO3	regular_season	1	271	completed	2025-10-12 08:53:06.278	\N	2025-10-12 08:54:38.462	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.462756
6632	1	2	9	0	2	9	BO3	regular_season	1	2	completed	2025-10-12 08:53:06.277	\N	2025-10-12 08:54:38.479	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.47908
6451	1	21	30	0	2	30	BO3	regular_season	1	181	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.534	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.534496
6727	1	13	11	0	2	11	BO3	regular_season	2	97	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.95	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.950208
6638	1	4	9	0	2	9	BO3	regular_season	2	8	completed	2025-10-13 08:53:06.277	\N	2025-10-12 08:54:38.988	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.98876
6824	1	26	29	0	2	29	BO3	regular_season	3	194	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.475	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.475447
6552	1	34	32	0	2	32	BO3	regular_season	3	282	completed	2025-10-14 08:52:56.328	\N	2025-10-12 08:54:39.545	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.545527
6464	1	26	29	0	2	29	BO3	regular_season	3	194	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.575	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.575259
6826	1	24	30	0	2	30	BO3	regular_season	4	196	completed	2025-10-15 08:53:06.278	\N	2025-10-12 08:54:39.988	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.988178
6290	1	8	9	0	2	9	BO3	regular_season	4	20	completed	2025-10-15 08:52:56.326	\N	2025-10-12 08:54:40.118	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.118829
6741	1	15	20	0	2	20	BO3	regular_season	5	111	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.508	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.509019
6652	1	6	4	0	2	4	BO3	regular_season	5	22	completed	2025-10-16 08:53:06.277	\N	2025-10-12 08:54:40.559	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.559952
6385	1	19	11	0	2	11	BO3	regular_season	5	115	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.588	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.588352
6292	1	6	4	0	2	4	BO3	regular_season	5	22	completed	2025-10-16 08:52:56.326	\N	2025-10-12 08:54:40.619	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.619137
6659	1	9	3	0	2	3	BO3	regular_season	6	29	completed	2025-10-17 08:53:06.277	\N	2025-10-12 08:54:41.045	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.045642
6755	1	12	13	0	2	13	BO3	regular_season	7	125	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.509	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.509546
6661	1	7	10	0	2	10	BO3	regular_season	7	31	completed	2025-10-18 08:53:06.277	\N	2025-10-12 08:54:41.562	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.562265
6571	1	37	40	0	2	40	BO3	regular_season	7	301	completed	2025-10-18 08:52:56.328	\N	2025-10-12 08:54:41.593	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.593163
6846	1	28	30	0	2	30	BO3	regular_season	8	216	completed	2025-10-19 08:53:06.278	\N	2025-10-12 08:54:42.022	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.022499
6673	1	2	7	0	2	7	BO3	regular_season	9	43	completed	2025-10-20 08:53:06.277	\N	2025-10-12 08:54:42.589	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.590057
6491	1	29	30	0	2	30	BO3	regular_season	9	221	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.616	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.616627
6680	1	6	5	0	2	5	BO3	regular_season	10	50	completed	2025-10-21 08:53:06.277	\N	2025-10-12 08:54:43.084	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.084833
6498	1	28	23	0	2	23	BO3	regular_season	10	228	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.126	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.127042
6316	1	10	1	0	2	1	BO3	regular_season	10	46	completed	2025-10-21 08:52:56.326	\N	2025-10-12 08:54:43.196	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.196791
6773	1	19	14	0	2	14	BO3	regular_season	11	143	completed	2025-10-22 08:53:06.278	\N	2025-10-12 08:54:43.576	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.576689
6505	1	27	26	0	2	26	BO3	regular_season	11	235	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.644	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.644762
6780	1	18	17	0	2	17	BO3	regular_season	12	150	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.024	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.02407
6328	1	1	5	0	2	5	BO3	regular_season	12	58	completed	2025-10-23 08:52:56.326	\N	2025-10-12 08:54:44.123	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.123877
6787	1	14	16	0	2	16	BO3	regular_season	14	157	completed	2025-10-25 08:53:06.278	\N	2025-10-12 08:54:45.007	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.007554
6519	1	22	28	0	2	28	BO3	regular_season	14	249	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.101	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.101096
6344	1	3	9	0	2	9	BO3	regular_season	15	74	completed	2025-10-26 08:52:56.326	\N	2025-10-12 08:54:45.558	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.558723
6526	1	30	27	0	2	27	BO3	regular_season	16	256	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.001	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.001548
6801	1	20	18	0	2	18	BO3	regular_season	17	171	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.389	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.389897
6531	1	30	28	0	2	28	BO3	regular_season	17	261	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.478	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.478691
6351	1	10	8	0	2	8	BO3	regular_season	17	81	completed	2025-10-28 08:52:56.326	\N	2025-10-12 08:54:46.486	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.486998
6808	1	17	12	0	2	12	BO3	regular_season	18	178	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.882	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.882163
6448	1	17	12	0	2	12	BO3	regular_season	18	178	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.933	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.933692
6358	1	7	2	0	2	2	BO3	regular_season	18	88	completed	2025-10-29 08:52:56.326	\N	2025-10-12 08:54:46.956	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.957042
7022	7	8	6	0	0	\N	BO3	regular_season	7	32	scheduled	2025-10-19 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7023	7	9	5	0	0	\N	BO3	regular_season	7	33	scheduled	2025-10-19 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7024	7	1	4	0	0	\N	BO3	regular_season	7	34	scheduled	2025-10-19 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7025	7	2	3	0	0	\N	BO3	regular_season	7	35	scheduled	2025-10-19 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7026	7	8	10	0	0	\N	BO3	regular_season	8	36	scheduled	2025-10-20 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7027	7	9	7	0	0	\N	BO3	regular_season	8	37	scheduled	2025-10-20 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7028	7	1	6	0	0	\N	BO3	regular_season	8	38	scheduled	2025-10-20 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7029	7	2	5	0	0	\N	BO3	regular_season	8	39	scheduled	2025-10-20 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7030	7	3	4	0	0	\N	BO3	regular_season	8	40	scheduled	2025-10-20 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7031	7	9	10	0	0	\N	BO3	regular_season	9	41	scheduled	2025-10-21 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7032	7	1	8	0	0	\N	BO3	regular_season	9	42	scheduled	2025-10-21 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7033	7	2	7	0	0	\N	BO3	regular_season	9	43	scheduled	2025-10-21 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7034	7	3	6	0	0	\N	BO3	regular_season	9	44	scheduled	2025-10-21 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7035	7	4	5	0	0	\N	BO3	regular_season	9	45	scheduled	2025-10-21 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7036	7	10	1	0	0	\N	BO3	regular_season	10	46	scheduled	2025-10-22 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7037	7	9	2	0	0	\N	BO3	regular_season	10	47	scheduled	2025-10-22 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7038	7	8	3	0	0	\N	BO3	regular_season	10	48	scheduled	2025-10-22 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7039	7	7	4	0	0	\N	BO3	regular_season	10	49	scheduled	2025-10-22 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7040	7	6	5	0	0	\N	BO3	regular_season	10	50	scheduled	2025-10-22 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7041	7	10	2	0	0	\N	BO3	regular_season	11	51	scheduled	2025-10-23 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
6545	1	35	36	0	2	36	BO3	regular_season	1	275	completed	2025-10-12 08:52:56.328	\N	2025-10-12 08:54:38.503	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.503741
6365	1	15	16	0	2	16	BO3	regular_season	1	95	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.518	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.518881
6275	1	5	6	0	2	6	BO3	regular_season	1	5	completed	2025-10-12 08:52:56.326	\N	2025-10-12 08:54:38.547	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.547407
6817	1	23	21	0	2	21	BO3	regular_season	2	187	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.96	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.96074
6907	1	33	31	0	2	31	BO3	regular_season	2	277	completed	2025-10-13 08:53:06.278	\N	2025-10-12 08:54:38.975	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:38.97575
6549	1	35	38	0	2	38	BO3	regular_season	2	279	completed	2025-10-13 08:52:56.328	\N	2025-10-12 08:54:39.009	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.009528
6369	1	15	18	0	2	18	BO3	regular_season	2	99	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.022	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.022999
6457	1	23	21	0	2	21	BO3	regular_season	2	187	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.036	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.036883
6279	1	5	8	0	2	8	BO3	regular_season	2	9	completed	2025-10-13 08:52:56.326	\N	2025-10-12 08:54:39.051	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.051817
6734	1	16	19	0	2	19	BO3	regular_season	3	104	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.459	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.459923
6914	1	36	39	0	2	39	BO3	regular_season	3	284	completed	2025-10-14 08:53:06.278	\N	2025-10-12 08:54:39.495	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.495444
6645	1	7	8	0	2	8	BO3	regular_season	3	15	completed	2025-10-14 08:53:06.277	\N	2025-10-12 08:54:39.512	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:39.512889
6372	1	14	12	0	2	12	BO3	regular_season	3	102	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.56	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.560252
6470	1	28	29	0	2	29	BO3	regular_season	4	200	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.116	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.116616
6832	1	26	24	0	2	24	BO3	regular_season	5	202	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.522	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.522641
6921	1	35	40	0	2	40	BO3	regular_season	5	291	completed	2025-10-16 08:53:06.278	\N	2025-10-12 08:54:40.535	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.536517
6565	1	39	31	0	2	31	BO3	regular_season	5	295	completed	2025-10-16 08:52:56.328	\N	2025-10-12 08:54:40.575	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.575344
6748	1	18	14	0	2	14	BO3	regular_season	6	118	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:40.996	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:40.996784
6839	1	29	23	0	2	23	BO3	regular_season	6	209	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.012	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.012204
6928	1	38	34	0	2	34	BO3	regular_season	6	298	completed	2025-10-17 08:53:06.278	\N	2025-10-12 08:54:41.026	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.026936
6568	1	38	34	0	2	34	BO3	regular_season	6	298	completed	2025-10-17 08:52:56.328	\N	2025-10-12 08:54:41.065	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.066081
6388	1	18	14	0	2	14	BO3	regular_season	6	118	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.08	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.080983
6477	1	27	25	0	2	25	BO3	regular_season	6	207	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.089	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.089599
6935	1	32	33	0	2	33	BO3	regular_season	7	305	completed	2025-10-18 08:53:06.278	\N	2025-10-12 08:54:41.541	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:41.541179
6391	1	17	20	0	2	20	BO3	regular_season	7	121	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.611	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.612133
6484	1	21	24	0	2	24	BO3	regular_season	7	214	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.624	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.624667
6303	1	9	5	0	2	5	BO3	regular_season	7	33	completed	2025-10-18 08:52:56.326	\N	2025-10-12 08:54:41.637	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.637302
6400	1	13	14	0	2	14	BO3	regular_season	8	130	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.109	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.109846
6853	1	22	27	0	2	27	BO3	regular_season	9	223	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.563	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.563274
6942	1	31	38	0	2	38	BO3	regular_season	9	312	completed	2025-10-20 08:53:06.278	\N	2025-10-12 08:54:42.577	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:42.577101
6584	1	33	36	0	2	36	BO3	regular_season	9	314	completed	2025-10-20 08:52:56.328	\N	2025-10-12 08:54:42.601	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.601538
6315	1	4	5	0	2	5	BO3	regular_season	9	45	completed	2025-10-20 08:52:56.326	\N	2025-10-12 08:54:42.623	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.6238
6766	1	20	11	0	2	11	BO3	regular_season	10	136	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.006	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.006783
6860	1	26	25	0	2	25	BO3	regular_season	10	230	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.06	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.061013
6949	1	37	34	0	2	34	BO3	regular_season	10	319	completed	2025-10-21 08:53:06.278	\N	2025-10-12 08:54:43.072	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:43.07264
6587	1	39	32	0	2	32	BO3	regular_season	10	317	completed	2025-10-21 08:52:56.328	\N	2025-10-12 08:54:43.097	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.097294
6410	1	16	15	0	2	15	BO3	regular_season	10	140	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.109	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.109302
6413	1	19	14	0	2	14	BO3	regular_season	11	143	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.635	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.635493
6867	1	22	24	0	2	24	BO3	regular_season	12	237	completed	2025-10-23 08:53:06.278	\N	2025-10-12 08:54:44.026	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.026191
6687	1	2	4	0	2	4	BO3	regular_season	12	57	completed	2025-10-23 08:53:06.277	\N	2025-10-12 08:54:44.052	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.052791
6416	1	20	13	0	2	13	BO3	regular_season	12	146	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.104	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.104149
6874	1	21	27	0	2	27	BO3	regular_season	13	244	completed	2025-10-24 08:53:06.278	\N	2025-10-12 08:54:44.53	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.530435
6694	1	1	7	0	2	7	BO3	regular_season	13	64	completed	2025-10-24 08:53:06.277	\N	2025-10-12 08:54:44.561	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:44.561572
6512	1	23	25	0	2	25	BO3	regular_season	13	242	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.594	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.594083
6698	1	3	7	0	2	7	BO3	regular_season	14	68	completed	2025-10-25 08:53:06.277	\N	2025-10-12 08:54:45.059	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.059352
6429	1	12	18	0	2	18	BO3	regular_season	14	159	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.087	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.087202
6339	1	2	8	0	2	8	BO3	regular_season	14	69	completed	2025-10-25 08:52:56.326	\N	2025-10-12 08:54:45.106	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.10622
6881	1	30	26	0	2	26	BO3	regular_season	15	251	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.472	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.472481
6794	1	13	19	0	2	19	BO3	regular_season	15	164	completed	2025-10-26 08:53:06.278	\N	2025-10-12 08:54:45.484	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.484123
6704	1	3	9	0	2	9	BO3	regular_season	15	74	completed	2025-10-26 08:53:06.277	\N	2025-10-12 08:54:45.522	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.522908
6432	1	15	17	0	2	17	BO3	regular_season	15	162	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.551	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.551587
6888	1	25	29	0	2	29	BO3	regular_season	16	258	completed	2025-10-27 08:53:06.278	\N	2025-10-12 08:54:45.943	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:45.94346
6891	1	30	28	0	2	28	BO3	regular_season	17	261	completed	2025-10-28 08:53:06.278	\N	2025-10-12 08:54:46.387	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.387788
6712	1	7	9	0	2	9	BO3	regular_season	17	82	completed	2025-10-28 08:53:06.277	\N	2025-10-12 08:54:46.445	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.445879
6445	1	14	13	0	2	13	BO3	regular_season	17	175	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.469	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.469904
6897	1	28	21	0	2	21	BO3	regular_season	18	267	completed	2025-10-29 08:53:06.278	\N	2025-10-12 08:54:46.894	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.894461
6719	1	6	3	0	2	3	BO3	regular_season	18	89	completed	2025-10-29 08:53:06.277	\N	2025-10-12 08:54:46.906	\N	2025-10-12 08:53:06.281711	2025-10-12 08:54:46.906439
6538	1	27	22	0	2	22	BO3	regular_season	18	268	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.944	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.944102
7042	7	1	3	0	0	\N	BO3	regular_season	11	52	scheduled	2025-10-23 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7043	7	9	4	0	0	\N	BO3	regular_season	11	53	scheduled	2025-10-23 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7044	7	8	5	0	0	\N	BO3	regular_season	11	54	scheduled	2025-10-23 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7045	7	7	6	0	0	\N	BO3	regular_season	11	55	scheduled	2025-10-23 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7046	7	10	3	0	0	\N	BO3	regular_season	12	56	scheduled	2025-10-24 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7047	7	2	4	0	0	\N	BO3	regular_season	12	57	scheduled	2025-10-24 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7048	7	1	5	0	0	\N	BO3	regular_season	12	58	scheduled	2025-10-24 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7049	7	9	6	0	0	\N	BO3	regular_season	12	59	scheduled	2025-10-24 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7050	7	8	7	0	0	\N	BO3	regular_season	12	60	scheduled	2025-10-24 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7051	7	10	4	0	0	\N	BO3	regular_season	13	61	scheduled	2025-10-25 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7052	7	3	5	0	0	\N	BO3	regular_season	13	62	scheduled	2025-10-25 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7053	7	2	6	0	0	\N	BO3	regular_season	13	63	scheduled	2025-10-25 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7054	7	1	7	0	0	\N	BO3	regular_season	13	64	scheduled	2025-10-25 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7055	7	9	8	0	0	\N	BO3	regular_season	13	65	scheduled	2025-10-25 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7056	7	10	5	0	0	\N	BO3	regular_season	14	66	scheduled	2025-10-26 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7057	7	4	6	0	0	\N	BO3	regular_season	14	67	scheduled	2025-10-26 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7058	7	3	7	0	0	\N	BO3	regular_season	14	68	scheduled	2025-10-26 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7059	7	2	8	0	0	\N	BO3	regular_season	14	69	scheduled	2025-10-26 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7060	7	1	9	0	0	\N	BO3	regular_season	14	70	scheduled	2025-10-26 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7061	7	10	6	0	0	\N	BO3	regular_season	15	71	scheduled	2025-10-27 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7062	7	5	7	0	0	\N	BO3	regular_season	15	72	scheduled	2025-10-27 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7063	7	4	8	0	0	\N	BO3	regular_season	15	73	scheduled	2025-10-27 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7064	7	3	9	0	0	\N	BO3	regular_season	15	74	scheduled	2025-10-27 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7065	7	2	1	0	0	\N	BO3	regular_season	15	75	scheduled	2025-10-27 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7066	7	10	7	0	0	\N	BO3	regular_season	16	76	scheduled	2025-10-28 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7067	7	6	8	0	0	\N	BO3	regular_season	16	77	scheduled	2025-10-28 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7068	7	5	9	0	0	\N	BO3	regular_season	16	78	scheduled	2025-10-28 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7069	7	4	1	0	0	\N	BO3	regular_season	16	79	scheduled	2025-10-28 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7070	7	3	2	0	0	\N	BO3	regular_season	16	80	scheduled	2025-10-28 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7071	7	10	8	0	0	\N	BO3	regular_season	17	81	scheduled	2025-10-29 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7072	7	7	9	0	0	\N	BO3	regular_season	17	82	scheduled	2025-10-29 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7073	7	6	1	0	0	\N	BO3	regular_season	17	83	scheduled	2025-10-29 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7074	7	5	2	0	0	\N	BO3	regular_season	17	84	scheduled	2025-10-29 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7075	7	4	3	0	0	\N	BO3	regular_season	17	85	scheduled	2025-10-29 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7076	7	10	9	0	0	\N	BO3	regular_season	18	86	scheduled	2025-10-30 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7077	7	8	1	0	0	\N	BO3	regular_season	18	87	scheduled	2025-10-30 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7078	7	7	2	0	0	\N	BO3	regular_season	18	88	scheduled	2025-10-30 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7079	7	6	3	0	0	\N	BO3	regular_season	18	89	scheduled	2025-10-30 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7080	7	5	4	0	0	\N	BO3	regular_season	18	90	scheduled	2025-10-30 00:52:53.243	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7081	7	11	20	0	0	\N	BO3	regular_season	1	91	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7082	7	12	19	0	0	\N	BO3	regular_season	1	92	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7083	7	13	18	0	0	\N	BO3	regular_season	1	93	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7084	7	14	17	0	0	\N	BO3	regular_season	1	94	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7085	7	15	16	0	0	\N	BO3	regular_season	1	95	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7086	7	12	20	0	0	\N	BO3	regular_season	2	96	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7087	7	13	11	0	0	\N	BO3	regular_season	2	97	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7088	7	14	19	0	0	\N	BO3	regular_season	2	98	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7089	7	15	18	0	0	\N	BO3	regular_season	2	99	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7090	7	16	17	0	0	\N	BO3	regular_season	2	100	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7091	7	13	20	0	0	\N	BO3	regular_season	3	101	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7092	7	14	12	0	0	\N	BO3	regular_season	3	102	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7093	7	15	11	0	0	\N	BO3	regular_season	3	103	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7094	7	16	19	0	0	\N	BO3	regular_season	3	104	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7095	7	17	18	0	0	\N	BO3	regular_season	3	105	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7096	7	14	20	0	0	\N	BO3	regular_season	4	106	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7097	7	15	13	0	0	\N	BO3	regular_season	4	107	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7098	7	16	12	0	0	\N	BO3	regular_season	4	108	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7099	7	17	11	0	0	\N	BO3	regular_season	4	109	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7100	7	18	19	0	0	\N	BO3	regular_season	4	110	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7101	7	15	20	0	0	\N	BO3	regular_season	5	111	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7102	7	16	14	0	0	\N	BO3	regular_season	5	112	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7103	7	17	13	0	0	\N	BO3	regular_season	5	113	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7104	7	18	12	0	0	\N	BO3	regular_season	5	114	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7105	7	19	11	0	0	\N	BO3	regular_season	5	115	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7106	7	16	20	0	0	\N	BO3	regular_season	6	116	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7107	7	17	15	0	0	\N	BO3	regular_season	6	117	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7108	7	18	14	0	0	\N	BO3	regular_season	6	118	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7109	7	19	13	0	0	\N	BO3	regular_season	6	119	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7110	7	11	12	0	0	\N	BO3	regular_season	6	120	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7111	7	17	20	0	0	\N	BO3	regular_season	7	121	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7112	7	18	16	0	0	\N	BO3	regular_season	7	122	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7113	7	19	15	0	0	\N	BO3	regular_season	7	123	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7114	7	11	14	0	0	\N	BO3	regular_season	7	124	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7115	7	12	13	0	0	\N	BO3	regular_season	7	125	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7116	7	18	20	0	0	\N	BO3	regular_season	8	126	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7117	7	19	17	0	0	\N	BO3	regular_season	8	127	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7118	7	11	16	0	0	\N	BO3	regular_season	8	128	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7119	7	12	15	0	0	\N	BO3	regular_season	8	129	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7120	7	13	14	0	0	\N	BO3	regular_season	8	130	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7121	7	19	20	0	0	\N	BO3	regular_season	9	131	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7122	7	11	18	0	0	\N	BO3	regular_season	9	132	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7123	7	12	17	0	0	\N	BO3	regular_season	9	133	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7124	7	13	16	0	0	\N	BO3	regular_season	9	134	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7125	7	14	15	0	0	\N	BO3	regular_season	9	135	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7126	7	20	11	0	0	\N	BO3	regular_season	10	136	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7127	7	19	12	0	0	\N	BO3	regular_season	10	137	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7128	7	18	13	0	0	\N	BO3	regular_season	10	138	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7129	7	17	14	0	0	\N	BO3	regular_season	10	139	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7130	7	16	15	0	0	\N	BO3	regular_season	10	140	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7131	7	20	12	0	0	\N	BO3	regular_season	11	141	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7132	7	11	13	0	0	\N	BO3	regular_season	11	142	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7133	7	19	14	0	0	\N	BO3	regular_season	11	143	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7134	7	18	15	0	0	\N	BO3	regular_season	11	144	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7135	7	17	16	0	0	\N	BO3	regular_season	11	145	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7136	7	20	13	0	0	\N	BO3	regular_season	12	146	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7137	7	12	14	0	0	\N	BO3	regular_season	12	147	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7138	7	11	15	0	0	\N	BO3	regular_season	12	148	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7139	7	19	16	0	0	\N	BO3	regular_season	12	149	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7140	7	18	17	0	0	\N	BO3	regular_season	12	150	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7141	7	20	14	0	0	\N	BO3	regular_season	13	151	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7142	7	13	15	0	0	\N	BO3	regular_season	13	152	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7143	7	12	16	0	0	\N	BO3	regular_season	13	153	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7144	7	11	17	0	0	\N	BO3	regular_season	13	154	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7145	7	19	18	0	0	\N	BO3	regular_season	13	155	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7146	7	20	15	0	0	\N	BO3	regular_season	14	156	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7147	7	14	16	0	0	\N	BO3	regular_season	14	157	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7148	7	13	17	0	0	\N	BO3	regular_season	14	158	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7149	7	12	18	0	0	\N	BO3	regular_season	14	159	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7150	7	11	19	0	0	\N	BO3	regular_season	14	160	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7151	7	20	16	0	0	\N	BO3	regular_season	15	161	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7152	7	15	17	0	0	\N	BO3	regular_season	15	162	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7153	7	14	18	0	0	\N	BO3	regular_season	15	163	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7154	7	13	19	0	0	\N	BO3	regular_season	15	164	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7155	7	12	11	0	0	\N	BO3	regular_season	15	165	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7156	7	20	17	0	0	\N	BO3	regular_season	16	166	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7157	7	16	18	0	0	\N	BO3	regular_season	16	167	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7158	7	15	19	0	0	\N	BO3	regular_season	16	168	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7159	7	14	11	0	0	\N	BO3	regular_season	16	169	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7160	7	13	12	0	0	\N	BO3	regular_season	16	170	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7161	7	20	18	0	0	\N	BO3	regular_season	17	171	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7162	7	17	19	0	0	\N	BO3	regular_season	17	172	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7163	7	16	11	0	0	\N	BO3	regular_season	17	173	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7164	7	15	12	0	0	\N	BO3	regular_season	17	174	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7165	7	14	13	0	0	\N	BO3	regular_season	17	175	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7166	7	20	19	0	0	\N	BO3	regular_season	18	176	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7167	7	18	11	0	0	\N	BO3	regular_season	18	177	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7168	7	17	12	0	0	\N	BO3	regular_season	18	178	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7169	7	16	13	0	0	\N	BO3	regular_season	18	179	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7170	7	15	14	0	0	\N	BO3	regular_season	18	180	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7171	7	21	30	0	0	\N	BO3	regular_season	1	181	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7172	7	22	29	0	0	\N	BO3	regular_season	1	182	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7173	7	23	28	0	0	\N	BO3	regular_season	1	183	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7174	7	24	27	0	0	\N	BO3	regular_season	1	184	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7175	7	25	26	0	0	\N	BO3	regular_season	1	185	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7176	7	22	30	0	0	\N	BO3	regular_season	2	186	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7177	7	23	21	0	0	\N	BO3	regular_season	2	187	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7178	7	24	29	0	0	\N	BO3	regular_season	2	188	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7179	7	25	28	0	0	\N	BO3	regular_season	2	189	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7180	7	26	27	0	0	\N	BO3	regular_season	2	190	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7181	7	23	30	0	0	\N	BO3	regular_season	3	191	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7182	7	24	22	0	0	\N	BO3	regular_season	3	192	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7183	7	25	21	0	0	\N	BO3	regular_season	3	193	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7184	7	26	29	0	0	\N	BO3	regular_season	3	194	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7185	7	27	28	0	0	\N	BO3	regular_season	3	195	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7186	7	24	30	0	0	\N	BO3	regular_season	4	196	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7187	7	25	23	0	0	\N	BO3	regular_season	4	197	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7188	7	26	22	0	0	\N	BO3	regular_season	4	198	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7189	7	27	21	0	0	\N	BO3	regular_season	4	199	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7190	7	28	29	0	0	\N	BO3	regular_season	4	200	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7191	7	25	30	0	0	\N	BO3	regular_season	5	201	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7192	7	26	24	0	0	\N	BO3	regular_season	5	202	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7193	7	27	23	0	0	\N	BO3	regular_season	5	203	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7194	7	28	22	0	0	\N	BO3	regular_season	5	204	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7195	7	29	21	0	0	\N	BO3	regular_season	5	205	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7196	7	26	30	0	0	\N	BO3	regular_season	6	206	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7197	7	27	25	0	0	\N	BO3	regular_season	6	207	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7198	7	28	24	0	0	\N	BO3	regular_season	6	208	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7199	7	29	23	0	0	\N	BO3	regular_season	6	209	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7200	7	21	22	0	0	\N	BO3	regular_season	6	210	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7201	7	27	30	0	0	\N	BO3	regular_season	7	211	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7202	7	28	26	0	0	\N	BO3	regular_season	7	212	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7203	7	29	25	0	0	\N	BO3	regular_season	7	213	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7204	7	21	24	0	0	\N	BO3	regular_season	7	214	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7205	7	22	23	0	0	\N	BO3	regular_season	7	215	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7206	7	28	30	0	0	\N	BO3	regular_season	8	216	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7207	7	29	27	0	0	\N	BO3	regular_season	8	217	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7208	7	21	26	0	0	\N	BO3	regular_season	8	218	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7209	7	22	25	0	0	\N	BO3	regular_season	8	219	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7210	7	23	24	0	0	\N	BO3	regular_season	8	220	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7211	7	29	30	0	0	\N	BO3	regular_season	9	221	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7212	7	21	28	0	0	\N	BO3	regular_season	9	222	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7213	7	22	27	0	0	\N	BO3	regular_season	9	223	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7214	7	23	26	0	0	\N	BO3	regular_season	9	224	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7215	7	24	25	0	0	\N	BO3	regular_season	9	225	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7216	7	30	21	0	0	\N	BO3	regular_season	10	226	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7217	7	29	22	0	0	\N	BO3	regular_season	10	227	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7218	7	28	23	0	0	\N	BO3	regular_season	10	228	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7219	7	27	24	0	0	\N	BO3	regular_season	10	229	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7220	7	26	25	0	0	\N	BO3	regular_season	10	230	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7221	7	30	22	0	0	\N	BO3	regular_season	11	231	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7222	7	21	23	0	0	\N	BO3	regular_season	11	232	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7223	7	29	24	0	0	\N	BO3	regular_season	11	233	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7224	7	28	25	0	0	\N	BO3	regular_season	11	234	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7225	7	27	26	0	0	\N	BO3	regular_season	11	235	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7226	7	30	23	0	0	\N	BO3	regular_season	12	236	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7227	7	22	24	0	0	\N	BO3	regular_season	12	237	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7228	7	21	25	0	0	\N	BO3	regular_season	12	238	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7229	7	29	26	0	0	\N	BO3	regular_season	12	239	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7230	7	28	27	0	0	\N	BO3	regular_season	12	240	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7231	7	30	24	0	0	\N	BO3	regular_season	13	241	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7232	7	23	25	0	0	\N	BO3	regular_season	13	242	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7233	7	22	26	0	0	\N	BO3	regular_season	13	243	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7234	7	21	27	0	0	\N	BO3	regular_season	13	244	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7235	7	29	28	0	0	\N	BO3	regular_season	13	245	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7236	7	30	25	0	0	\N	BO3	regular_season	14	246	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7237	7	24	26	0	0	\N	BO3	regular_season	14	247	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7238	7	23	27	0	0	\N	BO3	regular_season	14	248	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7239	7	22	28	0	0	\N	BO3	regular_season	14	249	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7240	7	21	29	0	0	\N	BO3	regular_season	14	250	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7241	7	30	26	0	0	\N	BO3	regular_season	15	251	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7242	7	25	27	0	0	\N	BO3	regular_season	15	252	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7243	7	24	28	0	0	\N	BO3	regular_season	15	253	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7244	7	23	29	0	0	\N	BO3	regular_season	15	254	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7245	7	22	21	0	0	\N	BO3	regular_season	15	255	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7246	7	30	27	0	0	\N	BO3	regular_season	16	256	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7247	7	26	28	0	0	\N	BO3	regular_season	16	257	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7248	7	25	29	0	0	\N	BO3	regular_season	16	258	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7249	7	24	21	0	0	\N	BO3	regular_season	16	259	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7250	7	23	22	0	0	\N	BO3	regular_season	16	260	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7251	7	30	28	0	0	\N	BO3	regular_season	17	261	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7252	7	27	29	0	0	\N	BO3	regular_season	17	262	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7253	7	26	21	0	0	\N	BO3	regular_season	17	263	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7254	7	25	22	0	0	\N	BO3	regular_season	17	264	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7255	7	24	23	0	0	\N	BO3	regular_season	17	265	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7256	7	30	29	0	0	\N	BO3	regular_season	18	266	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7257	7	28	21	0	0	\N	BO3	regular_season	18	267	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7258	7	27	22	0	0	\N	BO3	regular_season	18	268	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7259	7	26	23	0	0	\N	BO3	regular_season	18	269	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7260	7	25	24	0	0	\N	BO3	regular_season	18	270	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7261	7	31	40	0	0	\N	BO3	regular_season	1	271	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7262	7	32	39	0	0	\N	BO3	regular_season	1	272	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7263	7	33	38	0	0	\N	BO3	regular_season	1	273	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7264	7	34	37	0	0	\N	BO3	regular_season	1	274	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7265	7	35	36	0	0	\N	BO3	regular_season	1	275	scheduled	2025-10-13 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7266	7	32	40	0	0	\N	BO3	regular_season	2	276	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7267	7	33	31	0	0	\N	BO3	regular_season	2	277	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7268	7	34	39	0	0	\N	BO3	regular_season	2	278	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7269	7	35	38	0	0	\N	BO3	regular_season	2	279	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7270	7	36	37	0	0	\N	BO3	regular_season	2	280	scheduled	2025-10-14 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7271	7	33	40	0	0	\N	BO3	regular_season	3	281	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7272	7	34	32	0	0	\N	BO3	regular_season	3	282	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7273	7	35	31	0	0	\N	BO3	regular_season	3	283	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7274	7	36	39	0	0	\N	BO3	regular_season	3	284	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7275	7	37	38	0	0	\N	BO3	regular_season	3	285	scheduled	2025-10-15 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7276	7	34	40	0	0	\N	BO3	regular_season	4	286	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7277	7	35	33	0	0	\N	BO3	regular_season	4	287	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7278	7	36	32	0	0	\N	BO3	regular_season	4	288	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7279	7	37	31	0	0	\N	BO3	regular_season	4	289	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7280	7	38	39	0	0	\N	BO3	regular_season	4	290	scheduled	2025-10-16 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7281	7	35	40	0	0	\N	BO3	regular_season	5	291	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7282	7	36	34	0	0	\N	BO3	regular_season	5	292	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7283	7	37	33	0	0	\N	BO3	regular_season	5	293	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7284	7	38	32	0	0	\N	BO3	regular_season	5	294	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7285	7	39	31	0	0	\N	BO3	regular_season	5	295	scheduled	2025-10-17 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7286	7	36	40	0	0	\N	BO3	regular_season	6	296	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7287	7	37	35	0	0	\N	BO3	regular_season	6	297	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7288	7	38	34	0	0	\N	BO3	regular_season	6	298	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7289	7	39	33	0	0	\N	BO3	regular_season	6	299	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7290	7	31	32	0	0	\N	BO3	regular_season	6	300	scheduled	2025-10-18 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7291	7	37	40	0	0	\N	BO3	regular_season	7	301	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7292	7	38	36	0	0	\N	BO3	regular_season	7	302	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7293	7	39	35	0	0	\N	BO3	regular_season	7	303	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7294	7	31	34	0	0	\N	BO3	regular_season	7	304	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7295	7	32	33	0	0	\N	BO3	regular_season	7	305	scheduled	2025-10-19 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7296	7	38	40	0	0	\N	BO3	regular_season	8	306	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7297	7	39	37	0	0	\N	BO3	regular_season	8	307	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7298	7	31	36	0	0	\N	BO3	regular_season	8	308	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7299	7	32	35	0	0	\N	BO3	regular_season	8	309	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7300	7	33	34	0	0	\N	BO3	regular_season	8	310	scheduled	2025-10-20 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7301	7	39	40	0	0	\N	BO3	regular_season	9	311	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7302	7	31	38	0	0	\N	BO3	regular_season	9	312	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7303	7	32	37	0	0	\N	BO3	regular_season	9	313	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7304	7	33	36	0	0	\N	BO3	regular_season	9	314	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7305	7	34	35	0	0	\N	BO3	regular_season	9	315	scheduled	2025-10-21 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7306	7	40	31	0	0	\N	BO3	regular_season	10	316	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7307	7	39	32	0	0	\N	BO3	regular_season	10	317	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7308	7	38	33	0	0	\N	BO3	regular_season	10	318	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7309	7	37	34	0	0	\N	BO3	regular_season	10	319	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7310	7	36	35	0	0	\N	BO3	regular_season	10	320	scheduled	2025-10-22 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7311	7	40	32	0	0	\N	BO3	regular_season	11	321	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7312	7	31	33	0	0	\N	BO3	regular_season	11	322	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7313	7	39	34	0	0	\N	BO3	regular_season	11	323	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7314	7	38	35	0	0	\N	BO3	regular_season	11	324	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7315	7	37	36	0	0	\N	BO3	regular_season	11	325	scheduled	2025-10-23 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7316	7	40	33	0	0	\N	BO3	regular_season	12	326	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7317	7	32	34	0	0	\N	BO3	regular_season	12	327	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7318	7	31	35	0	0	\N	BO3	regular_season	12	328	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7319	7	39	36	0	0	\N	BO3	regular_season	12	329	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7320	7	38	37	0	0	\N	BO3	regular_season	12	330	scheduled	2025-10-24 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7321	7	40	34	0	0	\N	BO3	regular_season	13	331	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7322	7	33	35	0	0	\N	BO3	regular_season	13	332	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7323	7	32	36	0	0	\N	BO3	regular_season	13	333	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7324	7	31	37	0	0	\N	BO3	regular_season	13	334	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7325	7	39	38	0	0	\N	BO3	regular_season	13	335	scheduled	2025-10-25 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7326	7	40	35	0	0	\N	BO3	regular_season	14	336	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7327	7	34	36	0	0	\N	BO3	regular_season	14	337	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7328	7	33	37	0	0	\N	BO3	regular_season	14	338	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7329	7	32	38	0	0	\N	BO3	regular_season	14	339	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7330	7	31	39	0	0	\N	BO3	regular_season	14	340	scheduled	2025-10-26 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7331	7	40	36	0	0	\N	BO3	regular_season	15	341	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7332	7	35	37	0	0	\N	BO3	regular_season	15	342	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7333	7	34	38	0	0	\N	BO3	regular_season	15	343	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7334	7	33	39	0	0	\N	BO3	regular_season	15	344	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7335	7	32	31	0	0	\N	BO3	regular_season	15	345	scheduled	2025-10-27 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7336	7	40	37	0	0	\N	BO3	regular_season	16	346	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7337	7	36	38	0	0	\N	BO3	regular_season	16	347	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7338	7	35	39	0	0	\N	BO3	regular_season	16	348	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7339	7	34	31	0	0	\N	BO3	regular_season	16	349	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7340	7	33	32	0	0	\N	BO3	regular_season	16	350	scheduled	2025-10-28 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7341	7	40	38	0	0	\N	BO3	regular_season	17	351	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7342	7	37	39	0	0	\N	BO3	regular_season	17	352	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7343	7	36	31	0	0	\N	BO3	regular_season	17	353	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7344	7	35	32	0	0	\N	BO3	regular_season	17	354	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7345	7	34	33	0	0	\N	BO3	regular_season	17	355	scheduled	2025-10-29 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7346	7	40	39	0	0	\N	BO3	regular_season	18	356	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7347	7	38	31	0	0	\N	BO3	regular_season	18	357	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7348	7	37	32	0	0	\N	BO3	regular_season	18	358	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7349	7	36	33	0	0	\N	BO3	regular_season	18	359	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
7350	7	35	34	0	0	\N	BO3	regular_season	18	360	scheduled	2025-10-30 00:52:53.244	\N	\N	\N	2025-10-13 00:52:53.248506	2025-10-13 00:52:53.248506
6991	7	1	10	0	2	10	BO3	regular_season	1	1	completed	2025-10-13 00:52:53.243	\N	2025-10-13 03:17:42.528	\N	2025-10-13 00:52:53.248506	2025-10-13 03:17:42.531254
6992	7	2	9	0	2	9	BO3	regular_season	1	2	completed	2025-10-13 00:52:53.243	\N	2025-10-13 03:17:55.108	\N	2025-10-13 00:52:53.248506	2025-10-13 03:17:55.110236
6993	7	3	8	0	2	8	BO3	regular_season	1	3	completed	2025-10-13 00:52:53.243	\N	2025-10-13 03:21:30.236	\N	2025-10-13 00:52:53.248506	2025-10-13 03:21:30.242625
6994	7	4	7	0	2	7	BO3	regular_season	1	4	completed	2025-10-13 00:52:53.243	\N	2025-10-13 03:22:18.103	\N	2025-10-13 00:52:53.248506	2025-10-13 03:22:18.105852
6995	7	5	6	0	2	6	BO3	regular_season	1	5	completed	2025-10-13 00:52:53.243	\N	2025-10-13 03:22:20.187	\N	2025-10-13 00:52:53.248506	2025-10-13 03:22:20.190623
6274	1	4	7	0	2	7	BO3	regular_season	1	4	completed	2025-10-12 08:52:56.326	\N	2025-10-12 08:54:38.551	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.551661
6273	1	3	8	0	2	8	BO3	regular_season	1	3	completed	2025-10-12 08:52:56.326	\N	2025-10-12 08:54:38.554	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.554191
6272	1	2	9	0	2	9	BO3	regular_season	1	2	completed	2025-10-12 08:52:56.326	\N	2025-10-12 08:54:38.557	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.557248
6271	1	1	10	0	2	10	BO3	regular_season	1	1	completed	2025-10-12 08:52:56.326	\N	2025-10-12 08:54:38.559	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.559812
6280	1	6	7	0	2	7	BO3	regular_season	2	10	completed	2025-10-13 08:52:56.326	\N	2025-10-12 08:54:39.049	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.049295
6278	1	4	9	0	2	9	BO3	regular_season	2	8	completed	2025-10-13 08:52:56.326	\N	2025-10-12 08:54:39.054	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.054403
6277	1	3	1	0	2	1	BO3	regular_season	2	7	completed	2025-10-13 08:52:56.326	\N	2025-10-12 08:54:39.057	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.057404
6276	1	2	10	0	2	10	BO3	regular_season	2	6	completed	2025-10-13 08:52:56.326	\N	2025-10-12 08:54:39.059	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.059683
6285	1	7	8	0	2	8	BO3	regular_season	3	15	completed	2025-10-14 08:52:56.326	\N	2025-10-12 08:54:39.58	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.580663
6284	1	6	9	0	2	9	BO3	regular_season	3	14	completed	2025-10-14 08:52:56.326	\N	2025-10-12 08:54:39.583	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.583888
6283	1	5	1	0	2	1	BO3	regular_season	3	13	completed	2025-10-14 08:52:56.326	\N	2025-10-12 08:54:39.586	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.586951
6282	1	4	2	0	2	2	BO3	regular_season	3	12	completed	2025-10-14 08:52:56.326	\N	2025-10-12 08:54:39.588	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.58895
6281	1	3	10	0	2	10	BO3	regular_season	3	11	completed	2025-10-14 08:52:56.326	\N	2025-10-12 08:54:39.596	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.596379
6289	1	7	1	0	2	1	BO3	regular_season	4	19	completed	2025-10-15 08:52:56.326	\N	2025-10-12 08:54:40.121	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.12191
6288	1	6	2	0	2	2	BO3	regular_season	4	18	completed	2025-10-15 08:52:56.326	\N	2025-10-12 08:54:40.124	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.124988
6287	1	5	3	0	2	3	BO3	regular_season	4	17	completed	2025-10-15 08:52:56.326	\N	2025-10-12 08:54:40.127	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.127795
6286	1	4	10	0	2	10	BO3	regular_season	4	16	completed	2025-10-15 08:52:56.326	\N	2025-10-12 08:54:40.13	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.130288
6295	1	9	1	0	2	1	BO3	regular_season	5	25	completed	2025-10-16 08:52:56.326	\N	2025-10-12 08:54:40.613	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.61387
6294	1	8	2	0	2	2	BO3	regular_season	5	24	completed	2025-10-16 08:52:56.326	\N	2025-10-12 08:54:40.615	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.615672
6293	1	7	3	0	2	3	BO3	regular_season	5	23	completed	2025-10-16 08:52:56.326	\N	2025-10-12 08:54:40.617	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.617385
6291	1	5	10	0	2	10	BO3	regular_season	5	21	completed	2025-10-16 08:52:56.326	\N	2025-10-12 08:54:40.62	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.621095
6300	1	1	2	0	2	2	BO3	regular_season	6	30	completed	2025-10-17 08:52:56.326	\N	2025-10-12 08:54:41.105	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.105351
6299	1	9	3	0	2	3	BO3	regular_season	6	29	completed	2025-10-17 08:52:56.326	\N	2025-10-12 08:54:41.107	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.107986
6298	1	8	4	0	2	4	BO3	regular_season	6	28	completed	2025-10-17 08:52:56.326	\N	2025-10-12 08:54:41.11	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.110314
6297	1	7	5	0	2	5	BO3	regular_season	6	27	completed	2025-10-17 08:52:56.326	\N	2025-10-12 08:54:41.112	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.112603
6296	1	6	10	0	2	10	BO3	regular_season	6	26	completed	2025-10-17 08:52:56.326	\N	2025-10-12 08:54:41.114	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.115052
6305	1	2	3	0	2	3	BO3	regular_season	7	35	completed	2025-10-18 08:52:56.326	\N	2025-10-12 08:54:41.628	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.628876
6304	1	1	4	0	2	4	BO3	regular_season	7	34	completed	2025-10-18 08:52:56.326	\N	2025-10-12 08:54:41.63	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.630963
6302	1	8	6	0	2	6	BO3	regular_season	7	32	completed	2025-10-18 08:52:56.326	\N	2025-10-12 08:54:41.638	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.638991
6301	1	7	10	0	2	10	BO3	regular_season	7	31	completed	2025-10-18 08:52:56.326	\N	2025-10-12 08:54:41.64	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.640616
6310	1	3	4	0	2	4	BO3	regular_season	8	40	completed	2025-10-19 08:52:56.326	\N	2025-10-12 08:54:42.144	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.144789
6309	1	2	5	0	2	5	BO3	regular_season	8	39	completed	2025-10-19 08:52:56.326	\N	2025-10-12 08:54:42.146	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.146801
6308	1	1	6	0	2	6	BO3	regular_season	8	38	completed	2025-10-19 08:52:56.326	\N	2025-10-12 08:54:42.152	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.152811
6307	1	9	7	0	2	7	BO3	regular_season	8	37	completed	2025-10-19 08:52:56.326	\N	2025-10-12 08:54:42.154	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.154772
6306	1	8	10	0	2	10	BO3	regular_season	8	36	completed	2025-10-19 08:52:56.326	\N	2025-10-12 08:54:42.156	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.156766
6314	1	3	6	0	2	6	BO3	regular_season	9	44	completed	2025-10-20 08:52:56.326	\N	2025-10-12 08:54:42.625	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.625149
6313	1	2	7	0	2	7	BO3	regular_season	9	43	completed	2025-10-20 08:52:56.326	\N	2025-10-12 08:54:42.626	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.626462
6312	1	1	8	0	2	8	BO3	regular_season	9	42	completed	2025-10-20 08:52:56.326	\N	2025-10-12 08:54:42.627	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.627702
6311	1	9	10	0	2	10	BO3	regular_season	9	41	completed	2025-10-20 08:52:56.326	\N	2025-10-12 08:54:42.628	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.628971
6320	1	6	5	0	2	5	BO3	regular_season	10	50	completed	2025-10-21 08:52:56.326	\N	2025-10-12 08:54:43.149	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.150029
6319	1	7	4	0	2	4	BO3	regular_season	10	49	completed	2025-10-21 08:52:56.326	\N	2025-10-12 08:54:43.184	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.184793
6318	1	8	3	0	2	3	BO3	regular_season	10	48	completed	2025-10-21 08:52:56.326	\N	2025-10-12 08:54:43.188	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.188563
6317	1	9	2	0	2	2	BO3	regular_season	10	47	completed	2025-10-21 08:52:56.326	\N	2025-10-12 08:54:43.192	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.192867
6325	1	7	6	0	2	6	BO3	regular_season	11	55	completed	2025-10-22 08:52:56.326	\N	2025-10-12 08:54:43.646	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.646253
6324	1	8	5	0	2	5	BO3	regular_season	11	54	completed	2025-10-22 08:52:56.326	\N	2025-10-12 08:54:43.647	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.647333
6323	1	9	4	0	2	4	BO3	regular_season	11	53	completed	2025-10-22 08:52:56.326	\N	2025-10-12 08:54:43.648	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.64873
6322	1	1	3	0	2	3	BO3	regular_season	11	52	completed	2025-10-22 08:52:56.326	\N	2025-10-12 08:54:43.649	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.649901
6321	1	10	2	0	2	2	BO3	regular_season	11	51	completed	2025-10-22 08:52:56.326	\N	2025-10-12 08:54:43.651	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.651302
6330	1	8	7	0	2	7	BO3	regular_season	12	60	completed	2025-10-23 08:52:56.326	\N	2025-10-12 08:54:44.119	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.119239
6329	1	9	6	0	2	6	BO3	regular_season	12	59	completed	2025-10-23 08:52:56.326	\N	2025-10-12 08:54:44.121	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.121512
6327	1	2	4	0	2	4	BO3	regular_season	12	57	completed	2025-10-23 08:52:56.326	\N	2025-10-12 08:54:44.126	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.126519
6326	1	10	3	0	2	3	BO3	regular_season	12	56	completed	2025-10-23 08:52:56.326	\N	2025-10-12 08:54:44.128	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.12901
6333	1	2	6	0	2	6	BO3	regular_season	13	63	completed	2025-10-24 08:52:56.326	\N	2025-10-12 08:54:44.611	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.611926
6332	1	3	5	0	2	5	BO3	regular_season	13	62	completed	2025-10-24 08:52:56.326	\N	2025-10-12 08:54:44.613	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.614021
6331	1	10	4	0	2	4	BO3	regular_season	13	61	completed	2025-10-24 08:52:56.326	\N	2025-10-12 08:54:44.616	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.61639
6364	1	14	17	0	2	17	BO3	regular_season	1	94	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.521	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.521248
6363	1	13	18	0	2	18	BO3	regular_season	1	93	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.527	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.52769
6362	1	12	19	0	2	19	BO3	regular_season	1	92	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.53	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.530327
6361	1	11	20	0	2	20	BO3	regular_season	1	91	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.532	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.532488
6370	1	16	17	0	2	17	BO3	regular_season	2	100	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.02	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.020343
6368	1	14	19	0	2	19	BO3	regular_season	2	98	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.025	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.025323
6367	1	13	11	0	2	11	BO3	regular_season	2	97	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.027	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.027274
6366	1	12	20	0	2	20	BO3	regular_season	2	96	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.029	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.029575
6375	1	17	18	0	2	18	BO3	regular_season	3	105	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.551	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.55177
6374	1	16	19	0	2	19	BO3	regular_season	3	104	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.554	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.554641
6373	1	15	11	0	2	11	BO3	regular_season	3	103	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.557	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.557747
6371	1	13	20	0	2	20	BO3	regular_season	3	101	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.562	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.562834
6380	1	18	19	0	2	19	BO3	regular_season	4	110	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.077	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.077801
6379	1	17	11	0	2	11	BO3	regular_season	4	109	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.079	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.080005
6378	1	16	12	0	2	12	BO3	regular_season	4	108	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.084	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.084421
6377	1	15	13	0	2	13	BO3	regular_season	4	107	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.091	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.091165
6376	1	14	20	0	2	20	BO3	regular_season	4	106	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.094	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.09461
6384	1	18	12	0	2	12	BO3	regular_season	5	114	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.59	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.591025
6383	1	17	13	0	2	13	BO3	regular_season	5	113	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.592	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.592997
6382	1	16	14	0	2	14	BO3	regular_season	5	112	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.595	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.595078
6381	1	15	20	0	2	20	BO3	regular_season	5	111	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.597	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.597721
6390	1	11	12	0	2	12	BO3	regular_season	6	120	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.074	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.074256
6389	1	19	13	0	2	13	BO3	regular_season	6	119	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.077	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.078614
6387	1	17	15	0	2	15	BO3	regular_season	6	117	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.083	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.083314
6386	1	16	20	0	2	20	BO3	regular_season	6	116	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.085	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.085652
6395	1	12	13	0	2	13	BO3	regular_season	7	125	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.595	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.595731
6394	1	11	14	0	2	14	BO3	regular_season	7	124	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.6	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.60105
6393	1	19	15	0	2	15	BO3	regular_season	7	123	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.603	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.603783
6392	1	18	16	0	2	16	BO3	regular_season	7	122	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.606	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.606401
6398	1	11	16	0	2	16	BO3	regular_season	8	128	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.117	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.117763
6397	1	19	17	0	2	17	BO3	regular_season	8	127	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.121	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.121273
6396	1	18	20	0	2	20	BO3	regular_season	8	126	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.124	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.12463
6335	1	9	8	0	2	8	BO3	regular_season	13	65	completed	2025-10-24 08:52:56.326	\N	2025-10-12 08:54:44.607	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.607961
6334	1	1	7	0	2	7	BO3	regular_season	13	64	completed	2025-10-24 08:52:56.326	\N	2025-10-12 08:54:44.609	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.609921
6340	1	1	9	0	2	9	BO3	regular_season	14	70	completed	2025-10-25 08:52:56.326	\N	2025-10-12 08:54:45.104	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.104671
6338	1	3	7	0	2	7	BO3	regular_season	14	68	completed	2025-10-25 08:52:56.326	\N	2025-10-12 08:54:45.107	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.107974
6337	1	4	6	0	2	6	BO3	regular_season	14	67	completed	2025-10-25 08:52:56.326	\N	2025-10-12 08:54:45.109	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.109799
6336	1	10	5	0	2	5	BO3	regular_season	14	66	completed	2025-10-25 08:52:56.326	\N	2025-10-12 08:54:45.111	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.111394
6341	1	10	6	0	2	6	BO3	regular_season	15	71	completed	2025-10-26 08:52:56.326	\N	2025-10-12 08:54:45.554	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.554353
6342	1	5	7	0	2	7	BO3	regular_season	15	72	completed	2025-10-26 08:52:56.326	\N	2025-10-12 08:54:45.555	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.555767
6343	1	4	8	0	2	8	BO3	regular_season	15	73	completed	2025-10-26 08:52:56.326	\N	2025-10-12 08:54:45.557	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.557375
6345	1	2	1	0	2	1	BO3	regular_season	15	75	completed	2025-10-26 08:52:56.326	\N	2025-10-12 08:54:45.559	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.560002
6350	1	3	2	0	2	2	BO3	regular_season	16	80	completed	2025-10-27 08:52:56.326	\N	2025-10-12 08:54:46.017	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.017379
6349	1	4	1	0	2	1	BO3	regular_season	16	79	completed	2025-10-27 08:52:56.326	\N	2025-10-12 08:54:46.018	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.018854
6348	1	5	9	0	2	9	BO3	regular_season	16	78	completed	2025-10-27 08:52:56.326	\N	2025-10-12 08:54:46.02	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.020394
6347	1	6	8	0	2	8	BO3	regular_season	16	77	completed	2025-10-27 08:52:56.326	\N	2025-10-12 08:54:46.021	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.022076
6346	1	10	7	0	2	7	BO3	regular_season	16	76	completed	2025-10-27 08:52:56.326	\N	2025-10-12 08:54:46.023	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.024016
6352	1	7	9	0	2	9	BO3	regular_season	17	82	completed	2025-10-28 08:52:56.326	\N	2025-10-12 08:54:46.488	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.488592
6353	1	6	1	0	2	1	BO3	regular_season	17	83	completed	2025-10-28 08:52:56.326	\N	2025-10-12 08:54:46.49	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.490072
6354	1	5	2	0	2	2	BO3	regular_season	17	84	completed	2025-10-28 08:52:56.326	\N	2025-10-12 08:54:46.491	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.491444
6355	1	4	3	0	2	3	BO3	regular_season	17	85	completed	2025-10-28 08:52:56.326	\N	2025-10-12 08:54:46.493	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.493296
6356	1	10	9	0	2	9	BO3	regular_season	18	86	completed	2025-10-29 08:52:56.326	\N	2025-10-12 08:54:46.951	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.951926
6357	1	8	1	0	2	1	BO3	regular_season	18	87	completed	2025-10-29 08:52:56.326	\N	2025-10-12 08:54:46.954	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.95442
6359	1	6	3	0	2	3	BO3	regular_season	18	89	completed	2025-10-29 08:52:56.326	\N	2025-10-12 08:54:46.958	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.959023
6360	1	5	4	0	2	4	BO3	regular_season	18	90	completed	2025-10-29 08:52:56.326	\N	2025-10-12 08:54:46.96	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.960957
6452	1	22	29	0	2	29	BO3	regular_season	1	182	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.536	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.537065
6453	1	23	28	0	2	28	BO3	regular_season	1	183	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.539	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.539966
6454	1	24	27	0	2	27	BO3	regular_season	1	184	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.542	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.542527
6455	1	25	26	0	2	26	BO3	regular_season	1	185	completed	2025-10-12 08:52:56.327	\N	2025-10-12 08:54:38.545	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.54513
6456	1	22	30	0	2	30	BO3	regular_season	2	186	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.033	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.033928
6458	1	24	29	0	2	29	BO3	regular_season	2	188	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.039	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.039845
6459	1	25	28	0	2	28	BO3	regular_season	2	189	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.042	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.043058
6460	1	26	27	0	2	27	BO3	regular_season	2	190	completed	2025-10-13 08:52:56.327	\N	2025-10-12 08:54:39.046	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.046202
6461	1	23	30	0	2	30	BO3	regular_season	3	191	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.565	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.565947
6462	1	24	22	0	2	22	BO3	regular_season	3	192	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.57	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.570203
6463	1	25	21	0	2	21	BO3	regular_season	3	193	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.572	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.572411
6399	1	12	15	0	2	15	BO3	regular_season	8	129	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.112	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.112211
6405	1	14	15	0	2	15	BO3	regular_season	9	135	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.608	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.60893
6404	1	13	16	0	2	16	BO3	regular_season	9	134	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.61	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.61029
6403	1	12	17	0	2	17	BO3	regular_season	9	133	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.611	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.611869
6402	1	11	18	0	2	18	BO3	regular_season	9	132	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.613	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.613622
6401	1	19	20	0	2	20	BO3	regular_season	9	131	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.615	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.615279
6409	1	17	14	0	2	14	BO3	regular_season	10	139	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.111	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.111463
6408	1	18	13	0	2	13	BO3	regular_season	10	138	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.113	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.114116
6407	1	19	12	0	2	12	BO3	regular_season	10	137	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.116	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.117012
6406	1	20	11	0	2	11	BO3	regular_season	10	136	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.119	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.119329
6415	1	17	16	0	2	16	BO3	regular_season	11	145	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.632	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.633005
6414	1	18	15	0	2	15	BO3	regular_season	11	144	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.634	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.63428
6412	1	11	13	0	2	13	BO3	regular_season	11	142	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.636	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.636792
6411	1	20	12	0	2	12	BO3	regular_season	11	141	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.638	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.638185
6420	1	18	17	0	2	17	BO3	regular_season	12	150	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.089	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.089296
6419	1	19	16	0	2	16	BO3	regular_season	12	149	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.095	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.095146
6418	1	11	15	0	2	15	BO3	regular_season	12	148	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.098	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.098327
6417	1	12	14	0	2	14	BO3	regular_season	12	147	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.101	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.101281
6425	1	19	18	0	2	18	BO3	regular_season	13	155	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.582	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.582491
6424	1	11	17	0	2	17	BO3	regular_season	13	154	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.584	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.584267
6423	1	12	16	0	2	16	BO3	regular_season	13	153	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.585	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.585962
6422	1	13	15	0	2	15	BO3	regular_season	13	152	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.587	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.587739
6421	1	20	14	0	2	14	BO3	regular_season	13	151	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.589	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.589635
6430	1	11	19	0	2	19	BO3	regular_season	14	160	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.085	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.085115
6428	1	13	17	0	2	17	BO3	regular_season	14	158	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.089	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.089195
6427	1	14	16	0	2	16	BO3	regular_season	14	157	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.092	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.092371
6426	1	20	15	0	2	15	BO3	regular_season	14	156	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.094	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.094412
6433	1	14	18	0	2	18	BO3	regular_season	15	163	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.538	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.539031
6435	1	12	11	0	2	11	BO3	regular_season	15	165	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.547	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.547266
6434	1	13	19	0	2	19	BO3	regular_season	15	164	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.548	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.549016
6431	1	20	16	0	2	16	BO3	regular_season	15	161	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.552	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.55288
6440	1	13	12	0	2	12	BO3	regular_season	16	170	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.008	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.008905
6439	1	14	11	0	2	11	BO3	regular_season	16	169	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.01	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.010218
6438	1	15	19	0	2	19	BO3	regular_season	16	168	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.011	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.011718
6437	1	16	18	0	2	18	BO3	regular_season	16	167	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.013	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.013788
6436	1	20	17	0	2	17	BO3	regular_season	16	166	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.015	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.015792
6444	1	15	12	0	2	12	BO3	regular_season	17	174	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.471	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.471574
6443	1	16	11	0	2	11	BO3	regular_season	17	173	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.473	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.473302
6442	1	17	19	0	2	19	BO3	regular_season	17	172	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.475	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.475357
6441	1	20	18	0	2	18	BO3	regular_season	17	171	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.476	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.476843
6446	1	20	19	0	2	19	BO3	regular_season	18	176	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.929	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.929804
6447	1	18	11	0	2	11	BO3	regular_season	18	177	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.931	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.931847
6449	1	16	13	0	2	13	BO3	regular_season	18	179	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.935	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.935809
6450	1	15	14	0	2	14	BO3	regular_season	18	180	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.938	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.938213
6465	1	27	28	0	2	28	BO3	regular_season	3	195	completed	2025-10-14 08:52:56.327	\N	2025-10-12 08:54:39.578	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.578518
6466	1	24	30	0	2	30	BO3	regular_season	4	196	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.097	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.097813
6467	1	25	23	0	2	23	BO3	regular_season	4	197	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.108	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.108356
6468	1	26	22	0	2	22	BO3	regular_season	4	198	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.111	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.111924
6469	1	27	21	0	2	21	BO3	regular_season	4	199	completed	2025-10-15 08:52:56.327	\N	2025-10-12 08:54:40.114	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.114284
6471	1	25	30	0	2	30	BO3	regular_season	5	201	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.6	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.60016
6472	1	26	24	0	2	24	BO3	regular_season	5	202	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.603	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.603605
6473	1	27	23	0	2	23	BO3	regular_season	5	203	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.607	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.607336
6474	1	28	22	0	2	22	BO3	regular_season	5	204	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.609	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.609723
6475	1	29	21	0	2	21	BO3	regular_season	5	205	completed	2025-10-16 08:52:56.327	\N	2025-10-12 08:54:40.611	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.611959
6476	1	26	30	0	2	30	BO3	regular_season	6	206	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.087	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.087671
6478	1	28	24	0	2	24	BO3	regular_season	6	208	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.091	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.092016
6479	1	29	23	0	2	23	BO3	regular_season	6	209	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.094	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.094684
6480	1	21	22	0	2	22	BO3	regular_season	6	210	completed	2025-10-17 08:52:56.327	\N	2025-10-12 08:54:41.096	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.096888
6481	1	27	30	0	2	30	BO3	regular_season	7	211	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.616	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.616331
6482	1	28	26	0	2	26	BO3	regular_season	7	212	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.619	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.619636
6483	1	29	25	0	2	25	BO3	regular_season	7	213	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.622	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.622466
6485	1	22	23	0	2	23	BO3	regular_season	7	215	completed	2025-10-18 08:52:56.327	\N	2025-10-12 08:54:41.626	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.626493
6486	1	28	30	0	2	30	BO3	regular_season	8	216	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.127	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.127498
6487	1	29	27	0	2	27	BO3	regular_season	8	217	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.13	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.130627
6488	1	21	26	0	2	26	BO3	regular_season	8	218	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.134	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.134228
6489	1	22	25	0	2	25	BO3	regular_season	8	219	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.137	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.137569
6490	1	23	24	0	2	24	BO3	regular_season	8	220	completed	2025-10-19 08:52:56.327	\N	2025-10-12 08:54:42.142	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.142365
6492	1	21	28	0	2	28	BO3	regular_season	9	222	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.618	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.618269
6493	1	22	27	0	2	27	BO3	regular_season	9	223	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.619	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.619736
6494	1	23	26	0	2	26	BO3	regular_season	9	224	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.62	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.62103
6495	1	24	25	0	2	25	BO3	regular_season	9	225	completed	2025-10-20 08:52:56.327	\N	2025-10-12 08:54:42.622	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.622315
6496	1	30	21	0	2	21	BO3	regular_season	10	226	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.121	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.121838
6497	1	29	22	0	2	22	BO3	regular_season	10	227	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.124	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.124178
6499	1	27	24	0	2	24	BO3	regular_season	10	229	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.129	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.129759
6500	1	26	25	0	2	25	BO3	regular_season	10	230	completed	2025-10-21 08:52:56.327	\N	2025-10-12 08:54:43.133	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.133615
6501	1	30	22	0	2	22	BO3	regular_season	11	231	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.639	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.639593
6502	1	21	23	0	2	23	BO3	regular_season	11	232	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.641	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.641201
6503	1	29	24	0	2	24	BO3	regular_season	11	233	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.642	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.64238
6504	1	28	25	0	2	25	BO3	regular_season	11	234	completed	2025-10-22 08:52:56.327	\N	2025-10-12 08:54:43.643	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.643616
6506	1	30	23	0	2	23	BO3	regular_season	12	236	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.106	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.107064
6507	1	22	24	0	2	24	BO3	regular_season	12	237	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.11	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.110267
6508	1	21	25	0	2	25	BO3	regular_season	12	238	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.112	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.112617
6509	1	29	26	0	2	26	BO3	regular_season	12	239	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.115	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.115058
6510	1	28	27	0	2	27	BO3	regular_season	12	240	completed	2025-10-23 08:52:56.327	\N	2025-10-12 08:54:44.117	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.11728
6511	1	30	24	0	2	24	BO3	regular_season	13	241	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.591	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.591434
6513	1	22	26	0	2	26	BO3	regular_season	13	243	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.597	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.597698
6514	1	21	27	0	2	27	BO3	regular_season	13	244	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.602	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.602529
6515	1	29	28	0	2	28	BO3	regular_season	13	245	completed	2025-10-24 08:52:56.327	\N	2025-10-12 08:54:44.605	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.605593
6516	1	30	25	0	2	25	BO3	regular_season	14	246	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.096	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.096297
6517	1	24	26	0	2	26	BO3	regular_season	14	247	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.098	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.098119
6518	1	23	27	0	2	27	BO3	regular_season	14	248	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.099	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.099616
6520	1	21	29	0	2	29	BO3	regular_season	14	250	completed	2025-10-25 08:52:56.327	\N	2025-10-12 08:54:45.102	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.102849
6524	1	23	29	0	2	29	BO3	regular_season	15	254	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.54	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.540221
6523	1	24	28	0	2	28	BO3	regular_season	15	253	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.541	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.541476
6522	1	25	27	0	2	27	BO3	regular_season	15	252	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.542	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.543002
6521	1	30	26	0	2	26	BO3	regular_season	15	251	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.545	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.545492
6525	1	22	21	0	2	21	BO3	regular_season	15	255	completed	2025-10-26 08:52:56.327	\N	2025-10-12 08:54:45.55	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.55045
6527	1	26	28	0	2	28	BO3	regular_season	16	257	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.003	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.003578
6528	1	25	29	0	2	29	BO3	regular_season	16	258	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.006	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.00637
6544	1	34	37	0	2	37	BO3	regular_season	1	274	completed	2025-10-12 08:52:56.328	\N	2025-10-12 08:54:38.506	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.506846
6543	1	33	38	0	2	38	BO3	regular_season	1	273	completed	2025-10-12 08:52:56.328	\N	2025-10-12 08:54:38.51	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.510931
6542	1	32	39	0	2	39	BO3	regular_season	1	272	completed	2025-10-12 08:52:56.328	\N	2025-10-12 08:54:38.513	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.51385
6541	1	31	40	0	2	40	BO3	regular_season	1	271	completed	2025-10-12 08:52:56.328	\N	2025-10-12 08:54:38.516	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:38.516532
6550	1	36	37	0	2	37	BO3	regular_season	2	280	completed	2025-10-13 08:52:56.328	\N	2025-10-12 08:54:39.007	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.007227
6548	1	34	39	0	2	39	BO3	regular_season	2	278	completed	2025-10-13 08:52:56.328	\N	2025-10-12 08:54:39.012	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.012322
6547	1	33	31	0	2	31	BO3	regular_season	2	277	completed	2025-10-13 08:52:56.328	\N	2025-10-12 08:54:39.014	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.01509
6546	1	32	40	0	2	40	BO3	regular_season	2	276	completed	2025-10-13 08:52:56.328	\N	2025-10-12 08:54:39.017	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.017457
6555	1	37	38	0	2	38	BO3	regular_season	3	285	completed	2025-10-14 08:52:56.328	\N	2025-10-12 08:54:39.536	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.536717
6554	1	36	39	0	2	39	BO3	regular_season	3	284	completed	2025-10-14 08:52:56.328	\N	2025-10-12 08:54:39.539	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.540062
6553	1	35	31	0	2	31	BO3	regular_season	3	283	completed	2025-10-14 08:52:56.328	\N	2025-10-12 08:54:39.542	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.542506
6551	1	33	40	0	2	40	BO3	regular_season	3	281	completed	2025-10-14 08:52:56.328	\N	2025-10-12 08:54:39.548	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:39.548607
6560	1	38	39	0	2	39	BO3	regular_season	4	290	completed	2025-10-15 08:52:56.328	\N	2025-10-12 08:54:40.063	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.063139
6559	1	37	31	0	2	31	BO3	regular_season	4	289	completed	2025-10-15 08:52:56.328	\N	2025-10-12 08:54:40.065	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.065922
6558	1	36	32	0	2	32	BO3	regular_season	4	288	completed	2025-10-15 08:52:56.328	\N	2025-10-12 08:54:40.068	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.068574
6557	1	35	33	0	2	33	BO3	regular_season	4	287	completed	2025-10-15 08:52:56.328	\N	2025-10-12 08:54:40.07	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.070977
6556	1	34	40	0	2	40	BO3	regular_season	4	286	completed	2025-10-15 08:52:56.328	\N	2025-10-12 08:54:40.072	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.072945
6564	1	38	32	0	2	32	BO3	regular_season	5	294	completed	2025-10-16 08:52:56.328	\N	2025-10-12 08:54:40.577	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.577654
6563	1	37	33	0	2	33	BO3	regular_season	5	293	completed	2025-10-16 08:52:56.328	\N	2025-10-12 08:54:40.579	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.580011
6562	1	36	34	0	2	34	BO3	regular_season	5	292	completed	2025-10-16 08:52:56.328	\N	2025-10-12 08:54:40.582	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.58233
6561	1	35	40	0	2	40	BO3	regular_season	5	291	completed	2025-10-16 08:52:56.328	\N	2025-10-12 08:54:40.586	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:40.58617
6570	1	31	32	0	2	32	BO3	regular_season	6	300	completed	2025-10-17 08:52:56.328	\N	2025-10-12 08:54:41.058	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.05891
6569	1	39	33	0	2	33	BO3	regular_season	6	299	completed	2025-10-17 08:52:56.328	\N	2025-10-12 08:54:41.062	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.062823
6567	1	37	35	0	2	35	BO3	regular_season	6	297	completed	2025-10-17 08:52:56.328	\N	2025-10-12 08:54:41.068	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.069009
6566	1	36	40	0	2	40	BO3	regular_season	6	296	completed	2025-10-17 08:52:56.328	\N	2025-10-12 08:54:41.071	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.071605
6575	1	32	33	0	2	33	BO3	regular_season	7	305	completed	2025-10-18 08:52:56.328	\N	2025-10-12 08:54:41.572	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.57305
6574	1	31	34	0	2	34	BO3	regular_season	7	304	completed	2025-10-18 08:52:56.328	\N	2025-10-12 08:54:41.577	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.57749
6573	1	39	35	0	2	35	BO3	regular_season	7	303	completed	2025-10-18 08:52:56.328	\N	2025-10-12 08:54:41.581	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.581499
6572	1	38	36	0	2	36	BO3	regular_season	7	302	completed	2025-10-18 08:52:56.328	\N	2025-10-12 08:54:41.589	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:41.590081
6580	1	33	34	0	2	34	BO3	regular_season	8	310	completed	2025-10-19 08:52:56.328	\N	2025-10-12 08:54:42.087	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.087386
6579	1	32	35	0	2	35	BO3	regular_season	8	309	completed	2025-10-19 08:52:56.328	\N	2025-10-12 08:54:42.092	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.092513
6578	1	31	36	0	2	36	BO3	regular_season	8	308	completed	2025-10-19 08:52:56.328	\N	2025-10-12 08:54:42.095	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.095203
6577	1	39	37	0	2	37	BO3	regular_season	8	307	completed	2025-10-19 08:52:56.328	\N	2025-10-12 08:54:42.098	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.098218
6576	1	38	40	0	2	40	BO3	regular_season	8	306	completed	2025-10-19 08:52:56.328	\N	2025-10-12 08:54:42.107	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.107227
6585	1	34	35	0	2	35	BO3	regular_season	9	315	completed	2025-10-20 08:52:56.328	\N	2025-10-12 08:54:42.599	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.599516
6583	1	32	37	0	2	37	BO3	regular_season	9	313	completed	2025-10-20 08:52:56.328	\N	2025-10-12 08:54:42.603	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.603472
6582	1	31	38	0	2	38	BO3	regular_season	9	312	completed	2025-10-20 08:52:56.328	\N	2025-10-12 08:54:42.605	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.605271
6581	1	39	40	0	2	40	BO3	regular_season	9	311	completed	2025-10-20 08:52:56.328	\N	2025-10-12 08:54:42.607	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:42.607099
6590	1	36	35	0	2	35	BO3	regular_season	10	320	completed	2025-10-21 08:52:56.328	\N	2025-10-12 08:54:43.089	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.089357
6589	1	37	34	0	2	34	BO3	regular_season	10	319	completed	2025-10-21 08:52:56.328	\N	2025-10-12 08:54:43.092	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.092157
6588	1	38	33	0	2	33	BO3	regular_season	10	318	completed	2025-10-21 08:52:56.328	\N	2025-10-12 08:54:43.094	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.09435
6586	1	40	31	0	2	31	BO3	regular_season	10	316	completed	2025-10-21 08:52:56.328	\N	2025-10-12 08:54:43.107	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.107132
6593	1	39	34	0	2	34	BO3	regular_season	11	323	completed	2025-10-22 08:52:56.328	\N	2025-10-12 08:54:43.627	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.627385
6592	1	31	33	0	2	33	BO3	regular_season	11	322	completed	2025-10-22 08:52:56.328	\N	2025-10-12 08:54:43.628	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.628864
6591	1	40	32	0	2	32	BO3	regular_season	11	321	completed	2025-10-22 08:52:56.328	\N	2025-10-12 08:54:43.63	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.630984
6530	1	23	22	0	2	22	BO3	regular_season	16	260	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.004	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.004933
6529	1	24	21	0	2	21	BO3	regular_season	16	259	completed	2025-10-27 08:52:56.327	\N	2025-10-12 08:54:46.007	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.007654
6532	1	27	29	0	2	29	BO3	regular_season	17	262	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.48	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.480276
6533	1	26	21	0	2	21	BO3	regular_season	17	263	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.481	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.481824
6534	1	25	22	0	2	22	BO3	regular_season	17	264	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.483	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.483493
6535	1	24	23	0	2	23	BO3	regular_season	17	265	completed	2025-10-28 08:52:56.327	\N	2025-10-12 08:54:46.484	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.484843
6536	1	30	29	0	2	29	BO3	regular_season	18	266	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.94	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.940109
6537	1	28	21	0	2	21	BO3	regular_season	18	267	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.941	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.941928
6539	1	26	23	0	2	23	BO3	regular_season	18	269	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.945	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.946045
6540	1	25	24	0	2	24	BO3	regular_season	18	270	completed	2025-10-29 08:52:56.327	\N	2025-10-12 08:54:46.947	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.947882
6595	1	37	36	0	2	36	BO3	regular_season	11	325	completed	2025-10-22 08:52:56.328	\N	2025-10-12 08:54:43.624	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.624512
6594	1	38	35	0	2	35	BO3	regular_season	11	324	completed	2025-10-22 08:52:56.328	\N	2025-10-12 08:54:43.625	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:43.626029
6600	1	38	37	0	2	37	BO3	regular_season	12	330	completed	2025-10-23 08:52:56.328	\N	2025-10-12 08:54:44.067	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.067216
6599	1	39	36	0	2	36	BO3	regular_season	12	329	completed	2025-10-23 08:52:56.328	\N	2025-10-12 08:54:44.074	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.074511
6598	1	31	35	0	2	35	BO3	regular_season	12	328	completed	2025-10-23 08:52:56.328	\N	2025-10-12 08:54:44.077	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.077719
6597	1	32	34	0	2	34	BO3	regular_season	12	327	completed	2025-10-23 08:52:56.328	\N	2025-10-12 08:54:44.08	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.080116
6596	1	40	33	0	2	33	BO3	regular_season	12	326	completed	2025-10-23 08:52:56.328	\N	2025-10-12 08:54:44.086	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.086979
6605	1	39	38	0	2	38	BO3	regular_season	13	335	completed	2025-10-24 08:52:56.328	\N	2025-10-12 08:54:44.569	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.569678
6604	1	31	37	0	2	37	BO3	regular_season	13	334	completed	2025-10-24 08:52:56.328	\N	2025-10-12 08:54:44.571	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.572068
6603	1	32	36	0	2	36	BO3	regular_season	13	333	completed	2025-10-24 08:52:56.328	\N	2025-10-12 08:54:44.574	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.574586
6602	1	33	35	0	2	35	BO3	regular_season	13	332	completed	2025-10-24 08:52:56.328	\N	2025-10-12 08:54:44.577	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.577074
6601	1	40	34	0	2	34	BO3	regular_season	13	331	completed	2025-10-24 08:52:56.328	\N	2025-10-12 08:54:44.579	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:44.579843
6606	1	40	35	0	2	35	BO3	regular_season	14	336	completed	2025-10-25 08:52:56.328	\N	2025-10-12 08:54:45.071	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.07168
6607	1	34	36	0	2	36	BO3	regular_season	14	337	completed	2025-10-25 08:52:56.328	\N	2025-10-12 08:54:45.074	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.075038
6608	1	33	37	0	2	37	BO3	regular_season	14	338	completed	2025-10-25 08:52:56.328	\N	2025-10-12 08:54:45.077	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.077532
6609	1	32	38	0	2	38	BO3	regular_season	14	339	completed	2025-10-25 08:52:56.328	\N	2025-10-12 08:54:45.08	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.080104
6610	1	31	39	0	2	39	BO3	regular_season	14	340	completed	2025-10-25 08:52:56.328	\N	2025-10-12 08:54:45.082	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.082805
6611	1	40	36	0	2	36	BO3	regular_season	15	341	completed	2025-10-26 08:52:56.328	\N	2025-10-12 08:54:45.527	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.527861
6612	1	35	37	0	2	37	BO3	regular_season	15	342	completed	2025-10-26 08:52:56.328	\N	2025-10-12 08:54:45.529	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.529832
6613	1	34	38	0	2	38	BO3	regular_season	15	343	completed	2025-10-26 08:52:56.328	\N	2025-10-12 08:54:45.533	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.5337
6614	1	33	39	0	2	39	BO3	regular_season	15	344	completed	2025-10-26 08:52:56.328	\N	2025-10-12 08:54:45.536	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.536357
6615	1	32	31	0	2	31	BO3	regular_season	15	345	completed	2025-10-26 08:52:56.328	\N	2025-10-12 08:54:45.537	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.537794
6618	1	35	39	0	2	39	BO3	regular_season	16	348	completed	2025-10-27 08:52:56.328	\N	2025-10-12 08:54:45.988	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.988501
6616	1	40	37	0	2	37	BO3	regular_season	16	346	completed	2025-10-27 08:52:56.328	\N	2025-10-12 08:54:45.99	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.990663
6617	1	36	38	0	2	38	BO3	regular_season	16	347	completed	2025-10-27 08:52:56.328	\N	2025-10-12 08:54:45.994	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.994138
6619	1	34	31	0	2	31	BO3	regular_season	16	349	completed	2025-10-27 08:52:56.328	\N	2025-10-12 08:54:45.996	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.996691
6620	1	33	32	0	2	32	BO3	regular_season	16	350	completed	2025-10-27 08:52:56.328	\N	2025-10-12 08:54:45.999	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:45.999393
6621	1	40	38	0	2	38	BO3	regular_season	17	351	completed	2025-10-28 08:52:56.328	\N	2025-10-12 08:54:46.454	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.454419
6622	1	37	39	0	2	39	BO3	regular_season	17	352	completed	2025-10-28 08:52:56.328	\N	2025-10-12 08:54:46.455	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.455978
6623	1	36	31	0	2	31	BO3	regular_season	17	353	completed	2025-10-28 08:52:56.328	\N	2025-10-12 08:54:46.457	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.457774
6624	1	35	32	0	2	32	BO3	regular_season	17	354	completed	2025-10-28 08:52:56.328	\N	2025-10-12 08:54:46.466	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.466509
6625	1	34	33	0	2	33	BO3	regular_season	17	355	completed	2025-10-28 08:52:56.328	\N	2025-10-12 08:54:46.468	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.468321
6630	1	35	34	0	2	34	BO3	regular_season	18	360	completed	2025-10-29 08:52:56.328	\N	2025-10-12 08:54:46.912	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.912967
6626	1	40	39	0	2	39	BO3	regular_season	18	356	completed	2025-10-29 08:52:56.328	\N	2025-10-12 08:54:46.92	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.920883
6627	1	38	31	0	2	31	BO3	regular_season	18	357	completed	2025-10-29 08:52:56.328	\N	2025-10-12 08:54:46.923	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.923762
6628	1	37	32	0	2	32	BO3	regular_season	18	358	completed	2025-10-29 08:52:56.328	\N	2025-10-12 08:54:46.925	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.925762
6629	1	36	33	0	2	33	BO3	regular_season	18	359	completed	2025-10-29 08:52:56.328	\N	2025-10-12 08:54:46.927	\N	2025-10-12 08:52:56.33373	2025-10-12 08:54:46.927666
\.


--
-- Data for Name: msi_brackets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.msi_brackets (id, season_id, season_year, status, qualified_teams, legendary_group, challenger_group, qualifier_group, champion_id, runner_up_id, third_place_id, fourth_place_id, loser_round_2, loser_round_1, points_distribution, created_at, updated_at) FROM stdin;
1	1	2024	completed	[{"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "1", "regionId": "1", "teamName": "JD Gaming", "regionName": "中国大陆职业联赛", "regularSeasonRank": 4, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}, {"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "13", "regionId": "2", "teamName": "DRX", "regionName": "韩国冠军联赛", "regularSeasonRank": 2, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}, {"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "23", "regionId": "3", "teamName": "MAD Lions", "regionName": "欧洲冠军联赛", "regularSeasonRank": 2, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}, {"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "32", "regionId": "4", "teamName": "Team Liquid", "regionName": "北美冠军联赛", "regularSeasonRank": 1, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "3", "regionId": "1", "teamName": "Top Esports", "regionName": "中国大陆职业联赛", "regularSeasonRank": 2, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "11", "regionId": "2", "teamName": "T1", "regionName": "韩国冠军联赛", "regularSeasonRank": 4, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "22", "regionId": "3", "teamName": "Fnatic", "regionName": "欧洲冠军联赛", "regularSeasonRank": 1, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "33", "regionId": "4", "teamName": "100 Thieves", "regionName": "北美冠军联赛", "regularSeasonRank": 2, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "2", "regionId": "1", "teamName": "Bilibili Gaming", "regionName": "中国大陆职业联赛", "regularSeasonRank": 1, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "12", "regionId": "2", "teamName": "Gen.G", "regionName": "韩国冠军联赛", "regularSeasonRank": 1, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "24", "regionId": "3", "teamName": "Team Vitality", "regionName": "欧洲冠军联赛", "regularSeasonRank": 3, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "31", "regionId": "4", "teamName": "Cloud9", "regionName": "北美冠军联赛", "regularSeasonRank": 4, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}]	[{"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "1", "regionId": "1", "teamName": "JD Gaming", "regionName": "中国大陆职业联赛", "regularSeasonRank": 4, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}, {"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "13", "regionId": "2", "teamName": "DRX", "regionName": "韩国冠军联赛", "regularSeasonRank": 2, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}, {"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "23", "regionId": "3", "teamName": "MAD Lions", "regionName": "欧洲冠军联赛", "regularSeasonRank": 2, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}, {"seed": 1, "wins": "18", "group": "legendary", "losses": "18", "teamId": "32", "regionId": "4", "teamName": "Team Liquid", "regionName": "北美冠军联赛", "regularSeasonRank": 1, "springPlayoffRank": 1, "regularSeasonPoints": "54", "springPlayoffPoints": 12}]	[{"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "3", "regionId": "1", "teamName": "Top Esports", "regionName": "中国大陆职业联赛", "regularSeasonRank": 2, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "11", "regionId": "2", "teamName": "T1", "regionName": "韩国冠军联赛", "regularSeasonRank": 4, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "22", "regionId": "3", "teamName": "Fnatic", "regionName": "欧洲冠军联赛", "regularSeasonRank": 1, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "33", "regionId": "4", "teamName": "100 Thieves", "regionName": "北美冠军联赛", "regularSeasonRank": 2, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}]	[{"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "2", "regionId": "1", "teamName": "Bilibili Gaming", "regionName": "中国大陆职业联赛", "regularSeasonRank": 1, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "12", "regionId": "2", "teamName": "Gen.G", "regionName": "韩国冠军联赛", "regularSeasonRank": 1, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "24", "regionId": "3", "teamName": "Team Vitality", "regionName": "欧洲冠军联赛", "regularSeasonRank": 3, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "31", "regionId": "4", "teamName": "Cloud9", "regionName": "北美冠军联赛", "regularSeasonRank": 4, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}]	32	12	1	23	[{"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "11", "regionId": "2", "teamName": "T1", "regionName": "韩国冠军联赛", "regularSeasonRank": 4, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "22", "regionId": "3", "teamName": "Fnatic", "regionName": "欧洲冠军联赛", "regularSeasonRank": 1, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}]	[{"seed": 2, "wins": "18", "group": "challenger", "losses": "18", "teamId": "3", "regionId": "1", "teamName": "Top Esports", "regionName": "中国大陆职业联赛", "regularSeasonRank": 2, "springPlayoffRank": 2, "regularSeasonPoints": "54", "springPlayoffPoints": 10}, {"seed": 3, "wins": "18", "group": "qualifier", "losses": "18", "teamId": "24", "regionId": "3", "teamName": "Team Vitality", "regionName": "欧洲冠军联赛", "regularSeasonRank": 3, "springPlayoffRank": 3, "regularSeasonPoints": "54", "springPlayoffPoints": 8}]	{"champion": 20, "runnerUp": 16, "thirdPlace": 12, "fourthPlace": 8, "loserRound1": 4, "loserRound2": 6}	2025-10-12 13:40:25.229341+08	2025-10-12 20:41:19.792998+08
\.


--
-- Data for Name: msi_matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.msi_matches (id, msi_bracket_id, round_number, match_type, bracket_type, best_of, match_number, team_a_id, team_b_id, team_a_name, team_b_name, team_a_seed, team_b_seed, score_a, score_b, winner_id, status, next_match_id, loser_next_match_id, scheduled_at, completed_at, created_at, updated_at) FROM stdin;
10	1	3	winners_round_1	winners	5	10	23	32	MAD Lions	Team Liquid	1	1	2	3	32	completed	14	12	\N	2025-10-12 20:40:37.600231+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:40:37.600231+08
11	1	4	losers_round_3	losers	5	11	12	13	Gen.G	DRX	\N	\N	3	1	12	completed	13	\N	\N	2025-10-12 20:40:49.690335+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:40:49.690335+08
12	1	4	losers_round_3	losers	5	12	33	23	100 Thieves	MAD Lions	\N	\N	1	3	23	completed	13	\N	\N	2025-10-12 20:40:51.881536+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:40:51.881536+08
13	1	5	losers_round_4	losers	5	13	12	23	Gen.G	MAD Lions	\N	\N	3	2	12	completed	15	\N	\N	2025-10-12 20:41:04.058656+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:41:04.058656+08
1	1	1	qualifier_knockout	qualifier	5	1	2	12	Bilibili Gaming	Gen.G	3	3	0	3	12	completed	5	\N	\N	2025-10-12 13:43:15.791473+08	2025-10-12 13:40:25.229341+08	2025-10-12 13:43:15.791473+08
2	1	1	qualifier_knockout	qualifier	5	2	24	31	Team Vitality	Cloud9	3	3	3	0	24	completed	6	\N	\N	2025-10-12 14:03:38.52393+08	2025-10-12 13:40:25.229341+08	2025-10-12 14:03:38.52393+08
14	1	5	winners_round_2	winners	5	14	1	32	JD Gaming	Team Liquid	\N	\N	1	3	32	completed	16	15	\N	2025-10-12 20:41:09.755633+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:41:09.755633+08
3	1	1	challenger_match	challenger	5	3	3	11	Top Esports	T1	2	2	2	3	11	completed	7	5	\N	2025-10-12 20:35:59.112516+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:35:59.112516+08
4	1	1	challenger_match	challenger	5	4	22	33	Fnatic	100 Thieves	2	2	3	2	22	completed	8	6	\N	2025-10-12 20:38:41.487541+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:38:41.487541+08
15	1	6	losers_final	losers	5	15	12	1	Gen.G	JD Gaming	\N	\N	3	2	12	completed	16	\N	\N	2025-10-12 20:41:18.270938+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:41:18.270938+08
5	1	2	losers_round_1	losers	5	5	12	3	Gen.G	Top Esports	\N	\N	3	1	12	completed	7	\N	\N	2025-10-12 20:39:25.931352+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:39:25.931352+08
16	1	7	grand_final	grand_final	5	16	32	12	Team Liquid	Gen.G	\N	\N	3	0	32	completed	\N	\N	\N	2025-10-12 20:41:19.792998+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:41:19.792998+08
6	1	2	losers_round_1	losers	5	6	24	33	Team Vitality	100 Thieves	\N	\N	1	3	33	completed	8	\N	\N	2025-10-12 20:39:31.580541+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:39:31.580541+08
7	1	3	losers_round_2	losers	5	7	11	12	T1	Gen.G	\N	\N	2	3	12	completed	11	\N	\N	2025-10-12 20:39:39.369434+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:39:39.369434+08
8	1	3	losers_round_2	losers	5	8	22	33	Fnatic	100 Thieves	\N	\N	0	3	33	completed	12	\N	\N	2025-10-12 20:40:16.480785+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:40:16.480785+08
9	1	3	winners_round_1	winners	5	9	1	13	JD Gaming	DRX	1	1	3	0	1	completed	14	11	\N	2025-10-12 20:40:25.1458+08	2025-10-12 13:40:25.229341+08	2025-10-12 20:40:25.1458+08
\.


--
-- Data for Name: playoff_brackets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.playoff_brackets (id, competition_id, region_id, region_name, competition_type, status, qualified_teams, champion_id, runner_up_id, third_place_id, fourth_place_id, points_distribution, created_at, updated_at) FROM stdin;
7b1eb62c-5e57-4492-b29e-20aae0c2b742	1	1	中国大陆职业联赛	spring	completed	[{"seed": 1, "wins": "18", "losses": "18", "teamId": "2", "regionId": "1", "teamName": "Bilibili Gaming", "regularSeasonRank": 1, "regularSeasonPoints": "54"}, {"seed": 2, "wins": "18", "losses": "18", "teamId": "3", "regionId": "1", "teamName": "Top Esports", "regularSeasonRank": 2, "regularSeasonPoints": "54"}, {"seed": 3, "wins": "18", "losses": "18", "teamId": "4", "regionId": "1", "teamName": "Weibo Gaming", "regularSeasonRank": 3, "regularSeasonPoints": "54"}, {"seed": 4, "wins": "18", "losses": "18", "teamId": "1", "regionId": "1", "teamName": "JD Gaming", "regularSeasonRank": 4, "regularSeasonPoints": "54"}]	1	3	2	4	{"champion": 12, "runnerUp": 10, "thirdPlace": 8, "fourthPlace": 6}	2025-10-12 10:29:08.640287	2025-10-12 13:39:51.737151
ed34c66f-6c96-4924-a441-3ff6e4ca4eb1	1	2	韩国冠军联赛	spring	completed	[{"seed": 1, "wins": "18", "losses": "18", "teamId": "12", "regionId": "2", "teamName": "Gen.G", "regularSeasonRank": 1, "regularSeasonPoints": "54"}, {"seed": 2, "wins": "18", "losses": "18", "teamId": "13", "regionId": "2", "teamName": "DRX", "regularSeasonRank": 2, "regularSeasonPoints": "54"}, {"seed": 3, "wins": "18", "losses": "18", "teamId": "14", "regionId": "2", "teamName": "KT Rolster", "regularSeasonRank": 3, "regularSeasonPoints": "54"}, {"seed": 4, "wins": "18", "losses": "18", "teamId": "11", "regionId": "2", "teamName": "T1", "regularSeasonRank": 4, "regularSeasonPoints": "54"}]	13	11	12	14	{"champion": 12, "runnerUp": 10, "thirdPlace": 8, "fourthPlace": 6}	2025-10-12 10:29:39.994458	2025-10-12 13:39:53.586747
384a25f9-e533-470a-9bf7-6b758f688d0f	1	3	欧洲冠军联赛	spring	completed	[{"seed": 1, "wins": "18", "losses": "18", "teamId": "22", "regionId": "3", "teamName": "Fnatic", "regularSeasonRank": 1, "regularSeasonPoints": "54"}, {"seed": 2, "wins": "18", "losses": "18", "teamId": "23", "regionId": "3", "teamName": "MAD Lions", "regularSeasonRank": 2, "regularSeasonPoints": "54"}, {"seed": 3, "wins": "18", "losses": "18", "teamId": "24", "regionId": "3", "teamName": "Team Vitality", "regularSeasonRank": 3, "regularSeasonPoints": "54"}, {"seed": 4, "wins": "18", "losses": "18", "teamId": "21", "regionId": "3", "teamName": "G2 Esports", "regularSeasonRank": 4, "regularSeasonPoints": "54"}]	23	22	24	21	{"champion": 12, "runnerUp": 10, "thirdPlace": 8, "fourthPlace": 6}	2025-10-12 10:29:52.670497	2025-10-12 13:39:55.388944
db307da2-fb29-490b-af8b-352518c1763f	1	4	北美冠军联赛	spring	completed	[{"seed": 1, "wins": "18", "losses": "18", "teamId": "32", "regionId": "4", "teamName": "Team Liquid", "regularSeasonRank": 1, "regularSeasonPoints": "54"}, {"seed": 2, "wins": "18", "losses": "18", "teamId": "33", "regionId": "4", "teamName": "100 Thieves", "regularSeasonRank": 2, "regularSeasonPoints": "54"}, {"seed": 3, "wins": "18", "losses": "18", "teamId": "34", "regionId": "4", "teamName": "TSM", "regularSeasonRank": 3, "regularSeasonPoints": "54"}, {"seed": 4, "wins": "18", "losses": "18", "teamId": "31", "regionId": "4", "teamName": "Cloud9", "regularSeasonRank": 4, "regularSeasonPoints": "54"}]	32	33	31	34	{"champion": 12, "runnerUp": 10, "thirdPlace": 8, "fourthPlace": 6}	2025-10-12 10:30:44.270101	2025-10-12 13:39:57.193729
\.


--
-- Data for Name: playoff_matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.playoff_matches (id, playoff_bracket_id, competition_id, round_number, match_type, best_of, team_a_id, team_b_id, team_a_name, team_b_name, team_a_seed, team_b_seed, score_a, score_b, winner_id, status, next_match_id, loser_next_match_id, scheduled_at, completed_at, created_at, updated_at) FROM stdin;
f542a1c2-2e29-4be0-b522-86367fe7fb5d	384a25f9-e533-470a-9bf7-6b758f688d0f	1	1	winners_bracket	5	22	23	Fnatic	MAD Lions	1	2	3	2	22	completed	fe2c77c7-2166-4605-ba58-db101f7289b0	b538c8f9-8c45-4cda-a835-20a67d9e87c5	\N	2025-10-12 13:39:54.577111	2025-10-12 10:29:52.670497	2025-10-12 13:39:54.577111
0a3216e1-4da8-4fdf-a6cc-a4d7bb3f44e3	7b1eb62c-5e57-4492-b29e-20aae0c2b742	1	2	losers_bracket	5	1	2	JD Gaming	Bilibili Gaming	\N	\N	3	2	1	completed	61657b02-f571-4e7e-8fbc-a78c985eca4f	\N	\N	2025-10-12 13:39:51.332064	2025-10-12 10:29:08.640287	2025-10-12 13:39:51.332064
96bf064d-a2f1-4d58-9621-51d015e3fe07	db307da2-fb29-490b-af8b-352518c1763f	1	3	grand_final	5	32	33	Team Liquid	100 Thieves	\N	\N	3	0	32	completed	\N	\N	\N	2025-10-12 13:39:57.193729	2025-10-12 10:30:44.270101	2025-10-12 13:39:57.193729
b538c8f9-8c45-4cda-a835-20a67d9e87c5	384a25f9-e533-470a-9bf7-6b758f688d0f	1	2	losers_bracket	5	24	23	Team Vitality	MAD Lions	\N	\N	2	3	23	completed	fe2c77c7-2166-4605-ba58-db101f7289b0	\N	\N	2025-10-12 13:39:54.979819	2025-10-12 10:29:52.670497	2025-10-12 13:39:54.979819
5b2409de-874c-46e3-be0b-d10777e73b69	7b1eb62c-5e57-4492-b29e-20aae0c2b742	1	1	losers_bracket	5	4	1	Weibo Gaming	JD Gaming	3	4	2	3	1	completed	0a3216e1-4da8-4fdf-a6cc-a4d7bb3f44e3	\N	\N	2025-10-12 13:39:08.665697	2025-10-12 10:29:08.640287	2025-10-12 13:39:08.665697
863f148e-f4f7-4fc0-ad60-102da540e1bb	7b1eb62c-5e57-4492-b29e-20aae0c2b742	1	1	winners_bracket	5	2	3	Bilibili Gaming	Top Esports	1	2	2	3	3	completed	61657b02-f571-4e7e-8fbc-a78c985eca4f	0a3216e1-4da8-4fdf-a6cc-a4d7bb3f44e3	\N	2025-10-12 13:39:50.86181	2025-10-12 10:29:08.640287	2025-10-12 13:39:50.86181
fe2c77c7-2166-4605-ba58-db101f7289b0	384a25f9-e533-470a-9bf7-6b758f688d0f	1	3	grand_final	5	22	23	Fnatic	MAD Lions	\N	\N	1	3	23	completed	\N	\N	\N	2025-10-12 13:39:55.388944	2025-10-12 10:29:52.670497	2025-10-12 13:39:55.388944
ac39d1c6-69ad-4d64-91a8-eb1a1cf96eec	db307da2-fb29-490b-af8b-352518c1763f	1	1	winners_bracket	5	32	33	Team Liquid	100 Thieves	1	2	3	1	32	completed	96bf064d-a2f1-4d58-9621-51d015e3fe07	2a42760b-8b10-491f-9a4c-657eb4e5f5e0	\N	2025-10-12 13:39:55.964451	2025-10-12 10:30:44.270101	2025-10-12 13:39:55.964451
61657b02-f571-4e7e-8fbc-a78c985eca4f	7b1eb62c-5e57-4492-b29e-20aae0c2b742	1	3	grand_final	5	3	1	Top Esports	JD Gaming	\N	\N	1	3	1	completed	\N	\N	\N	2025-10-12 13:39:51.737151	2025-10-12 10:29:08.640287	2025-10-12 13:39:51.737151
bb3de04d-e38c-4eed-a9d5-c683209349b2	ed34c66f-6c96-4924-a441-3ff6e4ca4eb1	1	1	winners_bracket	5	12	13	Gen.G	DRX	1	2	0	3	13	completed	685fa2c8-acd1-46dd-8f14-ad994b0151ba	b858d36a-a5cc-4180-9208-fe476f15458f	\N	2025-10-12 13:39:52.322942	2025-10-12 10:29:39.994458	2025-10-12 13:39:52.322942
e528703d-0a0a-424c-8818-7ab702678006	ed34c66f-6c96-4924-a441-3ff6e4ca4eb1	1	1	losers_bracket	5	14	11	KT Rolster	T1	3	4	1	3	11	completed	b858d36a-a5cc-4180-9208-fe476f15458f	\N	\N	2025-10-12 13:39:52.766265	2025-10-12 10:29:39.994458	2025-10-12 13:39:52.766265
ed00610e-63ce-4ba6-a561-b3bee2bc718a	db307da2-fb29-490b-af8b-352518c1763f	1	1	losers_bracket	5	34	31	TSM	Cloud9	3	4	1	3	31	completed	2a42760b-8b10-491f-9a4c-657eb4e5f5e0	\N	\N	2025-10-12 13:39:56.375358	2025-10-12 10:30:44.270101	2025-10-12 13:39:56.375358
b858d36a-a5cc-4180-9208-fe476f15458f	ed34c66f-6c96-4924-a441-3ff6e4ca4eb1	1	2	losers_bracket	5	12	11	Gen.G	T1	\N	\N	2	3	11	completed	685fa2c8-acd1-46dd-8f14-ad994b0151ba	\N	\N	2025-10-12 13:39:53.180704	2025-10-12 10:29:39.994458	2025-10-12 13:39:53.180704
685fa2c8-acd1-46dd-8f14-ad994b0151ba	ed34c66f-6c96-4924-a441-3ff6e4ca4eb1	1	3	grand_final	5	13	11	DRX	T1	\N	\N	3	0	13	completed	\N	\N	\N	2025-10-12 13:39:53.586747	2025-10-12 10:29:39.994458	2025-10-12 13:39:53.586747
900509d1-b932-4daa-b24e-0efcb0559dc9	384a25f9-e533-470a-9bf7-6b758f688d0f	1	1	losers_bracket	5	24	21	Team Vitality	G2 Esports	3	4	3	2	24	completed	b538c8f9-8c45-4cda-a835-20a67d9e87c5	\N	\N	2025-10-12 13:39:54.16924	2025-10-12 10:29:52.670497	2025-10-12 13:39:54.16924
2a42760b-8b10-491f-9a4c-657eb4e5f5e0	db307da2-fb29-490b-af8b-352518c1763f	1	2	losers_bracket	5	33	31	100 Thieves	Cloud9	\N	\N	3	0	33	completed	96bf064d-a2f1-4d58-9621-51d015e3fe07	\N	\N	2025-10-12 13:39:56.785608	2025-10-12 10:30:44.270101	2025-10-12 13:39:56.785608
\.


--
-- Data for Name: regional_standings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.regional_standings (id, team_id, region_id, season_id, competition_type, matches_played, wins, losses, win_rate, regular_season_points, round_differential, "position", last_updated, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: regions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.regions (id, name, code, description, display_order, is_active, created_at, updated_at) FROM stdin;
1	中国大陆职业联赛	LPL	中国大陆地区顶级电竞职业联赛	1	t	2025-10-11 18:41:03.400044	2025-10-11 18:41:03.400044
2	韩国冠军联赛	LCK	韩国地区顶级电竞职业联赛	2	t	2025-10-11 18:41:03.400044	2025-10-11 18:41:03.400044
3	欧洲冠军联赛	LEC	欧洲地区顶级电竞职业联赛	3	t	2025-10-11 18:41:03.400044	2025-10-11 18:41:03.400044
4	北美冠军联赛	LCS	北美地区顶级电竞职业联赛	4	t	2025-10-11 18:41:03.400044	2025-10-11 18:41:03.400044
\.


--
-- Data for Name: score_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.score_records (id, team_id, competition_id, match_id, points, point_type, season_year, earned_at, description, created_at) FROM stdin;
\.


--
-- Data for Name: seasons; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.seasons (id, name, year, status, current_phase, start_date, end_date, description, created_at, updated_at) FROM stdin;
1	S1	2024	active	spring_regular	2024-01-15	2024-11-15	\N	2025-10-11 18:41:03.407208	2025-10-11 18:41:03.407208
\.


--
-- Data for Name: team_statistics; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.team_statistics (id, team_id, season_year, total_points, spring_points, msi_points, summer_points, worlds_points, current_ranking, peak_ranking, matches_played, wins, losses, win_rate, last_updated) FROM stdin;
3	3	2024	0	0	0	0	0	21	21	1	0	1	0.00	2025-10-11 18:41:39.041737
4	4	2024	0	0	0	0	0	35	35	1	0	1	0.00	2025-10-11 18:41:39.041737
5	5	2024	0	0	0	0	0	36	36	0	0	0	0.00	2025-10-11 18:41:39.041737
6	6	2024	0	0	0	0	0	37	37	0	0	0	0.00	2025-10-11 18:41:39.041737
7	7	2024	0	0	0	0	0	38	38	0	0	0	0.00	2025-10-11 18:41:39.041737
8	8	2024	0	0	0	0	0	39	39	1	0	0	0.00	2025-10-11 18:41:39.041737
9	9	2024	0	0	0	0	0	40	40	1	0	1	0.00	2025-10-11 18:41:39.041737
10	10	2024	0	0	0	0	0	8	8	1	0	0	0.00	2025-10-11 18:41:39.041737
13	13	2024	0	0	0	0	0	9	9	0	0	0	0.00	2025-10-11 18:41:39.041737
16	16	2024	0	0	0	0	0	10	10	0	0	0	0.00	2025-10-11 18:41:39.041737
17	17	2024	0	0	0	0	0	11	11	0	0	0	0.00	2025-10-11 18:41:39.041737
18	18	2024	0	0	0	0	0	12	12	0	0	0	0.00	2025-10-11 18:41:39.041737
19	19	2024	0	0	0	0	0	13	13	0	0	0	0.00	2025-10-11 18:41:39.041737
21	21	2024	0	0	0	0	0	14	14	0	0	0	0.00	2025-10-11 18:41:39.041737
22	22	2024	0	0	0	0	0	15	15	0	0	0	0.00	2025-10-11 18:41:39.041737
23	23	2024	0	0	0	0	0	16	16	0	0	0	0.00	2025-10-11 18:41:39.041737
24	24	2024	0	0	0	0	0	17	17	0	0	0	0.00	2025-10-11 18:41:39.041737
25	25	2024	0	0	0	0	0	18	18	0	0	0	0.00	2025-10-11 18:41:39.041737
26	26	2024	0	0	0	0	0	19	19	0	0	0	0.00	2025-10-11 18:41:39.041737
27	27	2024	0	0	0	0	0	20	20	0	0	0	0.00	2025-10-11 18:41:39.041737
28	28	2024	0	0	0	0	0	34	34	0	0	0	0.00	2025-10-11 18:41:39.041737
29	29	2024	0	0	0	0	0	22	22	0	0	0	0.00	2025-10-11 18:41:39.041737
30	30	2024	0	0	0	0	0	23	23	0	0	0	0.00	2025-10-11 18:41:39.041737
31	31	2024	0	0	0	0	0	24	24	0	0	0	0.00	2025-10-11 18:41:39.041737
32	32	2024	0	0	0	0	0	25	25	0	0	0	0.00	2025-10-11 18:41:39.041737
33	33	2024	0	0	0	0	0	26	26	0	0	0	0.00	2025-10-11 18:41:39.041737
34	34	2024	0	0	0	0	0	27	27	0	0	0	0.00	2025-10-11 18:41:39.041737
35	35	2024	0	0	0	0	0	28	28	0	0	0	0.00	2025-10-11 18:41:39.041737
36	36	2024	0	0	0	0	0	29	29	0	0	0	0.00	2025-10-11 18:41:39.041737
37	37	2024	0	0	0	0	0	30	30	0	0	0	0.00	2025-10-11 18:41:39.041737
38	38	2024	0	0	0	0	0	31	31	0	0	0	0.00	2025-10-11 18:41:39.041737
39	39	2024	0	0	0	0	0	32	32	0	0	0	0.00	2025-10-11 18:41:39.041737
40	40	2024	0	0	0	0	0	33	33	0	0	0	0.00	2025-10-11 18:41:39.041737
1	1	2024	6	6	0	0	0	1	1	4	2	0	50.00	2025-10-11 18:41:39.041737
2	2	2024	1	1	0	0	0	4	4	1	1	0	100.00	2025-10-11 18:41:39.041737
11	11	2024	2	2	0	0	0	2	2	4	1	3	25.00	2025-10-11 18:41:39.041737
12	12	2024	1	1	0	0	0	7	7	2	0	1	0.00	2025-10-11 18:41:39.041737
14	14	2024	1	1	0	0	0	5	5	1	1	0	100.00	2025-10-11 18:41:39.041737
15	15	2024	1	1	0	0	0	6	6	2	1	0	50.00	2025-10-11 18:41:39.041737
20	20	2024	1	1	0	0	0	3	3	1	1	0	100.00	2025-10-11 18:41:39.041737
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teams (id, name, short_name, region_id, power_rating, founded_date, logo_url, is_active, total_matches, total_wins, total_losses, net_round_difference, created_at, updated_at) FROM stdin;
28	SK Gaming	SK	3	62	1997-10-01	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.941928
21	G2 Esports	G2	3	83	2013-02-24	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.941928
27	Excel Esports	XL	3	65	2014-08-01	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.944102
22	Fnatic	FNC	3	80	2011-07-23	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.944102
26	Team BDS	BDS	3	68	2021-01-15	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.946045
23	MAD Lions	MAD	3	77	2017-02-08	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.946045
35	FlyQuest	FLY	4	69	2017-11-27	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.912967
25	Rogue	RGE	3	71	2016-12-07	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.947882
24	Team Vitality	VIT	3	74	2013-09-12	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.947882
34	TSM	TSM	4	72	2009-09-21	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.912967
40	CLG	CLG	4	54	2010-04-18	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.920883
39	Immortals	IMT	4	57	2015-09-04	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.920883
38	Dignitas	DIG	4	60	2003-09-01	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.923762
31	Cloud9	C9	4	81	2013-04-20	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.923762
37	Shopify Rebellion	SR	4	63	2022-01-01	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.925762
32	Team Liquid	TL	4	78	2015-01-07	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.925762
36	NRG	NRG	4	66	2015-05-12	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.927666
33	100 Thieves	100T	4	75	2017-11-02	\N	t	192	96	96	0	2025-10-11 18:41:03.405476	2025-10-12 08:54:46.927666
20	OK Savings Bank BRION	BRO	2	63	2021-11-19	\N	t	193	96	96	1	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.929804
19	Nongshim RedForce	NS	2	66	2020-11-17	\N	t	193	97	96	2	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.929804
18	Kwangdong Freecs	KDF	2	69	2016-11-30	\N	t	194	98	96	4	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.931847
10	Ninjas in Pyjamas	NIP	1	65	2021-11-26	\N	t	194	97	96	2	2025-10-11 18:41:03.402322	2025-10-13 03:17:42.531254
11	T1	T1	2	90	2013-02-21	\N	t	201	96	101	-12	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.931847
1	JD Gaming	JDG	1	88	2017-05-20	\N	t	202	96	102	-8	2025-10-11 18:41:03.402322	2025-10-13 03:17:42.531254
12	Gen.G	GEN	2	87	2017-01-11	\N	t	199	96	101	-11	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.933692
17	Liiv SANDBOX	LSB	2	72	2018-11-13	\N	t	194	98	96	4	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.933692
9	LNG Esports	LNG	1	68	2019-01-01	\N	t	194	97	96	0	2025-10-11 18:41:03.402322	2025-10-13 03:17:55.110236
13	DRX	DRX	2	84	2019-11-18	\N	t	194	98	96	4	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.935809
16	DWG KIA	DK	2	75	2017-02-14	\N	t	194	98	96	4	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.935809
14	KT Rolster	KT	2	81	2012-06-08	\N	t	194	97	96	3	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.938213
15	Hanwha Life Esports	HLE	2	78	2016-12-01	\N	t	194	96	96	1	2025-10-11 18:41:03.404388	2025-10-12 08:54:46.938213
30	GIANTX	GX	3	56	2022-12-01	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.940109
29	Team Heretics	TH	3	59	2016-06-15	\N	t	192	96	96	0	2025-10-11 18:41:03.404702	2025-10-12 08:54:46.940109
2	Bilibili Gaming	BLG	1	85	2017-12-21	\N	t	200	97	102	-9	2025-10-11 18:41:03.402322	2025-10-13 03:17:55.110236
8	Royal Never Give Up	RNG	1	70	2012-05-15	\N	t	195	98	96	4	2025-10-11 18:41:03.402322	2025-10-13 03:21:30.242625
3	Top Esports	TES	1	82	2019-11-26	\N	t	195	97	97	-2	2025-10-11 18:41:03.402322	2025-10-13 03:21:30.242625
7	EDward Gaming	EDG	1	72	2013-09-13	\N	t	195	99	96	6	2025-10-11 18:41:03.402322	2025-10-13 03:22:18.105852
4	Weibo Gaming	WBG	1	79	2020-11-26	\N	t	195	97	97	-1	2025-10-11 18:41:03.402322	2025-10-13 03:22:18.105852
6	FunPlus Phoenix	FPX	1	74	2017-12-21	\N	t	195	99	96	6	2025-10-11 18:41:03.402322	2025-10-13 03:22:20.190623
5	Invictus Gaming	IG	1	76	2011-08-02	\N	t	195	98	97	2	2025-10-11 18:41:03.402322	2025-10-13 03:22:20.190623
\.


--
-- Name: annual_rankings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.annual_rankings_id_seq', 40, true);


--
-- Name: competition_teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.competition_teams_id_seq', 80, true);


--
-- Name: competitions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.competitions_id_seq', 7, true);


--
-- Name: head_to_head_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.head_to_head_records_id_seq', 3875, true);


--
-- Name: honor_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.honor_records_id_seq', 1, false);


--
-- Name: matches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.matches_id_seq', 7350, true);


--
-- Name: msi_brackets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.msi_brackets_id_seq', 1, true);


--
-- Name: msi_matches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.msi_matches_id_seq', 16, true);


--
-- Name: regional_standings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.regional_standings_id_seq', 40, true);


--
-- Name: regions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.regions_id_seq', 4, true);


--
-- Name: score_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.score_records_id_seq', 14, true);


--
-- Name: seasons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.seasons_id_seq', 1, true);


--
-- Name: team_statistics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.team_statistics_id_seq', 40, true);


--
-- Name: teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.teams_id_seq', 40, true);


--
-- Name: annual_rankings annual_rankings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.annual_rankings
    ADD CONSTRAINT annual_rankings_pkey PRIMARY KEY (id);


--
-- Name: annual_rankings annual_rankings_team_id_season_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.annual_rankings
    ADD CONSTRAINT annual_rankings_team_id_season_id_key UNIQUE (team_id, season_id);


--
-- Name: competition_teams competition_teams_competition_id_team_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_teams
    ADD CONSTRAINT competition_teams_competition_id_team_id_key UNIQUE (competition_id, team_id);


--
-- Name: competition_teams competition_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_teams
    ADD CONSTRAINT competition_teams_pkey PRIMARY KEY (id);


--
-- Name: competitions competitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_pkey PRIMARY KEY (id);


--
-- Name: competitions competitions_season_id_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_season_id_type_key UNIQUE (season_id, type);


--
-- Name: head_to_head_records head_to_head_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.head_to_head_records
    ADD CONSTRAINT head_to_head_records_pkey PRIMARY KEY (id);


--
-- Name: head_to_head_records head_to_head_records_team_a_id_team_b_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.head_to_head_records
    ADD CONSTRAINT head_to_head_records_team_a_id_team_b_id_key UNIQUE (team_a_id, team_b_id);


--
-- Name: honor_records honor_records_competition_id_team_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.honor_records
    ADD CONSTRAINT honor_records_competition_id_team_id_key UNIQUE (competition_id, team_id);


--
-- Name: honor_records honor_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.honor_records
    ADD CONSTRAINT honor_records_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: msi_brackets msi_brackets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_brackets
    ADD CONSTRAINT msi_brackets_pkey PRIMARY KEY (id);


--
-- Name: msi_matches msi_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches
    ADD CONSTRAINT msi_matches_pkey PRIMARY KEY (id);


--
-- Name: playoff_brackets playoff_brackets_competition_id_region_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_brackets
    ADD CONSTRAINT playoff_brackets_competition_id_region_id_key UNIQUE (competition_id, region_id);


--
-- Name: playoff_brackets playoff_brackets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_brackets
    ADD CONSTRAINT playoff_brackets_pkey PRIMARY KEY (id);


--
-- Name: playoff_matches playoff_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_matches
    ADD CONSTRAINT playoff_matches_pkey PRIMARY KEY (id);


--
-- Name: regional_standings regional_standings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regional_standings
    ADD CONSTRAINT regional_standings_pkey PRIMARY KEY (id);


--
-- Name: regional_standings regional_standings_team_id_region_id_season_id_competition__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regional_standings
    ADD CONSTRAINT regional_standings_team_id_region_id_season_id_competition__key UNIQUE (team_id, region_id, season_id, competition_type);


--
-- Name: regions regions_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_code_key UNIQUE (code);


--
-- Name: regions regions_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_name_key UNIQUE (name);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: score_records score_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.score_records
    ADD CONSTRAINT score_records_pkey PRIMARY KEY (id);


--
-- Name: seasons seasons_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_name_key UNIQUE (name);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: team_statistics team_statistics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_statistics
    ADD CONSTRAINT team_statistics_pkey PRIMARY KEY (id);


--
-- Name: team_statistics team_statistics_team_id_season_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_statistics
    ADD CONSTRAINT team_statistics_team_id_season_year_key UNIQUE (team_id, season_year);


--
-- Name: teams teams_name_region_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_name_region_id_key UNIQUE (name, region_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: teams teams_short_name_region_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_short_name_region_id_key UNIQUE (short_name, region_id);


--
-- Name: idx_annual_rankings_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_annual_rankings_position ON public.annual_rankings USING btree ("position");


--
-- Name: idx_annual_rankings_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_annual_rankings_season ON public.annual_rankings USING btree (season_id);


--
-- Name: idx_annual_rankings_season_points; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_annual_rankings_season_points ON public.annual_rankings USING btree (season_id, total_points DESC);


--
-- Name: idx_annual_rankings_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_annual_rankings_team ON public.annual_rankings USING btree (team_id);


--
-- Name: idx_annual_rankings_total_points; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_annual_rankings_total_points ON public.annual_rankings USING btree (total_points DESC);


--
-- Name: idx_competitions_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_competitions_season ON public.competitions USING btree (season_id);


--
-- Name: idx_competitions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_competitions_status ON public.competitions USING btree (status);


--
-- Name: idx_competitions_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_competitions_type ON public.competitions USING btree (type);


--
-- Name: idx_honor_records_competition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_honor_records_competition ON public.honor_records USING btree (competition_id);


--
-- Name: idx_honor_records_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_honor_records_position ON public.honor_records USING btree ("position");


--
-- Name: idx_honor_records_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_honor_records_season ON public.honor_records USING btree (season_id);


--
-- Name: idx_honor_records_season_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_honor_records_season_position ON public.honor_records USING btree (season_id, "position");


--
-- Name: idx_honor_records_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_honor_records_team ON public.honor_records USING btree (team_id);


--
-- Name: idx_matches_competition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_matches_competition ON public.matches USING btree (competition_id);


--
-- Name: idx_matches_competition_phase; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_matches_competition_phase ON public.matches USING btree (competition_id, phase);


--
-- Name: idx_matches_completed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_matches_completed ON public.matches USING btree (completed_at);


--
-- Name: idx_matches_scheduled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_matches_scheduled ON public.matches USING btree (scheduled_at);


--
-- Name: idx_matches_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_matches_status ON public.matches USING btree (status);


--
-- Name: idx_matches_teams; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_matches_teams ON public.matches USING btree (team_a_id, team_b_id);


--
-- Name: idx_matches_winner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_matches_winner ON public.matches USING btree (winner_id);


--
-- Name: idx_msi_brackets_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_msi_brackets_season ON public.msi_brackets USING btree (season_id);


--
-- Name: idx_msi_brackets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_msi_brackets_status ON public.msi_brackets USING btree (status);


--
-- Name: idx_msi_matches_bracket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_msi_matches_bracket ON public.msi_matches USING btree (msi_bracket_id);


--
-- Name: idx_msi_matches_round; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_msi_matches_round ON public.msi_matches USING btree (msi_bracket_id, round_number);


--
-- Name: idx_msi_matches_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_msi_matches_status ON public.msi_matches USING btree (status);


--
-- Name: idx_playoff_brackets_competition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playoff_brackets_competition ON public.playoff_brackets USING btree (competition_id);


--
-- Name: idx_playoff_brackets_region; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playoff_brackets_region ON public.playoff_brackets USING btree (region_id);


--
-- Name: idx_playoff_brackets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playoff_brackets_status ON public.playoff_brackets USING btree (status);


--
-- Name: idx_playoff_matches_bracket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playoff_matches_bracket ON public.playoff_matches USING btree (playoff_bracket_id);


--
-- Name: idx_playoff_matches_competition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playoff_matches_competition ON public.playoff_matches USING btree (competition_id);


--
-- Name: idx_playoff_matches_round; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playoff_matches_round ON public.playoff_matches USING btree (round_number);


--
-- Name: idx_playoff_matches_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_playoff_matches_status ON public.playoff_matches USING btree (status);


--
-- Name: idx_regional_standings_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_regional_standings_position ON public.regional_standings USING btree ("position");


--
-- Name: idx_regional_standings_region_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_regional_standings_region_season ON public.regional_standings USING btree (region_id, season_id, competition_type);


--
-- Name: idx_regional_standings_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_regional_standings_team ON public.regional_standings USING btree (team_id);


--
-- Name: idx_score_records_competition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_score_records_competition ON public.score_records USING btree (competition_id);


--
-- Name: idx_score_records_points; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_score_records_points ON public.score_records USING btree (points DESC);


--
-- Name: idx_score_records_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_score_records_season ON public.score_records USING btree (season_year);


--
-- Name: idx_score_records_season_points; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_score_records_season_points ON public.score_records USING btree (season_year, points DESC);


--
-- Name: idx_score_records_team; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_score_records_team ON public.score_records USING btree (team_id);


--
-- Name: idx_score_records_team_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_score_records_team_season ON public.score_records USING btree (team_id, season_year);


--
-- Name: idx_team_statistics_points; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_statistics_points ON public.team_statistics USING btree (total_points DESC);


--
-- Name: idx_team_statistics_ranking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_statistics_ranking ON public.team_statistics USING btree (current_ranking);


--
-- Name: idx_team_statistics_season; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_team_statistics_season ON public.team_statistics USING btree (season_year);


--
-- Name: idx_teams_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_active ON public.teams USING btree (is_active);


--
-- Name: idx_teams_power_rating; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_power_rating ON public.teams USING btree (power_rating DESC);


--
-- Name: idx_teams_region; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teams_region ON public.teams USING btree (region_id);


--
-- Name: msi_brackets trigger_msi_brackets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_msi_brackets_updated_at BEFORE UPDATE ON public.msi_brackets FOR EACH ROW EXECUTE FUNCTION public.update_msi_updated_at();


--
-- Name: msi_matches trigger_msi_matches_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_msi_matches_updated_at BEFORE UPDATE ON public.msi_matches FOR EACH ROW EXECUTE FUNCTION public.update_msi_updated_at();


--
-- Name: matches trigger_process_match_result; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_process_match_result AFTER UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.process_match_result();


--
-- Name: annual_rankings trigger_update_annual_rankings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_annual_rankings_updated_at BEFORE UPDATE ON public.annual_rankings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: competitions trigger_update_competitions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_competitions_updated_at BEFORE UPDATE ON public.competitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: honor_records trigger_update_honor_records_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_honor_records_updated_at BEFORE UPDATE ON public.honor_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: matches trigger_update_matches_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_matches_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: regional_standings trigger_update_regional_standings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_regional_standings_updated_at BEFORE UPDATE ON public.regional_standings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: regions trigger_update_regions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_regions_updated_at BEFORE UPDATE ON public.regions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: seasons trigger_update_seasons_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_seasons_updated_at BEFORE UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: teams trigger_update_teams_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: playoff_brackets update_playoff_brackets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_playoff_brackets_updated_at BEFORE UPDATE ON public.playoff_brackets FOR EACH ROW EXECUTE FUNCTION public.update_playoff_updated_at();


--
-- Name: playoff_matches update_playoff_matches_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_playoff_matches_updated_at BEFORE UPDATE ON public.playoff_matches FOR EACH ROW EXECUTE FUNCTION public.update_playoff_updated_at();


--
-- Name: annual_rankings annual_rankings_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.annual_rankings
    ADD CONSTRAINT annual_rankings_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: annual_rankings annual_rankings_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.annual_rankings
    ADD CONSTRAINT annual_rankings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: competition_teams competition_teams_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_teams
    ADD CONSTRAINT competition_teams_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: competition_teams competition_teams_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competition_teams
    ADD CONSTRAINT competition_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: competitions competitions_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: head_to_head_records head_to_head_records_last_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.head_to_head_records
    ADD CONSTRAINT head_to_head_records_last_match_id_fkey FOREIGN KEY (last_match_id) REFERENCES public.matches(id);


--
-- Name: head_to_head_records head_to_head_records_team_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.head_to_head_records
    ADD CONSTRAINT head_to_head_records_team_a_id_fkey FOREIGN KEY (team_a_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: head_to_head_records head_to_head_records_team_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.head_to_head_records
    ADD CONSTRAINT head_to_head_records_team_b_id_fkey FOREIGN KEY (team_b_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: honor_records honor_records_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.honor_records
    ADD CONSTRAINT honor_records_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: honor_records honor_records_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.honor_records
    ADD CONSTRAINT honor_records_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: honor_records honor_records_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.honor_records
    ADD CONSTRAINT honor_records_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: matches matches_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: matches matches_team_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team_a_id_fkey FOREIGN KEY (team_a_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: matches matches_team_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team_b_id_fkey FOREIGN KEY (team_b_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: matches matches_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.teams(id);


--
-- Name: msi_brackets msi_brackets_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_brackets
    ADD CONSTRAINT msi_brackets_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: msi_matches msi_matches_loser_next_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches
    ADD CONSTRAINT msi_matches_loser_next_match_id_fkey FOREIGN KEY (loser_next_match_id) REFERENCES public.msi_matches(id);


--
-- Name: msi_matches msi_matches_msi_bracket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches
    ADD CONSTRAINT msi_matches_msi_bracket_id_fkey FOREIGN KEY (msi_bracket_id) REFERENCES public.msi_brackets(id) ON DELETE CASCADE;


--
-- Name: msi_matches msi_matches_next_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches
    ADD CONSTRAINT msi_matches_next_match_id_fkey FOREIGN KEY (next_match_id) REFERENCES public.msi_matches(id);


--
-- Name: msi_matches msi_matches_team_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches
    ADD CONSTRAINT msi_matches_team_a_id_fkey FOREIGN KEY (team_a_id) REFERENCES public.teams(id);


--
-- Name: msi_matches msi_matches_team_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches
    ADD CONSTRAINT msi_matches_team_b_id_fkey FOREIGN KEY (team_b_id) REFERENCES public.teams(id);


--
-- Name: msi_matches msi_matches_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.msi_matches
    ADD CONSTRAINT msi_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.teams(id);


--
-- Name: playoff_brackets playoff_brackets_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_brackets
    ADD CONSTRAINT playoff_brackets_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: playoff_brackets playoff_brackets_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_brackets
    ADD CONSTRAINT playoff_brackets_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE;


--
-- Name: playoff_matches playoff_matches_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_matches
    ADD CONSTRAINT playoff_matches_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: playoff_matches playoff_matches_playoff_bracket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_matches
    ADD CONSTRAINT playoff_matches_playoff_bracket_id_fkey FOREIGN KEY (playoff_bracket_id) REFERENCES public.playoff_brackets(id) ON DELETE CASCADE;


--
-- Name: playoff_matches playoff_matches_team_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_matches
    ADD CONSTRAINT playoff_matches_team_a_id_fkey FOREIGN KEY (team_a_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: playoff_matches playoff_matches_team_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_matches
    ADD CONSTRAINT playoff_matches_team_b_id_fkey FOREIGN KEY (team_b_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: playoff_matches playoff_matches_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.playoff_matches
    ADD CONSTRAINT playoff_matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: regional_standings regional_standings_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regional_standings
    ADD CONSTRAINT regional_standings_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE;


--
-- Name: regional_standings regional_standings_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regional_standings
    ADD CONSTRAINT regional_standings_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: regional_standings regional_standings_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regional_standings
    ADD CONSTRAINT regional_standings_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: score_records score_records_competition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.score_records
    ADD CONSTRAINT score_records_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: score_records score_records_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.score_records
    ADD CONSTRAINT score_records_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: score_records score_records_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.score_records
    ADD CONSTRAINT score_records_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_statistics team_statistics_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_statistics
    ADD CONSTRAINT team_statistics_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: teams teams_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

