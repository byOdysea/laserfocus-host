from langchain_core.tools import tool

@tool
def get_weather(location: str) -> dict:
    """Gets the current weather and 5-day forecast for a specified location using Open-Meteo API."""
    import requests
    from datetime import datetime

    # 1. Geocode location name to latitude/longitude
    geocode_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
    try:
        geo_response = requests.get(geocode_url)
        geo_response.raise_for_status()
        geo_data = geo_response.json()

        if not geo_data.get('results'):
            return {"error": f"Could not find coordinates for location: {location}"}

        result = geo_data['results'][0]
        latitude = result['latitude']
        longitude = result['longitude']
        timezone = result.get('timezone', 'GMT')
        actual_location = result.get('name', location)

    except requests.exceptions.RequestException as e:
        return {"error": f"Error during geocoding request: {e}"}
    except (KeyError, IndexError):
        return {"error": f"Error parsing geocoding response for location: {location}"}

    # 2. Get current weather and forecast using coordinates
    weather_url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}"
        f"&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min"
        f"&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch"
        f"&timezone={timezone}&forecast_days=5"
    )
    
    try:
        weather_response = requests.get(weather_url)
        weather_response.raise_for_status()
        weather_data = weather_response.json()

        current = weather_data.get('current_weather', {})
        daily = weather_data.get('daily', {})
        
        # Map weather codes to conditions
        def get_condition(weather_code):
            if weather_code in [0, 1]:
                return "sunny"
            elif weather_code in [2, 3]:
                return "cloudy"
            elif weather_code in [45, 48]:
                return "cloudy"
            elif weather_code in [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]:
                return "rainy"
            else:
                return "windy"
        
        # Build forecast array
        forecast = []
        if daily.get('time') and daily.get('temperature_2m_max') and daily.get('temperature_2m_min'):
            day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            
            for i in range(min(5, len(daily['time']))):
                try:
                    date_obj = datetime.fromisoformat(daily['time'][i])
                    day_name = day_names[date_obj.weekday()]
                    
                    forecast.append({
                        "day": day_name,
                        "high": round(daily['temperature_2m_max'][i]),
                        "low": round(daily['temperature_2m_min'][i]),
                        "condition": get_condition(daily.get('weathercode', [0])[i] if daily.get('weathercode') else 0)
                    })
                except (ValueError, IndexError, KeyError):
                    continue
        
        # Estimate humidity and format response
        current_condition = get_condition(current.get('weathercode', 0))
        
        # Estimate humidity based on condition (since Open-Meteo free tier doesn't include it)
        humidity_map = {"sunny": 45, "cloudy": 65, "rainy": 80, "windy": 55}
        estimated_humidity = humidity_map.get(current_condition, 60)
        
        return {
            "location": actual_location,
            "temperature": round(current.get('temperature', 70)),
            "condition": current_condition,
            "humidity": estimated_humidity,
            "windSpeed": round(current.get('windspeed', 0)),
            "forecast": forecast
        }

    except requests.exceptions.RequestException as e:
        return {"error": f"Error during weather request: {e}"}
    except (KeyError, TypeError) as e:
        return {"error": f"Error parsing weather response: {e}"}