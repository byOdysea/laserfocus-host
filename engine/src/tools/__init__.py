from .index import get_weather
from .dummy_data import (
    generate_email_data,
    generate_calendar_data,
    generate_todo_data,
    generate_notes_data,
    generate_reminders_data
)

__all__ = [
    'get_weather',
    'generate_email_data', 
    'generate_calendar_data',
    'generate_todo_data',
    'generate_notes_data',
    'generate_reminders_data'
]