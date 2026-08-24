import * as migration_20260824_083431_initial from './20260824_083431_initial';
import * as migration_20260824_085755_persona_voice from './20260824_085755_persona_voice';
import * as migration_20260824_092230_voice_catalog from './20260824_092230_voice_catalog';

export const migrations = [
  {
    up: migration_20260824_083431_initial.up,
    down: migration_20260824_083431_initial.down,
    name: '20260824_083431_initial',
  },
  {
    up: migration_20260824_085755_persona_voice.up,
    down: migration_20260824_085755_persona_voice.down,
    name: '20260824_085755_persona_voice',
  },
  {
    up: migration_20260824_092230_voice_catalog.up,
    down: migration_20260824_092230_voice_catalog.down,
    name: '20260824_092230_voice_catalog'
  },
];
