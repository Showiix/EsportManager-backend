// =================================================================
// 电竞赛事模拟系统 - 响应格式化工具
// =================================================================

import { ApiResponse } from '@/types';

/**
 * 格式化成功响应
 * @param data 响应数据
 * @param message 成功消息（可选）
 * @returns 格式化的成功响应
 */
export function formatSuccessResponse<T>(
  data: T,
  message?: string
): Omit<ApiResponse<T>, 'meta'> {
  return {
    success: true,
    data,
    ...(message && {
      error: undefined,
    }),
  };
}

/**
 * 格式化分页响应
 * @param data 响应数据数组
 * @param total 总记录数
 * @param page 当前页码
 * @param limit 每页记录数
 * @returns 格式化的分页响应
 */
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * 格式化错误响应
 * @param message 错误消息
 * @param errors 详细错误信息（可选）
 * @returns 格式化的错误响应
 */
export function formatErrorResponse(
  message: string,
  errors?: string[]
): {
  success: false;
  data: null;
  message: string;
  errors?: string[];
} {
  return {
    success: false,
    data: null,
    message,
    ...(errors && { errors }),
  };
}

/**
 * 格式化前端所需的简单成功响应
 * @param data 响应数据
 * @param message 成功消息
 * @returns 简化的成功响应格式
 */
export function formatSimpleSuccess<T>(data: T, message = '操作成功') {
  return {
    success: true,
    data,
    message,
  };
}

/**
 * 格式化前端所需的简单错误响应
 * @param message 错误消息
 * @param errors 错误详情数组
 * @returns 简化的错误响应格式
 */
export function formatSimpleError(message: string, errors?: string[]) {
  return {
    success: false,
    data: null,
    message,
    ...(errors && { errors }),
  };
}
