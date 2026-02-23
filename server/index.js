require('dotenv').config();
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
  origin: 'http://localhost:5173', // Your frontend address
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Initialize automated weather watching
checkWeatherAndAlert();
setInterval(() => {
  checkWeatherAndAlert();
}, 1800000); // 30 minutes

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ Connection Error:", err));

// --- USER & AUTH ROUTES ---

app.post('/api/users', async (req, res) => {
    try {
        const { name, phone, aadhaar, role } = req.body;

        const query = [{ name }, { phone }];
        if (role === 'citizen' && aadhaar) {
            query.push({ aadhaar });
        }

        const existingUser = await User.findOne({ $or: query });
        
        if (existingUser) {
            let conflict = "Name or Phone";
            if (existingUser.aadhaar === aadhaar && role === 'citizen') conflict = "Aadhaar Number";
            return res.status(400).json({ message: `${conflict} already registered.` });
        }

        const newUser = new User(req.body);
        await newUser.save();
        
        res.status(201).json({ message: "Registration successful", user: newUser });
    } catch (err) {
        console.error("Registration Error:", err);
        res.status(400).json({ message: "Registration failed: " + err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ name: username, password: password });
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
        const workers = await User.find({ role: 'worker' });
        res.json(workers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- REPORT ROUTES ---

app.get('/api/reports', async (req, res) => {
  try {
    const reports = await Report.find().sort({ timestamp: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { loc } = req.body; 

    console.log("📡 Fetching weather for coordinates:", loc);
    const weather = await getWeatherData(loc[0], loc[1]);

    const reportData = {
      ...req.body,
      weatherContext: weather || { temp: 0, condition: "Unknown", isHazardous: false } 
    };

    if (weather?.isHazardous && req.body.type === "Flooding") {
      console.log("⚠️ Hazard detected! Boosting severity to High.");
      reportData.severity = "High";
    }

    const newReport = new Report(reportData);
    await newReport.save();
    
    console.log("🚀 Report saved successfully!");
    res.status(201).json(newReport);
  } catch (err) {
    console.error("Report Save Error:", err);
    res.status(400).json({ message: "Failed to submit report: " + err.message });
  }
});

app.put('/api/reports/:id', async (req, res) => {
  try {
    const updatePayload = { ...req.body };

    if (req.body.status === "Arrived") {
      updatePayload.arrivalTimestamp = new Date();
      console.log(`📍 Verification: Worker arrived at site for report ${req.params.id}`);
    }

    const updated = await Report.findByIdAndUpdate(req.params.id, updatePayload, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// --- PROACTIVE ALERT ROUTES ---

app.get('/api/alerts', async (req, res) => {
  try {
    const currentTime = new Date();
    const activeAlerts = await Alert.find({
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: currentTime } }
      ]
    }).sort({ timestamp: -1 });
    
    res.json(activeAlerts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/alerts', async (req, res) => {
  try {
    const newAlert = new Alert(req.body);
    await newAlert.save();
    console.log("📢 Proactive Alert Broadcasted:", newAlert.title);
    res.status(201).json(newAlert);
  } catch (err) {
    res.status(400).json({ message: "Alert broadcast failed: " + err.message });
  }
});

app.put('/api/alerts/:id/deactivate', async (req, res) => {
  try {
    const updated = await Alert.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get('/test-weather', (req, res) => {
   checkWeatherAndAlert();
   res.send("Weather check triggered!");
});

// --- CITY OVERVIEW WEATHER ROUTE (THE GRID) ---
app.get('/api/weather/overview', async (req, res) => {
  const zones = [
    { areaName: "Hitech City", lat: 17.4483, lon: 78.3915 },
    { areaName: "Charminar", lat: 17.3616, lon: 78.4747 },
    { areaName: "Secunderabad", lat: 17.4399, lon: 78.4983 },
    { areaName: "Banjara Hills", lat: 17.4175, lon: 78.4433 },
    { areaName: "Uppal", lat: 17.4022, lon: 78.5601 },
    { areaName: "Kukatpally", lat: 17.4948, lon: 78.3997 }
  ];

  try {
    const overview = await Promise.all(zones.map(async (zone) => {
      // Fetch live weather using your existing utility
      const weather = await getWeatherData(zone.lat, zone.lon);
      
      // Count active incidents specifically for this zone's area
      const incidents = await Report.countDocuments({
        status: { $ne: "Resolved" },
        "loc.0": { $gte: zone.lat - 0.03, $lte: zone.lat + 0.03 },
        "loc.1": { $gte: zone.lon - 0.03, $lte: zone.lon + 0.03 }
      });

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