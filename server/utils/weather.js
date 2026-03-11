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
    const windSpeed = wData.wind.speed * 3.6; // converting m/s to km/h as per PDF threshold
    const pm25 = pData.components.pm2_5;
    const pm10 = pData.components.pm10;
    const no2 = pData.components.no2;
    const so2 = pData.components.so2;
    const o3 = pData.components.o3;
    const co = pData.components.co / 1000; // API gives CO in µg/m³, PDF uses mg/m³
    const nh3 = pData.components.nh3;
    const aqi = pData.main.aqi;

    // 1. Weather Hazard Thresholds (Table 3 thresholds)
    const hazardousConditions = ["Rain", "Thunderstorm", "Tornado", "Squall", "Dust"];
    let isWeatherHazard = false;
    let t_weather = "Clear";

    if (hazardousConditions.includes(mainCondition)) {
        isWeatherHazard = true;
        t_weather = mainCondition;
    }
    if (temp > 42) {
        isWeatherHazard = true; 
        t_weather = "Extreme Heat Wave"; // Ref [23,24]
    }
    if (windSpeed > 15) {
        isWeatherHazard = true;
        t_weather = "Wind Storm";
    }
    if (windSpeed > 15 && pm10 > 300) {
       isWeatherHazard = true;
       t_weather = "Pre-Monsoon Dust Storm"; // Compound PM10+Wind
    }

    // 2. Zone-Differentiated AQI Thresholds (As per Table 1 in the Research Paper)
    let isAQIHazard = false;
    let aqiSeverity = "Low";

    if (zoneType === "Industrial") {
      // Table 1: Industrial Thresholds
      if (pm25 > 150) isAQIHazard = true;
      if (pm10 > 250) isAQIHazard = true;
      if (no2 > 180) aqiSeverity = "High";
      if (so2 > 120) { isAQIHazard = true; aqiSeverity = "Critical"; }
      if (o3 > 100) isAQIHazard = true;
      if (co > 10.0) isAQIHazard = true;
      if (aqi >= 4) { isAQIHazard = true; aqiSeverity = "Critical"; } // Using NAQI > 300 equivalent
    } else {
      // Table 1: Residential Thresholds
      if (pm25 > 60) isAQIHazard = true;
      if (pm10 > 100) isAQIHazard = true;
      if (no2 > 80) aqiSeverity = "High";
      if (so2 > 50) { isAQIHazard = true; aqiSeverity = "Critical"; }
      if (o3 > 100) isAQIHazard = true;
      if (co > 4.0) isAQIHazard = true;
      if (aqi >= 3) { isAQIHazard = true; aqiSeverity = "High"; } // Using NAQI > 200 equivalent
    }

    // 3. Compound Hazard Logic (Flag)
    const isHazardous = isWeatherHazard || isAQIHazard;

    return {
      temp: Math.round(temp),
      condition: t_weather !== "Clear" ? t_weather : mainCondition,
      description: wData.weather[0].description,
      humidity: wData.main.humidity,
      windSpeed: windSpeed.toFixed(1),
      pm25: pm25.toFixed(1),
      pm10: pm10.toFixed(1),
      no2: no2.toFixed(1),
      so2: so2.toFixed(1),
      o3: o3.toFixed(1),
      co: co.toFixed(1),
      nh3: nh3.toFixed(1),
      zoneType: zoneType,
      isHazardous: isHazardous,
      isWeatherHazardous: isWeatherHazard,
      isAQIHazardous: isAQIHazard,
      aqiSeverity: aqiSeverity
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