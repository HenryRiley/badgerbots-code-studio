# Product requirements

## Users and scale

- One active camp session per location, up to 20-25 students.
- Initially one location; architecture supports three or four registered hosts later.
- Grades 3-4 and grades 5-8 tracks.
- One session owner and multiple assistant instructors.
- Temporary camper identity: weekly join code, first name, last initial; no camper password in v1.
- Fixed BadgerBots Microsoft/Minecraft account per student laptop, mapped persistently by device.

## Student experience

- Join from a browser and be associated with the helper/device mapping.
- Full searchable Blockly library; no course filtering.
- Multiple scripts/tabs such as Player, Game, and entities.
- Variables/fields, methods, events, commands, loops, conditionals, coordinates, blocks, entities, teleportation, inventories, health/damage, effects, timers, teams, scoreboards, win conditions, and safeguards.
- Autosave meaningful changes locally immediately and to cloud after a debounce.
- Run updates behavior without restarting Paper.
- Friendly validation/runtime console.
- Automatically enter the current private daily world on server join.
- Request owner permission to visit another student's running world; teacher world is separately open/closed.
- See progress benchmarks and optional completion badges.
- Student text mode is not available in v1.

## Instructor experience

- Email/password account; never hard-code the initial account password.
- Create a dated weekly session and join code, choose track, enroll helpers/host, and manage assistants.
- Live roster: web/helper/Minecraft status, project, progress, last successful run, errors, help request, and performance warnings.
- View and remotely edit a periodically synchronized Blockly snapshot; the student sees accepted edits promptly.
- Instructor-only Java-style text editing that round-trips to blocks.
- Stop/pause/run/restore code; reset/restore world; enter or impersonate the project context for troubleshooting.
- Minecraft controls: open/close teacher world, whitelist, kick, freeze, teleport, clear inventories, set gamemode, mute chat, reset world.
- Teacher world uses the same editor/runtime and remains loaded.
- Curriculum editor supports visual starter/expected code and flexible benchmarks.
- Rotating skip code may be implemented for lesson UI, but chapter locking/advancement is not a core workflow.

## World and runtime behavior

- One compact prebuilt world per day/project, with borders and pre-generated chunks.
- Preferred illusion: private invisible world per camper. Benchmark true per-student worlds against protected, widely separated instances in fewer worlds.
- Queue Run deployments briefly when necessary, while event handlers remain independently scoped.
- On owner departure, stop scripts, timers, tasks, and owned transient entities, then unload private world when safe.
- Visitors play normally in the target world but do not gain code editing rights.
- Teacher world stays loaded and running.

## Retention

- Session becomes inactive the day after its configured end date.
- Camper access stops and records enter a hidden recoverable state.
- Default permanent deletion occurs after a configurable 7-14-day recovery period.
- Host keeps one encrypted/compressed final backup until deletion completes.
- Device-to-Minecraft-account mappings persist across camp weeks.

## Deferred

- Roblox, public/home access, printed/emailed certificates, public gallery, custom client-side blocks/items/textures/mobs, and unrestricted Java.
