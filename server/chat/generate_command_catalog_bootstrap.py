"""In-container enumerator for the command-catalog bootstrap seed (VERDICT-V2 §4.6.2,
task brief "Two things" #2). NOT run by hub-api at any point — this is read-only
tooling, executed by hand (or by generate_command_catalog_bootstrap.sh) inside the
LIVE example-gateway container, since the four registries it reads
(`hermes_cli.commands`, `agent.skill_commands`, plugin commands, `config.yaml`
`quick_commands`) only exist in that process, not in hub-api's.

Usage (host side — this file is never copied into the image, just piped in):
    docker exec -i -u 1001:1001 example-gateway python3 - < generate_command_catalog_bootstrap.py

Read-only: imports and calls getters, touches no file, restarts nothing. Prints a
bare JSON array of CommandCatalogEntry-shaped dicts (chat/platform.py's model) to
stdout — the wrapping `{"version": ..., "commands": [...]}` envelope plus generation
metadata is added by the .sh wrapper on the host side, not here, since versioning is
a host/repo concern and this script's only job is "what does the live gateway know
about right now."

Four sources, matching SKILLS-API.md and VERDICT-V2 §4.6.2 exactly:
  - hermes_cli.commands.COMMAND_REGISTRY  -> category "builtin", gateway-dispatchable
    subset only (not cli_only, or cli_only with a gateway_config_gate — the same test
    `GATEWAY_KNOWN_COMMANDS` encodes; SKILLS-API.md §4).
  - agent.skill_commands.get_skill_commands()  -> category "skill". Keys already carry
    the leading slash; builtin-colliding slugs are excluded upstream at scan time
    (SKILLS-API.md §3), so no de-dup needed against builtins here.
  - hermes_cli.commands._iter_plugin_command_entries()  -> category "plugin".
  - config.yaml `quick_commands` entries with `type: alias`  -> category "alias".

One resolved collision, not a raw dump: `quick_commands` includes both
`superpowers:<slug>` and `sp-<slug>` aliases pointing at the same skill command, and
`_iter_plugin_command_entries()` ALSO lists those same `sp-<slug>` names as
plugin-registered commands (the `superpowers-commands` plugin registers them, in
addition to config.yaml aliasing them). Live dispatch order in `gateway/run.py`
checks the `quick_commands` alias rewrite BEFORE plugin-command lookup
(SKILLS-API.md §5, step 1 before step 2), so the plugin registration is permanently
shadowed for every `sp-*` name that also has a `quick_commands` alias entry — it can
never be what actually fires for a leading-slash message under that name. Emitting
both would put two rows with the same name in the picker for no functional reason
(SKILLS-API.md §4.6.6 names this exact gap). This script drops the shadowed plugin
entry and keeps the alias, which is what the box will really do.

Busy-policy assumptions, made explicit because the source data doesn't carry this
field for three of the four categories and CommandCatalogEntry requires one:
  - builtin: read directly off `CommandDef.busy_policy` — this is real, not guessed.
  - skill / alias: no busy_policy concept exists for these at all — a skill
    invocation is an ordinary agent turn, handled by the same queue/steer/redirect
    machinery as any other message, never flatly rejected while one is in flight.
    Modeled as "dispatch" (always enabled) rather than invented as "reject".
  - plugin: `PluginContext.register_command` exposes no busy-gating metadata either,
    and unlike skills there's no queue/steer/redirect precedent to lean on for an
    arbitrary plugin handler. Modeled as "reject" — the schema's own fail-closed
    default — until a real plugin-command busy contract exists to read instead.
This is a day-one seed superseded by the first live catalog push (once the real
gateway-side plugin computes actual per-command busy policy); it is not meant to be
long-term-accurate for the skill/alias/plugin categories, only for builtins.
"""

import json
import sys

entries = []

from hermes_cli.commands import COMMAND_REGISTRY  # noqa: E402

for c in COMMAND_REGISTRY:
    gateway_dispatchable = (not c.cli_only) or bool(c.gateway_config_gate)
    if not gateway_dispatchable:
        continue
    entries.append(
        {
            "name": f"/{c.name}",
            "aliases": [f"/{a}" for a in (c.aliases or ())],
            "category": "builtin",
            "description": c.description or "",
            "arg_hint": (c.args_hint or "").strip() or None,
            "busy_policy": c.busy_policy,
        }
    )

from agent.skill_commands import get_skill_commands  # noqa: E402

for key, info in get_skill_commands().items():
    entries.append(
        {
            "name": key,
            "aliases": [],
            "category": "skill",
            "description": info.get("description") or "",
            "arg_hint": None,
            "busy_policy": "dispatch",
        }
    )

import yaml  # noqa: E402
from hermes_cli.config import get_config_path  # noqa: E402

with open(get_config_path()) as f:
    cfg = yaml.safe_load(f)

alias_names: set[str] = set()
for alias_name, spec in (cfg.get("quick_commands") or {}).items():
    if not isinstance(spec, dict) or spec.get("type") != "alias":
        continue
    target = spec.get("target") or ""
    alias_names.add(f"/{alias_name}")
    entries.append(
        {
            "name": f"/{alias_name}",
            "aliases": [],
            "category": "alias",
            "description": f"Alias for {target}" if target else "",
            "arg_hint": None,
            "busy_policy": "dispatch",
        }
    )

from hermes_cli.commands import _iter_plugin_command_entries  # noqa: E402

for name, description, args_hint in _iter_plugin_command_entries():
    if f"/{name}" in alias_names:
        continue  # shadowed by a same-named quick_commands alias — see module docstring
    entries.append(
        {
            "name": f"/{name}",
            "aliases": [],
            "category": "plugin",
            "description": description or "",
            "arg_hint": (args_hint or "").strip() or None,
            "busy_policy": "reject",
        }
    )

json.dump(entries, sys.stdout)
