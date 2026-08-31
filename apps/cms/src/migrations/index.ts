import * as migration_20260824_083431_initial from './20260824_083431_initial';
import * as migration_20260824_085755_persona_voice from './20260824_085755_persona_voice';
import * as migration_20260824_092230_voice_catalog from './20260824_092230_voice_catalog';
import * as migration_20260824_101152_cabin_controls_trim from './20260824_101152_cabin_controls_trim';
import * as migration_20260826_065908_llm_generation from './20260826_065908_llm_generation';
import * as migration_20260827_104113_persona_traits from './20260827_104113_persona_traits';
import * as migration_20260827_112844_persona_consent from './20260827_112844_persona_consent';
import * as migration_20260828_080614_route_no_scenario from './20260828_080614_route_no_scenario';
import * as migration_20260828_103959_persona_no_contrast from './20260828_103959_persona_no_contrast';
import * as migration_20260831_064525_cabin_control_cues from './20260831_064525_cabin_control_cues';

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
    name: '20260827_104113_persona_traits',
  },
  {
    up: migration_20260827_112844_persona_consent.up,
    down: migration_20260827_112844_persona_consent.down,
    name: '20260827_112844_persona_consent',
  },
  {
    up: migration_20260828_080614_route_no_scenario.up,
    down: migration_20260828_080614_route_no_scenario.down,
    name: '20260828_080614_route_no_scenario',
  },
  {
    up: migration_20260828_103959_persona_no_contrast.up,
    down: migration_20260828_103959_persona_no_contrast.down,
    name: '20260828_103959_persona_no_contrast',
  },
  {
    up: migration_20260831_064525_cabin_control_cues.up,
    down: migration_20260831_064525_cabin_control_cues.down,
    name: '20260831_064525_cabin_control_cues'
  },
];
