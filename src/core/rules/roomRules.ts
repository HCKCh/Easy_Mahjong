export type RonMode = 'single' | 'multiple';
export type MissedWinPolicy = 'none' | 'until_next_draw';

export interface RoomRules {
  ronMode: RonMode;
  missedWinPolicy: MissedWinPolicy;
  minTai: number;
}

export const defaultRoomRules: RoomRules = {
  ronMode: 'single',
  missedWinPolicy: 'until_next_draw',
  minTai: 1,
};

export function mergeRoomRules(overrides: Partial<RoomRules> = {}): RoomRules {
  return {...defaultRoomRules, ...overrides};
}
