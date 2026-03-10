import React, { useState, useEffect } from 'react';
import { Container, Card, Button, Badge, Modal, Form, InputGroup, Spinner, Row, Col } from 'react-bootstrap';
import AppNavbar from '../components/Navbar';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { ClipboardList, Send, Image as ImageIcon, ShieldCheck, Users, MapPin, Navigation, CloudRain, AlertTriangle, Map as MapIcon } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet Icon Fix
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Dynamically handle the API URL for Render
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

let DefaultIcon = L.icon({ 
  iconUrl: markerIcon, 
  shadowUrl: markerShadow, 
  iconSize: [25, 41], 
  iconAnchor: [12, 41] 
});
L.Marker.prototype.options.icon = DefaultIcon;

const WorkerDashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false); 
  const [activeTask, setActiveTask] = useState(null); 
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [evidence, setEvidence] = useState({ imageUrl: '', videoUrl: '', notes: '' });
  const [isVerifying, setIsVerifying] = useState(false);
  
  const getWorkerName = () => {
    const directTeam = localStorage.getItem('userTeam');
    if (directTeam) return directTeam;
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try { return JSON.parse(storedUser).name; } catch (e) { return "Unassigned"; }
    }
    return "Unassigned";
  };

  const workerTeam = getWorkerName();

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
  };

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`);
      const data = await response.json();
      const myTasks = data.filter(r => r.worker === workerTeam && r.status !== "Resolved");
      setTasks(myTasks.reverse());
    } catch (err) { console.error("Worker Sync Error:", err); }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [workerTeam]);

  const handleStatusChange = async (id, newStatus, extraData = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, ...extraData }),
      });
      if (response.ok) fetchTasks(); 
    } catch (err) { alert("Failed to update status."); }
  };

  const handleArrivalVerification = (task) => {
    if (!navigator.geolocation) return alert("Geolocation is not supported by your browser.");

    setIsVerifying(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const workerLat = position.coords.latitude;
        const workerLng = position.coords.longitude;
        const [targetLat, targetLng] = task.loc;

        const distance = calculateDistance(workerLat, workerLng, targetLat, targetLng);
        const MAX_DISTANCE = 200; 

        if (distance > MAX_DISTANCE) {
          alert(`Verification Failed! You are ${Math.round(distance)}m away. You must be within 200m to mark arrival.`);
          setIsVerifying(false);
        } else {
          await handleStatusChange(task._id, "Arrived", {
            verifiedLocation: {
              lat: workerLat,
              lng: workerLng,
              distanceFromSite: Math.round(distance)
            }
          });
          setIsVerifying(false);
        }
      },
      (error) => {
        alert("Location Access Denied. Please enable GPS to verify arrival.");
        setIsVerifying(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleFormSubmit = async () => {
    if(!evidence.notes) return alert("Please add resolution notes.");
    try {
      const currentReport = tasks.find(t => t._id === activeTaskId);
      const response = await fetch(`${API_BASE_URL}/api/reports/${activeTaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: "Submitted for Review",
          evidence: { 
            ...currentReport.evidence, 
            img: evidence.imageUrl, 
            vid: evidence.videoUrl, 
            notes: evidence.notes 
          }
        }),
      });
      if (response.ok) {
        setShowForm(false);
        setActiveTaskId(null);
        setEvidence({ imageUrl: '', videoUrl: '', notes: '' });
        fetchTasks();
      }
    } catch (err) { alert("Submission failed."); }
  };

  const openNavigation = (loc) => {
  // Standard Google Maps Direction URL
  const url = `https://www.google.com/maps/dir/?api=1&destination=${loc[0]},${loc[1]}`;
  window.open(url, '_blank');
};

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f4f4' }}>
      <AppNavbar roleName="Field Response Unit" />
      
      <Container className="py-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h4 className="fw-bold m-0 d-flex align-items-center">
            <ClipboardList className="me-2 text-primary" /> Active Assignments
          </h4>
          <Badge bg="dark" className="p-2 px-3 d-flex align-items-center">
            <Users size={14} className="me-2"/> {workerTeam}
          </Badge>
        </div>

        <Row>
          {tasks.length > 0 ? (
            tasks.map(task => (
              <Col md={6} lg={4} key={task._id} className="mb-4">
                <Card className="shadow-sm border-0 h-100 overflow-hidden">
                  <div style={{ height: '140px' }}>
                    <MapContainer center={task.loc} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} dragging={false} touchZoom={false} scrollWheelZoom={false}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={task.loc} />
                    </MapContainer>
                  </div>
                  
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <Badge bg={
                        task.status === "Arrived" ? "warning text-dark" :
                        task.status === "Accepted" ? "success" : 
                        task.status === "Submitted for Review" ? "info text-dark" : "primary"
                      }>
                        {task.status === "Submitted for Review" ? "UNDER REVIEW" : task.status.toUpperCase()}
                      </Badge>
                      <small className="text-muted font-monospace">#{task._id.slice(-5)}</small>
                    </div>

                    <h5 className="fw-bold mb-1">{task.type}</h5>
                    <p className="text-muted small mb-1">Loc: {task.reporter?.landmark || "Standard Area"}</p>

                    {task.weatherContext && task.weatherContext.temp !== undefined && (
                      <div className={`mt-2 mb-3 p-2 rounded d-flex align-items-center ${task.weatherContext.isHazardous ? 'bg-danger text-white' : 'bg-light text-dark'}`} style={{ fontSize: '0.75rem' }}>
                        {task.weatherContext.isHazardous ? <AlertTriangle size={14} className="me-2" /> : <CloudRain size={14} className="me-2" />}
                        <span className="fw-bold">
                          {task.weatherContext.temp}°C - {task.weatherContext.condition?.toUpperCase()} 
                          {task.weatherContext.isHazardous && " | HAZARD ALERT"}
                        </span>
                      </div>
                    )}

                    <div className="d-grid gap-2">
                      <Button 
                        variant="outline-secondary" 
                        size="sm" 
                        className="fw-bold d-flex align-items-center justify-content-center"
                        onClick={() => { setActiveTask(task); setShowMapModal(true); }}
                      >
                        <MapPin size={14} className="me-2 text-danger"/> VIEW MISSION MAP
                      </Button>

                      {(task.status === "Assigned" || task.status === "Pending") && (
                        <Button 
                          variant="primary" 
                          size="sm" 
                          className="fw-bold" 
                          onClick={() => handleStatusChange(task._id, "Accepted")}
                        >
                          START MISSION
                        </Button>
                      )}

                      {task.status === "Accepted" && (
                        <Button 
                          variant="warning" 
                          size="sm" 
                          className="fw-bold shadow-sm"
                          disabled={isVerifying}
                          onClick={() => handleArrivalVerification(task)}
                        >
                          {isVerifying ? (
                            <><Spinner size="sm" className="me-2"/> VERIFYING GPS...</>
                          ) : (
                            <><MapIcon size={14} className="me-2"/> VERIFY & MARK ARRIVAL</>
                          )}
                        </Button>
                      )}

                      {task.status === "Arrived" && (
                        <Button 
                          variant="dark" 
                          size="sm" 
                          className="fw-bold" 
                          onClick={() => {
                            setActiveTaskId(task._id);
                            setShowForm(true);
                          }}
                        >
                          SUBMIT RESOLUTION
                        </Button>
                      )}

                      {task.status === "Submitted for Review" && (
                        <div className="text-center p-2 bg-light rounded border">
                          <Spinner animation="grow" size="sm" variant="info" className="me-2"/>
                          <small className="text-info fw-bold">Awaiting Admin Approval</small>
                        </div>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))
          ) : (
            <Col xs={12} className="text-center py-5">
              <ShieldCheck size={60} className="text-success mb-3 opacity-25"/>
              <h5 className="text-muted">No active tasks for {workerTeam}.</h5>
            </Col>
          )}
        </Row>
      </Container>

      {/* NAVIGATION MODAL */}
      <Modal show={showMapModal} onHide={() => setShowMapModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6 fw-bold">Incident Navigation</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <div style={{ height: '400px', width: '100%' }}>
            {activeTask && (
              <MapContainer center={activeTask.loc} zoom={16} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={activeTask.loc}>
                  <Popup><strong>{activeTask.type}</strong><br/>{activeTask.reporter?.landmark}</Popup>
                </Marker>
              </MapContainer>
            )}
          </div>
          <div className="p-3 bg-white d-flex justify-content-between align-items-center">
            <div>
              <h6 className="mb-0 fw-bold">{activeTask?.type}</h6>
              <small className="text-muted">{activeTask?.reporter?.landmark}</small>
            </div>
            <Button variant="primary" className="fw-bold shadow-sm" onClick={() => openNavigation(activeTask.loc)}>
              <Navigation size={18} className="me-2"/> OPEN IN GOOGLE MAPS
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      {/* RESOLUTION FORM */}
      <Modal show={showForm} onHide={() => setShowForm(false)} centered>
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fs-6 fw-bold">Resolution Evidence</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">FIELD NOTES</Form.Label>
              <Form.Control as="textarea" rows={3} placeholder="Describe the action taken..." value={evidence.notes} onChange={(e) => setEvidence({...evidence, notes: e.target.value})} />
            </Form.Group>
            <Form.Label className="small fw-bold">PROOF OF WORK (IMAGE URL)</Form.Label>
            <InputGroup className="mb-2">
              <InputGroup.Text><ImageIcon size={16}/></InputGroup.Text>
              <Form.Control placeholder="Paste Image URL here" value={evidence.imageUrl} onChange={(e) => setEvidence({...evidence, imageUrl: e.target.value})} />
            </InputGroup>
            <Button variant="success" className="w-100 fw-bold mt-3 py-2" onClick={handleFormSubmit}>
              <Send size={16} className="me-2"/> SEND FOR APPROVAL
            </Button>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default WorkerDashboard;