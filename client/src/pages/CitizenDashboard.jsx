import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, InputGroup, Badge, ListGroup, Alert } from 'react-bootstrap';
import AppNavbar from '../components/Navbar';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, Rectangle } from 'react-leaflet'; 
import { Navigation, Search, ImageIcon, Video, X, Clock, Send, AlertCircle, ShieldCheck, AlertTriangle } from 'lucide-react'; 
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// --- HYDERABAD BOUNDARY CONSTANTS ---
const HYDERABAD_BOUNDS = {
  minLat: 17.20,
  maxLat: 17.60,
  minLng: 78.20,
  maxLng: 78.60
};

const isInsideHyderabad = (lat, lng) => {
  return (
    lat >= HYDERABAD_BOUNDS.minLat &&
    lat <= HYDERABAD_BOUNDS.maxLat &&
    lng >= HYDERABAD_BOUNDS.minLng &&
    lng <= HYDERABAD_BOUNDS.maxLng
  );
};

// Leaflet Icon Fix
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: markerIcon, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const CitizenDashboard = () => {
  const currentUser = JSON.parse(localStorage.getItem('user')) || {};

  const [position, setPosition] = useState([17.3850, 78.4867]);
  const [issueType, setIssueType] = useState('Flooding');
  const [addressSearch, setAddressSearch] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(true); 
  const [myRequests, setMyRequests] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]); 

  const [formData, setFormData] = useState({
    fullName: currentUser.name || "", 
    mobile: currentUser.phone || "",  
    landmark: "",
    pincode: "",
    imgUrl: "",
    vidUrl: "",
    consent: false,
    details: {}
  });

  // --- UPDATED: FETCH ALERTS FROM BACKEND OVERVIEW (RESEARCH LOGIC) ---
  const fetchAlerts = async () => {
    try {
      // 1. Fetch manual admin-broadcasted alerts
      const adminRes = await fetch(`${API_BASE_URL}/api/alerts`);
      const adminData = adminRes.ok ? await adminRes.json() : [];

      // 2. Fetch the "City Overview" from our backend (Weather + AQI + Zone Logic)
      const overviewRes = await fetch(`${API_BASE_URL}/api/weather/overview`);
      
      if (overviewRes.ok) {
        const zones = await overviewRes.json();
        
        // 3. Filter zones that are currently flagged as hazardous by our backend
        const hazardZones = zones.filter(z => z.isHazardous);

        // 4. Transform hazard zones into alert objects for the UI
        const automatedAlerts = hazardZones.map(zone => {
  // Check for the "Chemical Washout" condition we added in weather.js
  const isChemical = (zone.condition === 'Rain' || zone.condition === 'Drizzle') && zone.so2 > 80;
  
  return {
    _id: `auto-${zone.areaName}`,
    title: isChemical ? `⚠️ TOXIC HAZARD: ${zone.areaName}` : `⚠️ CRITICAL: ${zone.areaName}`,
    severity: isChemical || zone.isHazardous ? "Red" : "Orange",
    area: zone.type || "Regional", // Shows if it's an 'Industrial' or 'Residential' zone
    message: isChemical 
      ? `Acid Rain Risk! High SO2 (${zone.so2}) detected during rainfall. Stay indoors.` 
      : `${zone.condition} alert. AQI: ${zone.pm25}. ${zone.temp}°C. Use caution.`
  };
});

        // Combine manual admin alerts with our automated hazard detections
        setActiveAlerts([...automatedAlerts, ...adminData]);
      }
    } catch (error) { 
      console.error("Alert Sync Error:", error); 
    }
  };

  const syncData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`);
      if (response.ok) {
        const data = await response.json();
        const filteredData = data.filter(r => 
          r.reporter && r.reporter.name === currentUser.name
        );
        setMyRequests(filteredData);
      }
    } catch (error) { console.error("Sync Error:", error); }
  };

  useEffect(() => {
    syncData();
    fetchAlerts(); 
    const interval = setInterval(() => {
        syncData();
        fetchAlerts(); 
    }, 10000); // 10 second refresh for hazard monitoring
    return () => clearInterval(interval);
  }, []);

  const handleSearchAddress = async () => {
    if (!addressSearch) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}`);
      const data = await res.json();
      if (data.length > 0) {
        setPosition([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      }
    } catch (err) { console.error("Search error", err); }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported");
    navigator.geolocation.getCurrentPosition((pos) => {
      setPosition([pos.coords.latitude, pos.coords.longitude]);
    }, (err) => alert("Location access denied"));
  };

  function MapController({ coords }) {
    const map = useMap();
    useEffect(() => { 
      if (coords) {
        map.flyTo(coords, 18, { duration: 1.5 }); 
      }
    }, [coords, map]);
    return null;
  }

  function LocationPicker() {
    useMapEvents({ click(e) { 
        setPosition([e.latlng.lat, e.latlng.lng]); 
        setShowForm(true); 
    } });
    return <Marker position={position} />;
  }

  const handleFinalSubmit = async (e) => {
    e.preventDefault();

    if (!isInsideHyderabad(position[0], position[1])) {
      alert("⚠️ OUT OF SERVICE AREA: Please select a location within Hyderabad city limits.");
      return;
    }

    if (!formData.consent) return alert("Please accept the declaration to proceed.");

    const reportPayload = {
      type: issueType,
      loc: position,
      status: "Pending",
      reporter: {
        name: currentUser.name,
        phone: formData.mobile,
        pincode: formData.pincode,
        landmark: formData.landmark
      },
      evidence: {
        img: formData.imgUrl,
        vid: formData.vidUrl,
        categoryDetails: formData.details
      },
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload),
      });

      if (response.ok) {
        setHasSubmitted(true);
        setShowForm(false);
        syncData();
      }
    } catch (error) { alert("Connection Error"); }
  };

  const renderOfficialFields = () => {
    switch (issueType) {
      case 'Flooding':
        return (
          <div className="border-start border-4 border-primary ps-3 mb-4 bg-light p-2 rounded">
            <Form.Label className="fw-bold small text-uppercase text-primary">3. Incident Details (Flooding)</Form.Label>
            <Form.Select className="mb-2" required onChange={(e) => setFormData({...formData, details: {...formData.details, waterLevel: e.target.value}})}>
              <option value="">Current Status of Water*</option>
              <option>Ankle level</option>
              <option>Knee level</option>
              <option>Waist level</option>
              <option>Above waist / inside houses</option>
            </Form.Select>
            <Form.Control className="mb-2" placeholder="Approx area affected (sq. meters)" onChange={(e) => setFormData({...formData, details: {...formData.details, area: e.target.value}})} />
          </div>
        );
      case 'Blocked Road':
        return (
          <div className="border-start border-4 border-warning ps-3 mb-4 bg-light p-2 rounded">
            <Form.Label className="fw-bold small text-uppercase text-warning">3. Road Obstruction Details</Form.Label>
            <Form.Select className="mb-2" required onChange={(e) => setFormData({...formData, details: {...formData.details, blockType: e.target.value}})}>
              <option value="">Type of Obstruction*</option>
              <option>Fallen tree/branch</option>
              <option>Vehicle accident</option>
              <option>Debris/landslide</option>
              <option>Pothole / road collapse</option>
            </Form.Select>
          </div>
        );
      default:
        return <Form.Control as="textarea" rows={3} placeholder="Describe the incident in detail..." className="mb-4" onChange={(e) => setFormData({...formData, details: {...formData.details, note: e.target.value}})} />;
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa' }}>
      <AppNavbar />
      <Container fluid className="flex-grow-1 p-0 overflow-hidden">
        <Row className="g-0 h-100">
          <Col md={7} lg={8} className="position-relative">
            <div className="position-absolute top-0 start-0 m-3 d-flex gap-2" style={{ zIndex: 1000, width: '300px' }}>
                <Form.Control 
                    placeholder="Search location..." 
                    value={addressSearch}
                    onChange={(e) => setAddressSearch(e.target.value)}
                    className="shadow-sm"
                />
                <Button variant="primary" onClick={handleSearchAddress}>
                    <Search size={18}/>
                </Button>
            </div>

            <Button 
                variant="light" 
                className="position-absolute bottom-0 start-0 m-4 shadow-lg rounded-circle p-3" 
                style={{ zIndex: 1000 }}
                onClick={handleDetectLocation}
            >
                <Navigation size={24} className="text-primary" />
            </Button>

            <MapContainer center={position} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Rectangle 
                bounds={[[HYDERABAD_BOUNDS.minLat, HYDERABAD_BOUNDS.minLng], [HYDERABAD_BOUNDS.maxLat, HYDERABAD_BOUNDS.maxLng]]} 
                pathOptions={{ color: 'red', weight: 2, fillOpacity: 0.05, dashArray: '5, 10' }}
              />
              <LocationPicker />
              <MapController coords={position} />
            </MapContainer>
          </Col>

          <Col md={5} lg={4} className="bg-white shadow-lg overflow-auto p-4 border-start" style={{zIndex: 1001}}>
            
            {/* --- PROACTIVE ALERTS (NOW BASED ON BACKEND RESEARCH LOGIC) --- */}
            {activeAlerts.length > 0 && (
              <div className="mb-4" style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '5px' }}>
                {activeAlerts.map(alert => (
                  <Alert 
                    key={alert._id} 
                    variant={alert.severity === 'Red' ? 'danger' : alert.severity === 'Orange' ? 'warning' : 'info'} 
                    className="mb-2 border-2 shadow-sm d-flex align-items-center animate__animated animate__fadeInDown py-2"
                  >
                    <AlertTriangle className="me-3 text-dark flex-shrink-0" size={24} />
                    <div>
                      <div className="fw-bold d-flex align-items-center" style={{fontSize: '13px'}}>
                        {alert.title} 
                        <Badge bg="dark" className="ms-2" style={{fontSize: '9px'}}>{alert.area}</Badge>
                      </div>
                      <div className="text-dark" style={{fontSize: '11px', lineHeight: '1.2 mt-1'}}>{alert.message}</div>
                    </div>
                  </Alert>
                ))}
              </div>
            )}

            {showForm ? (
              <Form onSubmit={handleFinalSubmit}>
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <div>
                    <h5 className="fw-bold text-dark mb-0">OFFICIAL REPORT FORM</h5>
                    <small className="text-muted text-uppercase" style={{fontSize: '10px'}}>Disaster Management Authority</small>
                  </div>
                  <Button variant="link" className="text-muted p-0" onClick={() => setShowForm(false)}>
                    <X size={24} />
                  </Button>
                </div>

                {!isInsideHyderabad(position[0], position[1]) && (
                  <Alert variant="danger" className="py-2 small mb-3">
                    <AlertCircle size={14} className="me-2" />
                    <strong>Location Out of Bounds:</strong> Move the marker inside the red box.
                  </Alert>
                )}

                <div className="mb-4">
                  <h6 className="fw-bold text-primary border-bottom pb-1 mb-3 small">1. REPORTER DETAILS</h6>
                  <Form.Control size="sm" readOnly value={currentUser.name} className="mb-2 bg-light" />
                  <Form.Control size="sm" required placeholder="Verify Mobile Number*" value={formData.mobile} className="mb-2" onChange={(e) => setFormData({...formData, mobile: e.target.value})} />
                </div>

                <div className="mb-4">
                  <h6 className="fw-bold text-primary border-bottom pb-1 mb-3 small">2. INCIDENT LOCATION</h6>
                  <div className={`p-2 rounded mb-2 font-monospace small ${!isInsideHyderabad(position[0], position[1]) ? 'bg-danger text-white' : 'bg-dark text-white'}`} style={{fontSize: '11px'}}>
                    COORDS: {position[0].toFixed(5)}, {position[1].toFixed(5)}
                  </div>
                  <Form.Control size="sm" required placeholder="Landmark / Street Address*" className="mb-2" onChange={(e) => setFormData({...formData, landmark: e.target.value})} />
                  <Form.Control size="sm" required placeholder="Pin Code*" className="mb-2" onChange={(e) => setFormData({...formData, pincode: e.target.value})} />
                </div>

                <h6 className="fw-bold text-primary border-bottom pb-1 mb-3 small">3. INCIDENT CATEGORY</h6>
                <Form.Select className="mb-3 fw-bold border-primary text-primary" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
                  <option value="Flooding">🌊 Flooding / Waterlogging</option>
                  <option value="Blocked Road">🚧 Road Blockage</option>
                  <option value="Garbage">🚮 Garbage / Sanitation</option>
                  <option value="Power Outage">⚡ Power Outage</option>
                  <option value="Other">❓ General Civic Issue</option>
                </Form.Select>
                {renderOfficialFields()}

                <div className="mb-4">
                  <h6 className="fw-bold text-primary border-bottom pb-1 mb-3 small">4. EVIDENCE (LINKS)</h6>
                  <InputGroup size="sm" className="mb-2">
                    <InputGroup.Text><ImageIcon size={14}/></InputGroup.Text>
                    <Form.Control placeholder="Photo URL*" required onChange={(e) => setFormData({...formData, imgUrl: e.target.value})} />
                  </InputGroup>
                  <InputGroup size="sm" className="mb-2">
                    <InputGroup.Text><Video size={14}/></InputGroup.Text>
                    <Form.Control placeholder="Video URL (Optional)" onChange={(e) => setFormData({...formData, vidUrl: e.target.value})} />
                  </InputGroup>
                </div>

                <div className="p-2 bg-light rounded border mb-4">
                  <Form.Check 
                    type="checkbox" 
                    id="declaration" 
                    required
                    label={<small className="fw-bold" style={{fontSize: '11px'}}>I declare the information provided is correct.</small>}
                    onChange={(e) => setFormData({...formData, consent: e.target.checked})}
                  />
                </div>

                <Button type="submit" variant="danger" className="w-100 py-2 fw-bold" disabled={!isInsideHyderabad(position[0], position[1])}>
                  SUBMIT OFFICIAL REPORT
                </Button>
              </Form>
            ) : (
              <div className="py-2">
                {hasSubmitted && (
                   <Alert variant="success" className="d-flex align-items-center mb-4 border-0 shadow-sm">
                     <ShieldCheck size={20} className="me-2" />
                     <div>
                        <div className="fw-bold">Report Filed!</div>
                        <div className="small">Our teams have been notified.</div>
                     </div>
                   </Alert>
                )}

                <h6 className="fw-bold text-dark mb-3 border-bottom pb-2">MY SUBMISSIONS</h6>
                <ListGroup variant="flush">
                  {myRequests.length > 0 ? myRequests.slice(0, 8).map(r => (
                    <ListGroup.Item 
                      key={r._id} 
                      className="px-0 py-3 border-bottom bg-transparent" 
                      style={{ cursor: 'pointer' }}
                      onClick={() => setPosition(r.loc)}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <div className="fw-bold text-primary">{r.type}</div>
                            <div className="text-muted small">
                                <Clock size={10} className="me-1"/> 
                                {new Date(r.timestamp).toLocaleDateString()}
                            </div>
                        </div>
                        <Badge bg={r.status === 'Pending' ? 'warning' : r.status === 'Resolved' ? 'success' : 'info'}>{r.status}</Badge>
                      </div>
                    </ListGroup.Item>
                  )) : <div className="text-center text-muted py-5">You haven't submitted any reports yet.</div>}
                </ListGroup>

                <Button 
                    variant="primary" 
                    className="w-100 mt-4 fw-bold py-2 shadow-sm"
                    onClick={() => { setHasSubmitted(false); setShowForm(true); }}
                >
                    <Send size={18} className="me-2" /> SUBMIT A NEW FORM
                </Button>
              </div>
            )}
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default CitizenDashboard;