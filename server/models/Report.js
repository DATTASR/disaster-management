const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true,
    enum: ["Flooding", "Blocked Road", "Garbage", "Power Outage", "Other"] 
  },
  loc: {
    type: [Number], // [lat, lng]
    required: true
  },
  status: { 
    type: String, 
    enum: ["Pending", "Assigned", "Accepted", "Arrived", "Submitted for Review", "Resolved"], 
    default: "Pending" 
  },
  reporter: {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    pincode: String,
    landmark: String
  },
  evidence: {
    img: String,
    vid: String,
    categoryDetails: { type: mongoose.Schema.Types.Mixed } 
  },
  
  weatherContext: {
    temp: { type: Number },
    condition: { type: String },
    isHazardous: { type: Boolean, default: false },
    fetchedAt: { type: Date, default: Date.now }
  },

  // --- NEW: ARRIVAL VERIFICATION & RESOLUTION TRACKING ---
  arrivalTimestamp: { type: Date }, // Recorded when worker hits "Arrived"
  verifiedLocation: {
    lat: Number,
    lng: Number,
    distanceFromSite: Number, // Meters away when they marked "Arrived"
    verificationStatus: { type: String, enum: ["Verified", "Flagged"] } // Verification result V from Algorithm 2
  },
  // ------------------------------------------------------

  worker: { type: String, default: "Unassigned" },
  severity: { type: String, default: "Medium" },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', ReportSchema);