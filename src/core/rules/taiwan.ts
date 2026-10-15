export const taiwanRules = {
  players: 4,
  tiles: 144,
  handSize: 16,
  winningTileCount: 17,
  flowerCount: 8,
  deadWallSize: 16,
  allowMultipleRon: false,
  minTai: 1,
  chowOnlyFromPreviousPlayer: true,
  reactionPriority: ['win','kong','pong','chow','pass'] as const,
} as const;
