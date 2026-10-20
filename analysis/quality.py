#!/usr/bin/env python3
"""How players are judged: the mode (user, 2026-10-20).

    ability    FM's hidden current and potential ability (CA / PA). What this project ran on until now.
    moneyball  Only what a manager can see in FM: attributes, match stats, value, age, contract. CA and PA
               are never read: the export the agent sees has no such columns (analysis/quality.py strips
               them), and a player's level and ceiling are estimated from visible data instead.

Every decision table compares two numbers per player on the same 0-200 scale: his **level** (now) and his
**ceiling** (what he can become). They live in each row's 'ca' / 'pa' fields, so the tables, thresholds
and rules are the same in both modes; only what fills those two fields changes:

    ability    level = CA, ceiling = PA
    moneyball  level and ceiling estimated by estimate() (calibrated against a full export by
               calibrate_quality.py, a developer tool the agent never runs)

The mode: env FM_MODE (fm --mode X sets it for one command), else config/club.json "mode", else ability.
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODES = ('ability', 'moneyball')


def mode():
    m = os.environ.get('FM_MODE') or json.loads((ROOT / 'config' / 'club.json').read_text()).get('mode') or 'ability'
    if m not in MODES:
        raise SystemExit(f'Unknown mode "{m}": use one of {", ".join(MODES)} (config/club.json "mode" or --mode)')
    return m


def labels(m=None):
    """What the two numbers are called in reports."""
    return ('CA', 'PA') if (m or mode()) == 'ability' else ('level', 'ceiling')


def level(p):
    s = str(p.get('ca') or '')
    return int(s) if s.lstrip('-').isdigit() else -1


def ceiling(p):
    s = str(p.get('pa') or '')
    return int(s) if s.lstrip('-').isdigit() else -1


def apply(rows):
    """Fill each row's level / ceiling for the mode. Ability: the export's CA / PA, untouched."""
    if mode() == 'ability':
        return rows
    raise SystemExit('moneyball mode is not built yet')
