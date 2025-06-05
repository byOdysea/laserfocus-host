import { Cloud, CloudRain, Sun, Wind } from 'lucide-react';
import React from 'react';

interface WeatherData {
  location: string;
  temperature: number;
  condition: 'sunny' | 'cloudy' | 'rainy' | 'windy';
  humidity: number;
  windSpeed: number;
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: 'sunny' | 'cloudy' | 'rainy' | 'windy';
  }>;
}

interface WeatherProps {
  isWidget?: boolean;
  data?: WeatherData;
  unit?: 'celsius' | 'fahrenheit';
  showHourly?: boolean;
  showDetails?: boolean;
}

const defaultData: WeatherData = {
  location: 'San Francisco',
  temperature: 72,
  condition: 'sunny',
  humidity: 65,
  windSpeed: 12,
  forecast: [
    { day: 'Mon', high: 75, low: 62, condition: 'sunny' },
    { day: 'Tue', high: 73, low: 60, condition: 'cloudy' },
    { day: 'Wed', high: 70, low: 58, condition: 'rainy' },
    { day: 'Thu', high: 74, low: 61, condition: 'sunny' },
    { day: 'Fri', high: 76, low: 63, condition: 'cloudy' },
  ]
};

const conditionIcons = {
  sunny: <Sun className="w-8 h-8 text-yellow-500" />,
  cloudy: <Cloud className="w-8 h-8 text-gray-500" />,
  rainy: <CloudRain className="w-8 h-8 text-blue-500" />,
  windy: <Wind className="w-8 h-8 text-gray-600" />
};

const conditionIconsSmall = {
  sunny: <Sun className="w-6 h-6 text-yellow-500" />,
  cloudy: <Cloud className="w-6 h-6 text-gray-500" />,
  rainy: <CloudRain className="w-6 h-6 text-blue-500" />,
  windy: <Wind className="w-6 h-6 text-gray-600" />
};

const Weather: React.FC<WeatherProps> = ({
  isWidget = false,
  data = defaultData,
  unit = 'fahrenheit',
  showHourly = false,
  showDetails = true
}) => {
  const temp = unit === 'celsius' ? Math.round((data.temperature - 32) * 5/9) : data.temperature;
  const unitSymbol = unit === 'celsius' ? '°C' : '°F';

  if (isWidget) {
    // Widget view - display only, no interactions
    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-blue-400 to-blue-600 text-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-medium opacity-90 truncate">{data.location}</h3>
        </div>
        
        {/* Main content - takes available space */}
        <div className="flex-1 px-4 flex flex-col justify-center">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {conditionIconsSmall[data.condition]}
              <div>
                <div className="text-2xl sm:text-3xl font-bold leading-none">{temp}{unitSymbol}</div>
                <div className="text-xs opacity-80 capitalize mt-1">{data.condition}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-75">Humidity</div>
              <div className="text-sm font-medium">{data.humidity}%</div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-4 pb-4 pt-2 border-t border-blue-300/20">
          <div className="flex justify-between text-xs">
            <span>H: {data.forecast[0].high}{unitSymbol}</span>
            <span>L: {data.forecast[0].low}{unitSymbol}</span>
          </div>
        </div>
      </div>
    );
  }

  // Full window view
  return (
    <div className="p-6 h-full bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="max-w-4xl mx-auto">
        {/* Current Weather */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">{data.location}</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {conditionIcons[data.condition]}
              <div>
                <div className="text-5xl font-bold text-gray-800">{temp}{unitSymbol}</div>
                <div className="text-gray-600 capitalize">{data.condition}</div>
              </div>
            </div>
            {showDetails && (
              <div className="text-sm text-gray-600">
                <div>Humidity: {data.humidity}%</div>
                <div>Wind: {data.windSpeed} mph</div>
              </div>
            )}
          </div>
        </div>

        {/* 5-Day Forecast */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">5-Day Forecast</h3>
          <div className="grid grid-cols-5 gap-4">
            {data.forecast.map((day, index) => (
              <div key={index} className="text-center">
                <div className="text-sm font-medium text-gray-600">{day.day}</div>
                <div className="my-3">{conditionIcons[day.condition]}</div>
                <div className="text-sm">
                  <span className="font-semibold">{day.high}°</span>
                  <span className="text-gray-500 ml-1">{day.low}°</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hourly forecast placeholder */}
        {showHourly && (
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Hourly Forecast</h3>
            <div className="text-gray-500 text-center py-8">Hourly forecast data would go here</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Weather;
