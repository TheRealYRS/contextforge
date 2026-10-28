import csv
from pathlib import Path


def load_rows(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.reader(fh))
