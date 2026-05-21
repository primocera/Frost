# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based top-down RPG in the style of classic MMORPG mage AoE grinding. Single-player. Built with **Phaser 3**, **TypeScript**, and **Vite**.

## Stack

- **Phaser 3** — game framework
- **TypeScript** — strict typing throughout
- **Vite** — dev server and bundler
- Package manager: npm

## Project Structure

```
src/
  scenes/      # Phaser scenes (Boot, Game, UI overlay, etc.)
  entities/    # Player, Enemy base classes and concrete types
  spells/      # Individual spell implementations
  systems/     # EntityManager, SpellManager, EnemyAI, XPSystem, StatsSystem, CooldownManager
  ui/          # HP/mana bars, XP bar, floating combat text
  assets/      # Placeholder sprites, tilemaps, audio
```

## Architecture Systems

| System | Responsibility |
|---|---|
| `EntityManager` | Tracks all live entities; handles add/remove/query |
| `SpellManager` | Registers spells, routes cast requests, applies cooldowns |
| `EnemyAI` | Aggro detection, chase logic, attack decisions |
| `XPSystem` | XP gain, level-up triggers, stat scaling |
| `StatsSystem` | HP, mana, damage, defense — read by all combat |
| `CooldownManager` | Per-entity, per-spell countdown tracking |

## Spell Progression

| Level | Spell | Notes |
|---|---|---|
| 1 | Firebolt | Single target |
| 4 | Frost Slow | Debuff + minor damage |
| 8 | Arcane Explosion | AoE burst |
| 10 | Blink | Teleport escape |
| 14 | Frost Nova | AoE root |
| 20 | Blizzard | Large sustained AoE |

## Development Rules

- **Step-by-step only.** Implement one major system at a time. Wait for the user's confirmation before moving to the next.
- **Never generate the whole game at once.** Break work into the smallest useful unit.
- **Keep files modular.** One class or system per file. No god objects.
- **Beginner-friendly comments.** Explain non-obvious logic inline; skip trivial ones.
- **Placeholder art only.** No real assets until explicitly asked.
- **Gameplay feel over graphics.** Prioritize tight controls, responsive combat, and mana pressure.

## Controls

- Movement: WASD
- Spells: assigned keys (TBD per spell)

## Combat Design Goals

- Early game: player can handle 1–2 enemies max; combat should feel dangerous
- Late game: player kites and AoEs large packs efficiently
- Mana management and positioning must matter
- Combat should feel satisfying and responsive

## Dev Commands

```bash
npm install        # install dependencies
npm run dev        # start Vite dev server
npm run build      # production build
npm run preview    # preview production build
```
