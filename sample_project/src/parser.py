"""Parses scenario spreadsheets into normalized records."""
import csv
import json
from pathlib import Path

from .loader import load_rows


class ScenarioParser:
    """Parses scenario rows into dictionaries."""

    def __init__(self, source: str):
        self.source = source

    def parse(self):
        return [self._row(r) for r in load_rows(self.source)]

    def _row(self, row):
        return {"id": row[0], "title": row[1]}


def main():
    parser = ScenarioParser("data/data.csv")
    print(json.dumps(parser.parse()))


if __name__ == "__main__":
    main()
