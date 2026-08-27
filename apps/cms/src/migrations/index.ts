import * as migration_20260824_083431_initial from './20260824_083431_initial';
import * as migration_20260824_085755_persona_voice from './20260824_085755_persona_voice';
import * as migration_20260824_092230_voice_catalog from './20260824_092230_voice_catalog';
import * as migration_20260824_101152_cabin_controls_trim from './20260824_101152_cabin_controls_trim';
import * as migration_20260826_065908_llm_generation from './20260826_065908_llm_generation';
import * as migration_20260827_104113_persona_traits from './20260827_104113_persona_traits';

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
    name: '20260824_092230_voice_catalog',
  },
  {
    up: migration_20260824_101152_cabin_controls_trim.up,
    down: migration_20260824_101152_cabin_controls_trim.down,
    name: '20260824_101152_cabin_controls_trim',
  },
  {
    up: migration_20260826_065908_llm_generation.up,
    down: migration_20260826_065908_llm_generation.down,
    name: '20260826_065908_llm_generation',
  },
  {
    up: migration_20260827_104113_persona_traits.up,
    down: migration_20260827_104113_persona_traits.down,
    name: '20260827_104113_persona_traits'
  },
];
