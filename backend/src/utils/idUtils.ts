// =================================================================
// 电竞赛事模拟系统 - ID类型转换工具
// =================================================================

/**
 * ID类型 - 支持字符串、数字或BigInt
 * PostgreSQL的INTEGER类型在pg库中可能返回Number或BigInt
 */
export type ID = string | number | bigint;

/**
 * 将任意ID类型转换为字符串
 * 用于统一数据库ID与应用层ID的比较
 *
 * @param id - ID值(string | number | bigint)
 * @returns 字符串形式的ID
 *
 * @example
 * ```typescript
 * toIdString('123')     // => '123'
 * toIdString(123)       // => '123'
 * toIdString(123n)      // => '123'
 * toIdString(null)      // => ''
 * toIdString(undefined) // => ''
 * ```
 */
export function toIdString(id: ID | null | undefined): string {
  if (id === null || id === undefined) {
    return '';
  }
  return id.toString();
}

/**
 * 将任意ID类型转换为数字
 *
 * @param id - ID值(string | number | bigint)
 * @returns 数字形式的ID,转换失败返回NaN
 *
 * @example
 * ```typescript
 * toIdNumber('123')  // => 123
 * toIdNumber(123)    // => 123
 * toIdNumber(123n)   // => 123
 * toIdNumber('abc')  // => NaN
 * ```
 */
export function toIdNumber(id: ID): number {
  if (typeof id === 'number') {
    return id;
  }
  if (typeof id === 'bigint') {
    return Number(id);
  }
  return parseInt(id, 10);
}

/**
 * 比较两个ID是否相等
 * 统一转换为字符串后进行比较,避免类型不一致导致的问题
 *
 * @param id1 - 第一个ID
 * @param id2 - 第二个ID
 * @returns 两个ID是否相等
 *
 * @example
 * ```typescript
 * areIdsEqual('123', 123)   // => true
 * areIdsEqual(123, 123n)    // => true
 * areIdsEqual('123', '123') // => true
 * areIdsEqual('123', '456') // => false
 * ```
 */
export function areIdsEqual(id1: ID | null | undefined, id2: ID | null | undefined): boolean {
  if (id1 === null || id1 === undefined || id2 === null || id2 === undefined) {
    return false;
  }
  return toIdString(id1) === toIdString(id2);
}

/**
 * 从数组中根据ID查找元素
 * 使用统一的ID比较方式
 *
 * @param array - 要搜索的数组
 * @param id - 要查找的ID
 * @param idField - ID字段名称,默认为'id'
 * @returns 找到的元素,未找到返回undefined
 *
 * @example
 * ```typescript
 * const teams = [{ id: 1, name: 'Team A' }, { id: 2, name: 'Team B' }];
 * findById(teams, '1')  // => { id: 1, name: 'Team A' }
 * findById(teams, 3)    // => undefined
 *
 * const players = [{ playerId: '101', name: 'Player 1' }];
 * findById(players, 101, 'playerId')  // => { playerId: '101', name: 'Player 1' }
 * ```
 */
export function findById<T extends Record<string, any>>(
  array: T[],
  id: ID,
  idField: string = 'id'
): T | undefined {
  return array.find(item => areIdsEqual(item[idField], id));
}

/**
 * 验证ID是否有效(非空且可转换为数字)
 *
 * @param id - 要验证的ID
 * @returns ID是否有效
 *
 * @example
 * ```typescript
 * isValidId('123')    // => true
 * isValidId(123)      // => true
 * isValidId(0)        // => true
 * isValidId('')       // => false
 * isValidId(null)     // => false
 * isValidId('abc')    // => false
 * ```
 */
export function isValidId(id: ID | null | undefined): boolean {
  if (id === null || id === undefined || id === '') {
    return false;
  }
  if (typeof id === 'number' || typeof id === 'bigint') {
    return !isNaN(Number(id));
  }
  const num = toIdNumber(id);
  return !isNaN(num);
}

/**
 * 批量转换ID数组为字符串数组
 *
 * @param ids - ID数组
 * @returns 字符串ID数组
 *
 * @example
 * ```typescript
 * toIdStringArray([1, '2', 3n])  // => ['1', '2', '3']
 * toIdStringArray([null, 1, 2])  // => ['', '1', '2']
 * ```
 */
export function toIdStringArray(ids: (ID | null | undefined)[]): string[] {
  return ids.map(id => toIdString(id));
}
