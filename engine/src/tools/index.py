from langchain_core.tools import tool

@tool
def get_weather(location: str):
    """Gets the current weather for a specified location using Open-Meteo API."""
    import requests

    # 1. Geocode location name to latitude/longitude
    geocode_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
    try:
        geo_response = requests.get(geocode_url)
        geo_response.raise_for_status()  # Raise an exception for bad status codes
        geo_data = geo_response.json()

        if not geo_data.get('results'):
            return f"Could not find coordinates for location: {location}"

        result = geo_data['results'][0]
        latitude = result['latitude']
        longitude = result['longitude']
        timezone = result.get('timezone', 'GMT') # Use GMT as fallback

    except requests.exceptions.RequestException as e:
        return f"Error during geocoding request: {e}"
    except (KeyError, IndexError):
        return f"Error parsing geocoding response for location: {location}"

    # 2. Get current weather using coordinates
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}"
        f"&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph"
        f"&precipitation_unit=inch&timezone={timezone}"
    )
    try:
        weather_response = requests.get(weather_url)
        weather_response.raise_for_status()
        weather_data = weather_response.json()

        # Return the current weather part of the response
        return weather_data.get('current_weather', {})

    except requests.exceptions.RequestException as e:
        return f"Error during weather request: {e}"
    except KeyError:
        return "Error parsing weather response."