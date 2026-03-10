const axios = require('axios');

/**
 * Fetches live weather and AQI data for a given set of coordinates.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} zoneType - "Industrial", "Residential", etc.
 */
const getWeatherData = async (lat, lon, zoneType = "Residential") => {
  const API_KEY = process.env.OPENWEATHER_API_KEY;
  
  // URL 1: Current Weather
  const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
  
  // URL 2: Air Pollution (AQI)
  const pollutionUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;

  try {
    // Fetch both datasets simultaneously for efficiency
    const [weatherRes, pollutionRes] = await Promise.all([
      axios.get(weatherUrl),
      axios.get(pollutionUrl)
    ]);

    const wData = weatherRes.data;
    const pData = pollutionRes.data.list[0]; // Get the first result from pollution list

    const mainCondition = wData.weather[0].main;
    const temp = wData.main.temp;
    const windSpeed = wData.wind.speed;
    const pm25 = pData.components.pm2_5; // PM2.5 levels
    const so2 = pData.components.so2;     // SO2 levels (Critical for Industrial)

    // 1. Weather Hazard Thresholds (Standard for all zones)
    const hazardousConditions = ["Rain", "Thunderstorm", "Tornado", "Squall", "Dust"];
    const isWeatherHazard = hazardousConditions.includes(mainCondition) || temp > 42 || windSpeed > 15;

    // 2. Zone-Differentiated AQI Thresholds (As per Table 1 in the Research Paper)
    let isAQIHazard = false;
    if (zoneType === "Industrial") {
      // Lenient thresholds for industrial corridors to avoid alert fatigue
      // High SO2 (>150) or Extreme PM2.5 (>250)
      if (so2 > 150 || pm25 > 250) isAQIHazard = true;
    } else {
      // Stricter thresholds for Residential/Commercial areas
      // Standard CPCB/Residential PM2.5 limit (>60)
      if (pm25 > 60 || so2 > 40) isAQIHazard = true;
    }

    // 3. Compound Hazard Logic (The "Scientific" Contribution)
    // If it's a hazard due to weather OR air quality, flag as hazardous
    const isHazardous = isWeatherHazard || isAQIHazard;

    return {
      temp: Math.round(temp),
      condition: mainCondition,
      description: wData.weather[0].description,
      humidity: wData.main.humidity,
      windSpeed: windSpeed,
      pm25: pm25.toFixed(1),
      so2: so2.toFixed(1),
      zoneType: zoneType, // Returning this so frontend knows the context
      isHazardous: isHazardous
    };
  } catch (error) {
    console.error("Multi-Hazard API Error:", error.message);
    return { 
      temp: "--", 
      condition: "Offline", 
      description: "Service unavailable", 
      humidity: 0,
      isHazardous: false 
    };
  }
};

module.exports = { getWeatherData };