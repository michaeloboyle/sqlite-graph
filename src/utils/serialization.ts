import { NodeData } from '../types';

/**
 * Serialize JavaScript object to JSON string for SQLite storage
 */
export function serialize(data: NodeData): string {
  return JSON.stringify(data);
}

/**
 * Deserialize JSON string from SQLite to JavaScript object
 */
export function deserialize<T extends NodeData = NodeData>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`Failed to deserialize JSON: ${error}`);
  }
}

/**
 * Convert SQLite timestamp (seconds since epoch) to Date
 */
export function timestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Convert Date to SQLite timestamp (seconds since epoch)
 */
export function dateToTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}