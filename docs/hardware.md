# Seat hardware — panel, ESP32 buttons, NFC

Each seat is an iPad mini in **portrait**, mounted behind a physical panel
with two cutouts (a circle for the face, a slit for telemetry) and flanked
by physical controls driven by an **ESP32 that pairs with the iPad as a
Bluetooth LE HID keyboard**. One ESP32 per iPad (BLE HID is 1:1); advertise
distinguishable names (`CoSiMo-Seat-1` …) so pairing stays sane.

The app treats all HID keyboards identically — every input below can be
tested by typing on a normal keyboard with the app focused (Simulator,
browser, or device).

## Key protocol

| Input | Keystrokes | Semantics |
|---|---|---|
| Talk button | `s` | **Key DOWN on press, key UP on release** — the app records exactly while held (push-to-talk). Auto-repeat is ignored. Firmware debounce ~50 ms. |
| Info button | `i` | One normal keystroke per press → CoSiMo introduces itself. |
| NFC scan | `[` + chip id + `Enter` | Framed, scanner-style. `]` also terminates. One frame per physical tap; debounce re-reads of the same chip ~2 s. |

Frame rules (implemented in the kiosk's `useHidInput`):

- While a frame is open, ALL keys are swallowed — chip ids containing
  `s`/`i` cannot misfire the buttons.
- A stalled frame resets after **600 ms** of key silence — send the
  sequence at normal typing speed without artificial gaps.
- Chip ids: alphanumeric, case-sensitive, no spaces. Shorter is faster.

## What the ids mean

Nothing, to the hardware and the app. The kiosk forwards the raw id to the
realtime service (`nfc:register`); the server looks it up in the CMS —
each persona lists its chip ids — switches **that seat's** persona, and
greets the visitor ("account registered"). Unknown ids get a friendly
refusal. Managing chips = typing ids into the persona in the Payload admin;
no code changes, no redeploys. The id format just has to match what the
reader emits and what's entered in the CMS.

## Operational notes

- While a BLE keyboard is connected, iPadOS hides the on-screen keyboard —
  desired for the kiosk; on the hidden operator screen there's an iOS
  toggle to bring the soft keyboard back if needed.
- Test hard: auto-reconnect after ESP32 power-cycle and after iPad
  reboot/sleep. The devices run all day at the fair.
- The panel mockup also shows a door button and speaker grilles — a door
  key (e.g. `d`) can be added to the same protocol in minutes when that
  becomes real.
- Kiosk lockdown on real iPads: Guided Access + auto-lock off; the app
  itself disables the idle timer and hides the status bar.
