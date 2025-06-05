# This file re-exports the tools made available by index.py
# to be easily accessible from the src.tools package.

from .index import get_weather, update_canvas, clear_canvas, add_component_to_canvas

__all__ = [
    "get_weather",
    "update_canvas",
    "clear_canvas",
    "add_component_to_canvas",
]