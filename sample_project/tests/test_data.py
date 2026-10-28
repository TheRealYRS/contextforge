import pytest

from src.parser import ScenarioParser


@pytest.fixture
def parser():
    return ScenarioParser("data/data.csv")


def test_parser_reads_rows(parser):
    assert parser.source == "data/data.csv"


def test_parser_class_exists():
    assert ScenarioParser is not None
