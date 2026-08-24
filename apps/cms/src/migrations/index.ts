import * as migration_20260824_083431_initial from './20260824_083431_initial';

export const migrations = [
  {
    up: migration_20260824_083431_initial.up,
    down: migration_20260824_083431_initial.down,
    name: '20260824_083431_initial'
  },
];
