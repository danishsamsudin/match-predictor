#!/usr/bin/env python3
"""
Bridge for the soccerdata Python library.
Reads a JSON request from stdin, returns JSON on stdout.

Request shape:
{
  "source": "FBref",
  "method": "read_team_season_stats",
  "constructor": { "leagues": ["ENG-Premier League"], "seasons": ["2324"] },
  "params": { "stat_type": "shooting" }
}

For classmethods (e.g. available_leagues), omit constructor or pass {}.
"""
from __future__ import annotations

import json
import logging
import math
import os
import sys
import traceback
from datetime import date, datetime
from typing import Any

import pandas as pd

ALLOWED_SOURCES: dict[str, type] = {}


def _load_sources() -> None:
    if ALLOWED_SOURCES:
        return
    os.environ.setdefault("SOCCERDATA_LOGLEVEL", "ERROR")
    import soccerdata as sd

    ALLOWED_SOURCES.update(
        {
            "ClubElo": sd.ClubElo,
            "ESPN": sd.ESPN,
            "FBref": sd.FBref,
            "MatchHistory": sd.MatchHistory,
            "Sofascore": sd.Sofascore,
            "SoFIFA": sd.SoFIFA,
            "Understat": sd.Understat,
            "WhoScored": sd.WhoScored,
        }
    )


def _json_default(value: Any) -> Any:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        try:
            return value.item()
        except (ValueError, AttributeError):
            pass
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _serialize_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    out = df.copy()
    if isinstance(out.columns, pd.MultiIndex):
        out.columns = [
            "|".join(str(part) for part in col).strip()
            if isinstance(col, tuple)
            else str(col)
            for col in out.columns
        ]
    if isinstance(out.index, pd.MultiIndex):
        out = out.reset_index()
    elif out.index.name or not isinstance(out.index, pd.RangeIndex):
        out = out.reset_index()

    records = json.loads(
        out.to_json(orient="records", date_format="iso", default_handler=str)
    )
    for row in records:
        for key, val in list(row.items()):
            if isinstance(val, float) and math.isnan(val):
                row[key] = None

    return {
        "kind": "dataframe",
        "rowCount": len(records),
        "columns": list(out.columns),
        "records": records,
    }


def _serialize_result(result: Any) -> Any:
    if isinstance(result, pd.DataFrame):
        return _serialize_dataframe(result)
    if isinstance(result, list):
        return {"kind": "list", "value": result}
    if isinstance(result, dict):
        return {"kind": "dict", "value": result}
    if result is None:
        return {"kind": "null", "value": None}
    if isinstance(result, (str, int, float, bool)):
        return {"kind": "scalar", "value": result}
    return {"kind": "unknown", "value": str(result)}


def _run(request: dict[str, Any]) -> dict[str, Any]:
    _load_sources()

    source = request.get("source")
    method_name = request.get("method")
    if not source or not method_name:
        raise ValueError("Request must include 'source' and 'method'.")

    if source not in ALLOWED_SOURCES:
        raise ValueError(f"Unknown source '{source}'. Allowed: {sorted(ALLOWED_SOURCES)}")

    cls = ALLOWED_SOURCES[source]
    constructor = request.get("constructor") or {}
    if not isinstance(constructor, dict):
        raise ValueError("'constructor' must be an object.")

    params = request.get("params") or {}
    if not isinstance(params, dict):
        raise ValueError("'params' must be an object.")

    method = getattr(cls, method_name, None)
    if method is None or not callable(method):
        raise ValueError(f"Method '{method_name}' not found on {source}.")

    if method_name == "available_leagues":
        result = cls.available_leagues()
        return {"ok": True, "data": _serialize_result(result)}

    instance = cls(**constructor)
    result = method(instance, **params)
    return {"ok": True, "data": _serialize_result(result)}


def main() -> int:
    logging.basicConfig(stream=sys.stderr, level=os.environ.get("SOCCERDATA_LOGLEVEL", "WARNING"))
    try:
        raw = sys.stdin.read()
        request = json.loads(raw) if raw.strip() else {}
        response = _run(request)
        print(json.dumps(response, default=_json_default))
        return 0
    except Exception as exc:  # noqa: BLE001 — CLI boundary
        payload = {
            "ok": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        print(json.dumps(payload))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
