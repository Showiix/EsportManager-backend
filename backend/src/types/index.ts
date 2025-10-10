// =================================================================
// 电竞赛事模拟系统 - 类型定义
// =================================================================

// 基础类型定义
export type UUID = string;
export type Timestamp = Date;

// =================================================================
// 数据库实体类型
// =================================================================

// 赛区实体
export interface Region {
  id: UUID;
  name: string;
  code: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 战队实体
export interface Team {
  id: UUID;
  name: string;
  shortName: string;
  regionId: UUID;
  powerRating: number;
  foundedDate?: Date;
  logoUrl?: string;
  isActive: boolean;
  // 统计字段
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  netRoundDifference: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // 关联数据
  region?: Region;
}

// 赛季实体
export interface Season {
  id: UUID;
  name: string;
  year: number;
  status: SeasonStatus;
  currentPhase?: string;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 赛事实体
export interface Competition {
  id: UUID;
  seasonId: UUID;
  type: CompetitionType;
  name: string;
  format: CompetitionFormat;
  scoringRules: ScoringRules;
  status: CompetitionStatus;
  maxTeams: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // 关联数据
  season?: Season;
  teams?: Team[];
}

// 比赛实体
export interface Match {
  id: UUID;
  competitionId: UUID;
  teamAId: UUID;
  teamBId: UUID;
  scoreA: number;
  scoreB: number;
  winnerId?: UUID;
  format: MatchFormat;
  phase: string;
  roundNumber?: number;
  matchNumber?: number;
  status: MatchStatus;
  scheduledAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // 关联数据
  competition?: Competition;
  teamA?: Team;
  teamB?: Team;
  winner?: Team;
}

// 积分记录实体
export interface ScoreRecord {
  id: UUID;
  teamId: UUID;
  competitionId: UUID;
  matchId?: UUID;
  points: number;
  pointType: string;
  seasonYear: number;
  earnedAt: Timestamp;
  description?: string;
  createdAt: Timestamp;
  // 关联数据
  team?: Team;
  competition?: Competition;
  match?: Match;
}

// 战队统计实体
export interface TeamStatistics {
  id: UUID;
  teamId: UUID;
  seasonYear: number;
  totalPoints: number;
  springPoints: number;
  msiPoints: number;
  summerPoints: number;
  worldsPoints: number;
  currentRanking?: number;
  peakRanking?: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  lastUpdated: Timestamp;
  // 关联数据
  team?: Team;
}

// 战队交锋记录实体
export interface HeadToHeadRecord {
  id: UUID;
  teamAId: UUID;
  teamBId: UUID;
  totalMatches: number;
  teamAWins: number;
  teamBWins: number;
  lastMatchDate?: Date;
  lastMatchId?: UUID;
  // 关联数据
  teamA?: Team;
  teamB?: Team;
  lastMatch?: Match;
}

// =================================================================
// 枚举类型定义
// =================================================================

export enum SeasonStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  COMPLETED = 'completed'
}

export enum CompetitionType {
  SPRING = 'spring',
  SUMMER = 'summer',
  MSI = 'msi',
  WORLDS = 'worlds'
}

export enum CompetitionStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  COMPLETED = 'completed'
}

export enum MatchFormat {
  BO1 = 'BO1',
  BO3 = 'BO3',
  BO5 = 'BO5'
}

export enum MatchStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// =================================================================
// 复杂类型定义
// =================================================================

// 赛制配置
export interface CompetitionFormat {
  type: string;
  regularSeason?: {
    format: string;
    matchFormat: MatchFormat;
  };
  playoffs?: {
    format: string;
    matchFormat: MatchFormat;
  };
  groupStage?: {
    format: string;
    matchFormat: MatchFormat;
  };
  knockout?: {
    format: string;
    matchFormat: MatchFormat;
  };
}

// 积分规则
export interface ScoringRules {
  regular?: {
    [key: string]: number;
  };
  playoffs?: {
    [key: string]: number;
  };
  groupStage?: {
    [key: string]: number;
  };
  knockout?: {
    [key: string]: number;
  };
}

// =================================================================
// DTO类型定义
// =================================================================

// 创建战队DTO
export interface CreateTeamDto {
  name: string;
  shortName: string;
  regionId: UUID;
  powerRating: number;
  foundedDate?: Date;
  logoUrl?: string;
}

// 更新战队DTO
export interface UpdateTeamDto {
  name?: string;
  shortName?: string;
  regionId?: UUID;
  powerRating?: number;
  foundedDate?: Date;
  logoUrl?: string;
  isActive?: boolean;
}

// 创建赛事DTO
export interface CreateCompetitionDto {
  seasonId: UUID;
  type: CompetitionType;
  name: string;
  format: CompetitionFormat;
  scoringRules: ScoringRules;
  maxTeams?: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
}

// 更新比赛结果DTO
export interface UpdateMatchResultDto {
  scoreA: number;
  scoreB: number;
  winnerId?: UUID;
  completedAt?: Timestamp;
  notes?: string;
}

// =================================================================
// 业务逻辑类型
// =================================================================

// 排名数据
export interface Ranking {
  teamId: UUID;
  teamName: string;
  shortName: string;
  regionName: string;
  regionCode: string;
  seasonYear: number;
  totalPoints: number;
  springPoints: number;
  msiPoints: number;
  summerPoints: number;
  worldsPoints: number;
  ranking: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
}

// 历史交锋统计
export interface HeadToHeadStats {
  totalMatches: number;
  teamAWins: number;
  teamBWins: number;
  recentMatches: Match[];
  competitionBreakdown: { [competitionType: string]: number };
  winRateTrend: number[];
}

// 赛区分析数据
export interface RegionAnalysis {
  id: UUID;
  name: string;
  teamCount: number;
  avgPowerRating: number;
  totalWins: number;
  totalMatches: number;
  avgWinRate: number;
}

// 积分趋势数据
export interface PointsTrend {
  teamId: UUID;
  seasonYear: number;
  totalPoints: number;
  trendData: PointsTrendData[];
  milestones: Milestone[];
}

export interface PointsTrendData {
  date: Date;
  points: number;
  cumulativePoints: number;
  competitionType: string;
  competitionName: string;
}

export interface Milestone {
  date: Date;
  points: number;
  description: string;
}

// 比赛预测数据
export interface MatchPrediction {
  teamAWinProbability: number;
  teamBWinProbability: number;
  confidence: number;
  factors: {
    powerRating: number;
    recentForm: number;
    headToHead: number;
  };
}

// =================================================================
// API响应类型
// =================================================================

// 统一API响应格式
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    timestamp: string;
    requestId: string;
  };
}

// 分页参数
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: Record<string, any>;
}

// =================================================================
// 错误类型定义
// =================================================================

export enum ErrorCodes {
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  COMPETITION_NOT_ACTIVE = 'COMPETITION_NOT_ACTIVE',
  INVALID_MATCH_RESULT = 'INVALID_MATCH_RESULT',
  DRAW_ALREADY_COMPLETED = 'DRAW_ALREADY_COMPLETED',
  INSUFFICIENT_TEAMS = 'INSUFFICIENT_TEAMS',
  INVALID_SCORING_RULES = 'INVALID_SCORING_RULES',
  SEASON_NOT_ACTIVE = 'SEASON_NOT_ACTIVE',
  MATCH_ALREADY_COMPLETED = 'MATCH_ALREADY_COMPLETED',
  INVALID_COMPETITION_FORMAT = 'INVALID_COMPETITION_FORMAT'
}

// 自定义错误类
export class BusinessError extends Error {
  constructor(
    public code: ErrorCodes,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

// =================================================================
// 服务接口类型
// =================================================================

// 数据库查询选项
export interface QueryOptions {
  include?: string[];
  pagination?: PaginationParams;
  filter?: Record<string, any>;
}

// 缓存选项
export interface CacheOptions {
  ttl?: number;
  key?: string;
  invalidatePattern?: string;
}