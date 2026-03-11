const axios = require('axios');

/**
 * Fetches live weather and AQI data for a given set of coordinates.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} zoneType - "Industrial", "Residential", etc.
 */
const getWeatherData = async (lat, lon, zoneType = "Residential") => {
  try {
    // ---- MOCK DATA GENERATOR (OFFLINE/LOCAL MODE) ----
    // This bypasses the need for an OpenWeatherMap API Key.
    
    // Simulate real-world variances for the dashboard
    const temp = Math.floor(Math.random() * 15) + 30; // 30-45C
    const windSpeed = Math.floor(Math.random() * 20); // 0-20 km/h
    
    // Industrial zones have inherently higher baselines in this simulation
    const pm25 = zoneType === "Industrial" ? Math.floor(Math.random() * 100) + 100 : Math.floor(Math.random() * 50) + 20;
    const pm10 = zoneType === "Industrial" ? Math.floor(Math.random() * 150) + 150 : Math.floor(Math.random() * 80) + 40;
    const no2 = Math.floor(Math.random() * 100);
    const so2 = zoneType === "Industrial" ? Math.floor(Math.random() * 100) + 50 : Math.floor(Math.random() * 30);
    const o3 = Math.floor(Math.random() * 80);
    const co = Math.random() * 5;
    const nh3 = Math.random() * 10;
    const aqi = zoneType === "Industrial" ? Math.floor(Math.random() * 3) + 3 : Math.floor(Math.random() * 2) + 1; // 1-5 scale
    
    // Randomize weather condition text
    const conditions = ["Clear", "Clouds", "Rain", "Dust", "Haze"];
    const mainCondition = conditions[Math.floor(Math.random() * conditions.length)];
    const wData = { weather: [{ description: "Simulated weather" }], main: { humidity: Math.floor(Math.random() * 40) + 40 } };
    
    // --------------------------------------------------

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