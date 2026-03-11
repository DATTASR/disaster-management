require('dotenv').config(); // Change this from 'import' to 'require'
console.log("Checking DB URL:", process.env.MONGO_URI ? "Found ✅" : "Missing ❌");
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Report = require('./models/Report');
const User = require('./models/User');
const Alert = require('./models/Alert');
const { checkWeatherAndAlert } = require('./utils/weatherWatcher');
// Import the Weather Utility
const { getWeatherData } = require('./utils/weather');

// '0.0.0.0' is a special address that tells Render's network 
// that the app is ready to accept external traffic.


const app = express();
app.use(express.json());
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Initialize automated weather watching
checkWeatherAndAlert();
setInterval(() => {
  checkWeatherAndAlert();
}, 1800000); // 30 minutes

// IN-MEMORY MOCKS REPLACING MONGODB
let usersMock = [];
let reportsMock = [];
let alertsMock = [];
let reportIdCounter = 1;
// ---------------------------------

// --- USER & AUTH ROUTES ---

app.post('/api/users', async (req, res) => {
    try {
        const { name, phone, aadhaar, role } = req.body;
        
        const existingUser = usersMock.find(u => u.name === name || u.phone === phone || (role === 'citizen' && u.aadhaar === aadhaar));
        
        if (existingUser) {
            let conflict = "Name or Phone";
            if (existingUser.aadhaar === aadhaar && role === 'citizen') conflict = "Aadhaar Number";
            return res.status(400).json({ message: `${conflict} already registered.` });
        }

        const newUser = { _id: Date.now().toString(), ...req.body };
        usersMock.push(newUser);
        
        res.status(201).json({ message: "Registration successful", user: newUser });
    } catch (err) {
        console.error("Registration Error:", err);
        res.status(400).json({ message: "Registration failed: " + err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = usersMock.find(u => u.name === username && u.password === password);
        if (user) {
            res.json({ message: "Login successful", user });
        } else {
            res.status(401).json({ message: "Invalid username or password" });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/users/workers', async (req, res) => {
    try {
        const workers = usersMock.filter(u => u.role === 'worker');
        res.json(workers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- REPORT ROUTES ---

app.get('/api/reports', async (req, res) => {
  try {
    // Return mock reports sorted (reverse chronological conceptually)
    res.json([...reportsMock].reverse());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { loc } = req.body; 

    console.log("📡 Fetching weather for coordinates:", loc);
    // Add logic to determine zoneType based on coords, or pass from frontend. Defaulting to Residential
    // In a real scenario, you'd check a geo-fence. 
    // Mapped roughly from EcoGuard PDF Strategy Zone Registry:
    let zoneType = "Residential";
    if (loc && ((loc[0] > 17.5 && loc[1] < 78.3) || (loc[0] > 17.5 && loc[1] < 78.47))) {
       zoneType = "Industrial"; // Approx for Patancheru/Jeedimetla
    }
    const weather = await getWeatherData(loc[0], loc[1], zoneType);

    // Algorithm 1: Compound Weather and AQI Hazard Evaluation
    let severity = "Low";
    if (weather) {
      if (weather.isWeatherHazardous && weather.isAQIHazardous) {
        severity = "Critical"; // Compound event
      } else if (weather.isWeatherHazardous && req.body.type === "Flooding") {
        severity = "High"; // Flash flood protocol
      } else if (weather.isAQIHazardous && weather.zoneType === "Industrial") {
        severity = "High"; // Industrial AQI alert
      } else if (weather.isWeatherHazardous || weather.isAQIHazardous) {
        severity = "Moderate";
      }
      
      if (weather.aqiSeverity === "Critical") severity = "Critical";
      if (weather.aqiSeverity === "High" && severity === "Low") severity = "High";
    }

    const reportData = {
      ...req.body,
      _id: (reportIdCounter++).toString(),
      severity: severity,
      weatherContext: weather || { temp: 0, condition: "Unknown", isHazardous: false },
      timestamp: new Date()
    };

    reportsMock.push(reportData);
    
    console.log("🚀 Report saved successfully with Severity:", severity);
    res.status(201).json(reportData);
  } catch (err) {
    console.error("Report Save Error:", err);
    res.status(400).json({ message: "Failed to submit report: " + err.message });
  }
});

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

app.put('/api/reports/:id', async (req, res) => {
  try {
    let reportIndex = reportsMock.findIndex(r => r._id === req.params.id);
    if (reportIndex === -1) return res.status(404).json({ message: "Report not found" });
    
    const report = reportsMock[reportIndex];
    let updatePayload = { ...report, ...req.body };

    if (req.body.status === "Arrived") {
      const t_server = new Date();
      updatePayload.arrivalTimestamp = t_server;
      
      // Algorithm 2: Geo-Fence Proximity Verification
      if (report && report.loc && req.body.workerLat && req.body.workerLon) {
        const d = getDistanceFromLatLonInKm(
          req.body.workerLat, req.body.workerLon, 
          report.loc[0], report.loc[1]
        );
        
        let vStatus = "Flagged";
        let timeValid = true;
        if (req.body.t_client) {
            const t_client = new Date(req.body.t_client);
            if (Math.abs(t_server - t_client) > 5 * 60 * 1000) { // 5 minutes
                timeValid = false;
                console.log("⚠️ Timestamp Manipulation Flagged");
            }
        }

        if (d <= 0.2 && timeValid) {
            vStatus = "Verified";
        }
        
        updatePayload.verifiedLocation = {
            lat: req.body.workerLat,
            lng: req.body.workerLon,
            distanceFromSite: Math.round(d * 1000), // in meters
            verificationStatus: vStatus
        };
        console.log(`📍 Verification Status: ${vStatus} (Distance: ${Math.round(d*1000)}m) for report ${req.params.id}`);
      } else {
        console.log(`📍 Verification: Worker arrived at site for report ${req.params.id} (No worker GPS data provided)`);
      }
    }

    reportsMock[reportIndex] = updatePayload;
    res.json(updatePayload);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// --- PROACTIVE ALERT ROUTES ---

app.get('/api/alerts', async (req, res) => {
  try {
    const currentTime = new Date();
    const activeAlerts = alertsMock.filter(a => a.isActive && (!a.expiresAt || new Date(a.expiresAt) > currentTime));
    res.json(activeAlerts.reverse());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/alerts', async (req, res) => {
  try {
    const newAlert = { _id: Date.now().toString(), ...req.body };
    alertsMock.push(newAlert);
    console.log("📢 Proactive Alert Broadcasted:", newAlert.title);
    res.status(201).json(newAlert);
  } catch (err) {
    res.status(400).json({ message: "Alert broadcast failed: " + err.message });
  }
});

app.put('/api/alerts/:id/deactivate', async (req, res) => {
  try {
    let alertIndex = alertsMock.findIndex(a => a._id === req.params.id);
    if (alertIndex > -1) {
        alertsMock[alertIndex].isActive = false;
        res.json(alertsMock[alertIndex]);
    } else {
        res.status(404).json({ message: "Not found" });
    }
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get('/test-weather', (req, res) => {
   checkWeatherAndAlert();
   res.send("Weather check triggered!");
});

// --- CITY OVERVIEW WEATHER ROUTE (THE GRID - UPDATED TO 10 ZONES) ---
app.get('/api/weather/overview', async (req, res) => {
  const zones = [
    { areaName: "Hitech City", lat: 17.4483, lon: 78.3915, zoneType: "Residential" },
    { areaName: "Charminar", lat: 17.3616, lon: 78.4747, zoneType: "Residential" },
    { areaName: "Secunderabad", lat: 17.4399, lon: 78.4983, zoneType: "Residential" },
    { areaName: "Banjara Hills", lat: 17.4175, lon: 78.4433, zoneType: "Residential" },
    { areaName: "Uppal", lat: 17.4022, lon: 78.5601, zoneType: "Residential" },
    { areaName: "Kukatpally", lat: 17.4948, lon: 78.3997, zoneType: "Residential" },
    { areaName: "Patancheru", lat: 17.5236, lon: 78.2674, zoneType: "Industrial" },
    { areaName: "Jeedimetla", lat: 17.5133, lon: 78.4608, zoneType: "Industrial" },
    { areaName: "Falaknuma", lat: 17.3304, lon: 78.4682, zoneType: "Residential" },
    { areaName: "Moosapet", lat: 17.4697, lon: 78.4239, zoneType: "Residential" }
  ];

  try {
    const overview = await Promise.all(zones.map(async (zone) => {
      // Passed the zoneType to the utility for Differentiated AQI logic
      const weather = await getWeatherData(zone.lat, zone.lon, zone.zoneType);
      
      // Count active incidents from Memory
      const incidents = reportsMock.filter(r => 
        r.status !== "Resolved" && 
        r.loc && 
        r.loc[0] >= zone.lat - 0.03 && r.loc[0] <= zone.lat + 0.03 &&
        r.loc[1] >= zone.lon - 0.03 && r.loc[1] <= zone.lon + 0.03
      ).length;

      return { 
        ...zone, 
        temp: weather?.temp || 0,
        condition: weather?.condition || "Clear",
        isHazardous: weather?.isHazardous || false,
        incidentCount: incidents 
      };
    }));
    res.json(overview);
  } catch (err) {
    console.error("Weather Overview Error:", err);
    res.status(500).json({ message: "Overview fetch failed" });
  }
});

const PORT = process.env.PORT || 5000;

// '0.0.0.0' is a special address that tells Render's network 
// that the app is ready to accept external traffic.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running and listening on port ${PORT}`);
});