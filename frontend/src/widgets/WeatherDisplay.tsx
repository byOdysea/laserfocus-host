import React from 'react';

interface WeatherDisplayProps {
  location?: string;
  temperature?: number;
  unit?: string; // 'C' or 'F'
  description?: string;
}

const WeatherDisplay: React.FC<WeatherDisplayProps> = ({
  location,
  temperature,
  unit,
  description,
}) => {
  return (
    <div style={{
      padding: '10px',
      border: '1px solid #ccc',
      borderRadius: '5px',
      backgroundColor: '#f9f9f9',
      color: '#333',
      fontFamily: 'sans-serif',
      fontSize: '14px',
      height: '100%', // Make div fill the draggable container
      boxSizing: 'border-box' // Include padding/border in height
    }}>
      <h4>Weather: {location ?? 'Unknown Location'}</h4>
      {temperature !== undefined && unit ? (
        <p>Temp: {temperature}°{unit}</p>
      ) : (
        <p>Temp: N/A</p>
      )}
      <p>Conditions: {description ?? 'N/A'}</p>
    </div>
  );
};

export default WeatherDisplay;