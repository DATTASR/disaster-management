const { getWeatherData } = require('./weather');
const checkWeatherAndAlert = async () => {
  try {
    const lat = 17.3850;
    const lon = 78.4867;

    console.log("🌦️ Running Proactive Weather Check...");
    const weather = await getWeatherData(lat, lon);

    // REMOVE THE "if (weather.isHazardous)" WRAPPER 
    // So we can at least log that the check happened.
    
    if (weather && weather.condition !== "Offline") {
       // Only create a database ALERT if it's actually hazardous
       if (weather.isHazardous) {
          // ... (Your existing logic to check existingAlert and new Alert.save())
          console.log("📢 Hazardous Alert Created");
       } else {
          console.log("☀️ Weather is normal. No alert needed in DB.");
       }
    }
  } catch (err) {
    console.error("Watcher Error:", err);
  }
};
module.exports = { checkWeatherAndAlert };