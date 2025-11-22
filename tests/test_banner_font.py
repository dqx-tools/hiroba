"""Tests for font mapping."""

import pytest
from unittest.mock import MagicMock

from src.banner.font import FONT_MAPPINGS, FontMapper


class TestFontMappings:
    """Tests for explicit font mappings."""

    def test_known_fonts_mapped(self):
        assert "ライラ" in FONT_MAPPINGS
        assert FONT_MAPPINGS["ライラ"] == "Laila"

    def test_kurokane_mapped(self):
        assert "Kurokane" in FONT_MAPPINGS
        assert FONT_MAPPINGS["Kurokane"] == "Black Han Sans"


class TestFontMapper:
    """Tests for FontMapper class."""

    @pytest.fixture
    def mock_client(self):
        client = MagicMock()
        return client

    @pytest.fixture
    def mapper(self, mock_client):
        return FontMapper(mock_client)

    def test_none_font_returns_open_sans(self, mapper):
        result = mapper.get_latin_equivalent(None)
        assert result == "Open Sans"

    def test_known_font_uses_mapping(self, mapper):
        result = mapper.get_latin_equivalent("ライラ")
        assert result == "Laila"

    def test_partial_match_uses_mapping(self, mapper):
        # Should match "Kurokane" in the font name
        result = mapper.get_latin_equivalent("FOT-Kurokane Std")
        assert result == "Black Han Sans"

    def test_unknown_font_calls_openai(self, mapper, mock_client):
        # Set up mock response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Noto Sans JP"
        mock_client.chat.completions.create.return_value = mock_response

        result = mapper.get_latin_equivalent("UnknownFont")

        assert result == "Noto Sans JP"
        mock_client.chat.completions.create.assert_called_once()
