export const defaultRoomRules = {
    ronMode: 'single',
    missedWinPolicy: 'until_next_draw',
    minTai: 1,
};
export function mergeRoomRules(overrides = {}) {
    return { ...defaultRoomRules, ...overrides };
}
//# sourceMappingURL=roomRules.js.map