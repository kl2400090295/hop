const API_ROOT = "http://localhost:5000";

// Define a custom icon for the SOS marker
const sosIcon = L.icon({
    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});

/* ---------- Simple Demo Backend (localStorage) ---------- */
const DB = {
  get users(){ return JSON.parse(localStorage.getItem('gov_users')||'[]') },
  set users(v){ localStorage.setItem('gov_users', JSON.stringify(v)) },

  get session(){ return JSON.parse(localStorage.getItem('gov_session')||'null') },
  set session(v){ localStorage.setItem('gov_session', JSON.stringify(v)) },

  get contacts(){ return JSON.parse(localStorage.getItem('gov_contacts')||'[]') },
  set contacts(v){ localStorage.setItem('gov_contacts', JSON.stringify(v)) },

  get alerts(){ return JSON.parse(localStorage.getItem('gov_alerts')||'[]') },
  set alerts(v){ localStorage.setItem('gov_alerts', JSON.stringify(v)) },

  get zones(){ return JSON.parse(localStorage.getItem('gov_zones')||'[]') },
  set zones(v){ localStorage.setItem('gov_zones', JSON.stringify(v)) },

  get resources(){ return JSON.parse(localStorage.getItem('gov_resources')||'[]') },
  set resources(v){ localStorage.setItem('gov_resources', JSON.stringify(v)) },

  get incidents(){ return JSON.parse(localStorage.getItem('gov_incidents')||'[]') },
  set incidents(v){ localStorage.setItem('gov_incidents', JSON.stringify(v)) },

  get sosQueue(){ return JSON.parse(localStorage.getItem('gov_sos')||'[]') },
  set sosQueue(v){ localStorage.setItem('gov_sos', JSON.stringify(v)) },
};

/* ---------- Seed demo data ---------- */
(function seed(){
  if(DB.users.length === 0){
    DB.users = [
      {name:'Demo User', email:'demo@user.com', pass:'demo123', role:'citizen'},
      {name:'District Admin', email:'district@demo.com', pass:'district123', role:'district'},
      {name:'State Admin', email:'state@demo.com', pass:'state123', role:'state'},
      {name:'Central Admin', email:'central@demo.com', pass:'central123', role:'central'},
    ];
  }
  if(DB.alerts.length === 0){
    DB.alerts = [
      {id:id(), type:'Earthquake', severity:'High', msg:'M5.2 near city center', time: Date.now()-600000, lat:17.385, lng:78.486},
      {id:id(), type:'Flood', severity:'Medium', msg:'River rising', time: Date.now()-4200000, lat:17.44, lng:78.49},
    ];
  }
  if(DB.zones.length === 0){
    DB.zones = [
      {id:id(), type:'Flood', severity:'Medium', radius:800, lat:17.425, lng:78.475},
      {id:id(), type:'Fire', severity:'High', radius:400, lat:17.39, lng:78.50},
    ];
  }
  if(DB.resources.length === 0){
    DB.resources = [
      {id:id(), type:'Shelter', name:'Community Hall A', lat:17.384, lng:78.48, capacity:200, available:150, contact:'+91-98xxxxxxx'},
      {id:id(), type:'Hospital', name:'General Hospital', lat:17.39, lng:78.47, capacity:100, available:25, contact:'+91-99xxxxxxx'},
    ];
  }
})();

/* ---------- State ---------- */
let map, zoneLayer, drawMode=false, userMarker;
let incImageBase64 = '';

/* ---------- Auth ---------- */
function showSignup(){ document.getElementById('signupCard').classList.remove('hidden'); }
function hideSignup(){ document.getElementById('signupCard').classList.add('hidden'); }
function onSignup(){
  const name = document.getElementById('signName').value.trim();
  const email = document.getElementById('signEmail2').value.trim();
  const pass = document.getElementById('signPass2').value;
  const role = document.getElementById('signRole').value || 'citizen';
  if(!name||!email||!pass) return alert('Fill all fields');
  if(DB.users.some(u=>u.email===email)) return alert('Email exists');
  DB.users = [...DB.users, {name,email,pass,role}];
  alert('Account created. Please login.');
  hideSignup();
}
function onLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const user = DB.users.find(u=>u.email===email && u.pass===pass);
  if(!user) return alert('Invalid credentials (demo)');
  DB.session = {email:user.email, name:user.name, role:user.role};
  boot();
}
function logout(){ DB.session=null; location.reload(); }

/* ---------- Boot app ---------- */
function boot(){
  document.getElementById('authWrap').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sosBtn').classList.remove('hidden');

  const session = DB.session;
  const roleTag = document.getElementById('roleTag');
  roleTag.textContent = session.role.toUpperCase();
  roleTag.className = 'pill ' + (session.role==='citizen'?'low':'med');

  // admin panel toggle visible only for admin roles
  document.getElementById('adminToggle').classList.toggle('hidden', !['district','state','central'].includes(session.role));
  renderContacts();
  renderAlerts();
  renderZones();
  renderResources();
  renderSOSQueue();
  renderIncidents();

  // map init
  map = L.map('map', { zoomControl:true }).setView([17.4065,78.4772],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap' }).addTo(map);
  zoneLayer = L.layerGroup().addTo(map);
  map.on('click', e=>{
    if(drawMode) { createZoneAt(e.latlng.lat, e.latlng.lng); toggleDraw(false); }
  });

  // watch position
  if(navigator.geolocation){
    navigator.geolocation.watchPosition(pos=>{
      updateUserMarker(pos.coords.latitude, pos.coords.longitude);
      checkProximity(pos.coords.latitude, pos.coords.longitude);
    }, err=>{
      console.warn('geolocation:', err.message);
    }, {enableHighAccuracy:true});
  }

  // simulated live feed
  setInterval(()=>randomAlertTick(), 15000);
}

/* ---------- Alerts ---------- */
function renderAlerts(){
  const el = document.getElementById('alerts');
  el.innerHTML = '';
  const data = [...DB.alerts].sort((a,b)=>b.time-a.time).slice(0,25);
  if(data.length===0) el.innerHTML = '<div class="muted">No alerts yet.</div>';
  for(const a of data){
    const sev = (a.severity||'Low').toLowerCase();
    const div = document.createElement('div');
    div.className='item';
    div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><b>${a.type}</b> <span class="pill ${sev==='high'?'high':sev==='medium'?'med':'low'}">${a.severity||'Low'}</span></div>
      <small class="muted">${timeAgo(a.time)}</small>
    </div>
    <div style="margin-top:6px">${a.msg||''}</div>
    ${a.lat?`<div class="tag small muted">(${a.lat.toFixed(3)}, ${a.lng.toFixed(3)})</div>`:''}`;
    el.appendChild(div);
  }
}
function simulateAlert(){
  const types=['Earthquake','Flood','Fire','Landslide'];
  const severities=['Low','Medium','High'];
  const msgSamples=[
    'Aftershock likely - move to open area',
    'Evacuate low-lying areas immediately',
    'Wildfire reported - expect smoke'
  ];
  const t=types[Math.floor(Math.random()*types.length)];
  const s=severities[Math.floor(Math.random()*severities.length)];
  const msg=msgSamples[Math.floor(Math.random()*msgSamples.length)];
  const c = map.getCenter();
  DB.alerts = [{id:id(), type:t, severity:s, msg, time:Date.now(), lat:c.lat + (Math.random()-0.5)*0.06, lng:c.lng + (Math.random()-0.5)*0.06}, ...DB.alerts];
  renderAlerts();
}
function clearAlerts(){ DB.alerts=[]; renderAlerts(); }

/* ---------- Zones on map ---------- */
function renderZones(){
  if(!zoneLayer) return;
  zoneLayer.clearLayers();
  DB.zones.forEach(z=>{
    const color = z.severity==='High' ? '#ef4444' : z.severity==='Medium' ? '#f59e0b' : '#22c55e';
    const c = L.circle([z.lat,z.lng], {radius:z.radius, color, weight:2, fillColor:color, fillOpacity:0.12});
    c.bindPopup(`<b>${z.type}</b> <div class="small">Severity: ${z.severity} • Radius: ${z.radius}m</div>`);
    c.addTo(zoneLayer);
  });
}
function fitZones(){ if(DB.zones.length===0) map.setView([17.4065,78.4772],12); else { const group = L.featureGroup(DB.zones.map(z=>L.circle([z.lat,z.lng],{radius:z.radius}))); map.fitBounds(group.getBounds(), {padding:[20,20]}); } }
function toggleAdminPanel(){ const p=document.getElementById('adminPanel'); p.classList.toggle('hidden'); document.getElementById('adminToggle').textContent = p.classList.contains('hidden')?'Open Admin Menu':'Close Admin Menu'; }
function toggleDraw(force){ if(typeof force==='boolean') drawMode=force; else drawMode=!drawMode; alert(drawMode?'Click on the map to add zone center':'Draw mode off'); }
function createZoneAt(lat,lng){
  const type=document.getElementById('zoneType').value;
  const severity=document.getElementById('zoneSeverity').value;
  const radius=parseInt(document.getElementById('zoneRadius').value||'400',10);
  DB.zones = [{id:id(), type, severity, radius, lat, lng}, ...DB.zones];
  renderZones();
  toast('Zone created');
}

/* ---------- Resource Management ---------- */
function renderResources(){
  let adminMenus = document.getElementById('adminMenus');
  adminMenus.innerHTML = '';
  const session = DB.session || {};
  if(!session.role || !['district','state','central'].includes(session.role)) return;
  // admin resource card
  const div = document.createElement('div');
  div.className='card';
  div.innerHTML = `<h2>Resource Management</h2>
    <div class="body">
      <div id="resourceForm" class="row">
        <input id="resName" placeholder="Name (Shelter/Hospital)">
        <input id="resType" placeholder="Type (Shelter/Hospital/Fire Station)">
        <input id="resContact" placeholder="Contact">
      </div>
      <div class="row" style="margin-top:8px">
        <input id="resLatLng" placeholder="Lat,lng">
        <input id="resCapacity" placeholder="Capacity (number)">
      </div>
      <div style="margin-top:8px" class="row">
        <button class="primary" onclick="addResource()">Add Resource</button>
        <button onclick="renderResources()">Refresh</button>
      </div>
      <div style="margin-top:10px"><h4 class="small">Existing Resources</h4><div id="resourceList" class="list"></div></div>
    </div>`;
  adminMenus.appendChild(div);
  const list = document.getElementById('resourceList');
  list.innerHTML = '';
  DB.resources.forEach((r, i)=>{
    const item = document.createElement('div'); item.className='item';
    item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><b>${r.name}</b><div class="small muted">${r.type} • ${r.contact || ''}</div></div>
      <div style="text-align:right">${r.available ?? r.capacity}/${r.capacity || '—'}<div class="small muted">${r.lat?.toFixed(3)||''}, ${r.lng?.toFixed(3)||''}</div></div>
    </div>
    <div style="margin-top:6px" class="row">
      <button onclick="assignResource('${r.id}')">Assign</button>
      <button onclick="removeResource('${r.id}')">Remove</button>
    </div>`;
    list.appendChild(item);
  });
}
function addResource(){
  const name=document.getElementById('resName').value.trim();
  const type=document.getElementById('resType').value.trim() || 'Shelter';
  const contact=document.getElementById('resContact').value.trim();
  const capacity = parseInt(document.getElementById('resCapacity').value||'0',10) || 0;
  const latlng = (document.getElementById('resLatLng').value||'').split(',').map(s=>s.trim());
  const lat=parseFloat(latlng[0])||null, lng=parseFloat(latlng[1])||null;
  if(!name) return alert('Enter resource name');
  const r={id:id(), name, type, contact, capacity, available:capacity, lat, lng};
  DB.resources = [r, ...DB.resources];
  renderResources();
  toast('Resource added');
}
function removeResource(id){ if(!confirm('Remove resource?')) return;
  DB.resources = DB.resources.filter(r=>r.id!==id);
  renderResources();
}
function assignResource(id){
  // simple demo assign -> reduce available by 1
  DB.resources = DB.resources.map(r => r.id===id ? {...r, available: Math.max(0,(r.available ?? r.capacity) - 1)} : r);
  renderResources();
  toast('Assigned resource (demo)');
}

/* ---------- Contacts ---------- */
function renderContacts(){
  const list = document.getElementById('contacts');
  list.innerHTML = '';
  if(DB.contacts.length===0) list.innerHTML = '<div class="muted">No contacts yet.</div>';
  DB.contacts.forEach((c,i)=>{
    const d=document.createElement('div'); d.className='item';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><b>${c.name}</b><div class="small muted">${c.phone}</div></div>
      <div><button onclick="removeContact(${i})">Remove</button></div>
    </div>`;
    list.appendChild(d);
  });
}
function addContact(){
  const name=document.getElementById('cName').value.trim();
  const phone=document.getElementById('cPhone').value.trim();
  if(!name||!phone) return alert('Enter name & phone');
  DB.contacts = [{name, phone}, ...DB.contacts];
  document.getElementById('cName').value=''; document.getElementById('cPhone').value='';
  renderContacts();
  toast('Contact added');
}
function removeContact(i){ DB.contacts = DB.contacts.filter((_,idx)=>idx!==i); renderContacts(); }
function clearContacts(){ if(confirm('Clear all contacts?')){ DB.contacts=[]; renderContacts(); } }

/* ---------- SOS (citizen) ---------- */
function sendSOS() {
    // Check if the geolocation API is available
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser. Cannot send SOS.");
        return;
    }

    // Get the user's current position
    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        const latLng = [latitude, longitude];

        // 1. Add a custom SOS marker at the user's location
        const sosMarker = L.marker(latLng, { icon: sosIcon, draggable: false })
            .addTo(map)
            .bindPopup("<b>SOS Alert!</b><br>Location: " + latLng.join(", ")).openPopup();

        // 2. Add a circle to mark the risk zone
        const sosZone = L.circle(latLng, {
            color: 'red',        // Border color of the circle
            fillColor: '#f03',   // Fill color inside the circle
            fillOpacity: 0.3,    // Transparency of the fill
            radius: 500          // Radius in meters (adjust as needed)
        }).addTo(map);

        // Pan the map to the SOS location and zoom in
        map.setView(latLng, 15);

        // Optionally, add the SOS marker and zone to a global array for later management
        // (e.g., clearing the map, showing/hiding markers)
        // markers.push(sosMarker);
        // circles.push(sosZone);

        // Also, you'd send this data to your backend here
        // for administrators to see it in the SOS Queue.
        // For example:
        // sendToBackend({ type: 'SOS', lat: latitude, lng: longitude, timestamp: new Date() });

    }, (error) => {
        // Handle any errors with geolocation
        console.error("Geolocation error:", error);
        alert("Could not get your location. Please ensure location services are enabled.");
    });
}

/* ---------- SOS Queue (admin) ---------- */
function renderSOSQueue(){
  const wrap = document.getElementById('sosQueue');
  if(!wrap) return;
  wrap.innerHTML = '';
  if(DB.sosQueue.length===0) wrap.innerHTML = '<div class="muted">No SOS currently.</div>';
  DB.sosQueue.forEach((s,i)=>{
    const item = document.createElement('div'); item.className='item';
    item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><b>${s.name}</b><div class="small muted">${s.contact}</div></div>
      <div class="small muted">${timeAgo(s.time)}</div>
    </div>
    <div style="margin-top:6px">${s.coordsText ? `<a href="https://maps.google.com/?q=${s.coordsText}" target="_blank">${s.coordsText}</a>` : 'Location unavailable'}</div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button onclick="assignSOS(${i})">Assign</button>
      <button onclick="resolveSOS(${i})">Resolve</button>
      <button onclick="escalateSOS(${i})">Escalate</button>
    </div>`;
    wrap.appendChild(item);
  });
}
function assignSOS(i){
  const s = DB.sosQueue[i];
  s.status='Assigned';
  // in real system assign to resource/team
  DB.sosQueue = DB.sosQueue.map((x,idx)=> idx===i? s : x);
  renderSOSQueue();
  toast('SOS assigned (demo)');
}
function resolveSOS(i){ if(!confirm('Mark as resolved?')) return;
  DB.sosQueue = DB.sosQueue.filter((_,idx)=>idx!==i);
  renderSOSQueue();
  toast('Resolved');
}
function escalateSOS(i){ DB.sosQueue[i].status = 'Escalated'; renderSOSQueue(); toast('Escalated (demo)'); }

/* ---------- Incidents (citizen reports) ---------- */
function previewIncImage(e){
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = function(){
    document.getElementById('incPreview').src = reader.result;
    document.getElementById('incPreview').classList.remove('hidden');
    incImageBase64 = reader.result;
  };
  reader.readAsDataURL(f);
}
function reportIncident(){
  const type = document.getElementById('incType').value.trim() || 'Incident';
  const msg = document.getElementById('incMsg').value.trim();
  const latlng = (document.getElementById('incLatLng').value||'').split(',').map(s=>s.trim());
  const lat = parseFloat(latlng[0])||null, lng = parseFloat(latlng[1])||null;
  const inc = {id:id(), type, msg, image:incImageBase64||null, lat, lng, time:Date.now(), reporter:DB.session?.name||'Unknown', verified:false};
  DB.incidents = [inc, ...DB.incidents];
  clearIncInput();
  renderIncidents();
  toast('Incident reported (demo). Admins can verify it.');
}
function clearIncInput(){ document.getElementById('incType').value=''; document.getElementById('incMsg').value=''; document.getElementById('incLatLng').value=''; document.getElementById('incPreview').classList.add('hidden'); incImageBase64=''; }
function renderIncidents(){
  // admin card for incidents
  const adminMenus = document.getElementById('adminMenus');
  // Remove existing incidents card first
  const old = document.getElementById('incCard');
  if(old) old.remove();
  if(!['district','state','central'].includes(DB.session?.role)) return;
  const card = document.createElement('div'); card.className='card'; card.id='incCard';
  card.innerHTML = `<h2>Incident Reports</h2><div class="body"><div id="incList" class="list"></div></div>`;
  adminMenus.appendChild(card);
  const list = document.getElementById('incList');
  list.innerHTML = '';
  DB.incidents.forEach((inc, i)=>{
    const item = document.createElement('div'); item.className='item';
    item.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <div><b>${inc.type}</b> <div class="small muted">by ${inc.reporter} • ${timeAgo(inc.time)}</div></div>
      <div>${inc.lat?`<div class="small muted">${inc.lat.toFixed(3)}, ${inc.lng.toFixed(3)}</div>`:''}</div>
    </div>
    <div style="margin-top:6px">${inc.msg || ''}</div>
    ${inc.image ? `<img src="${inc.image}" class="file-preview">` : ''}
    <div style="margin-top:8px;display:flex;gap:8px">
      <button onclick="verifyIncident(${i})">${inc.verified? 'Unverify' : 'Verify'}</button>
      <button onclick="removeIncident(${i})">Remove</button>
    </div>`;
    list.appendChild(item);
  });
}
function verifyIncident(i){ DB.incidents[i].verified = !DB.incidents[i].verified; renderIncidents(); toast('Toggled verification'); }
function removeIncident(i){ if(!confirm('Remove incident?')) return;
  DB.incidents = DB.incidents.filter((_,idx)=>idx!==i);
  renderIncidents();
}

/* ---------- Map helpers & proximity ---------- */
function locateMe(){
  if(!navigator.geolocation) return alert('Geolocation not available');
  navigator.geolocation.getCurrentPosition(pos=>{
    updateUserMarker(pos.coords.latitude, pos.coords.longitude);
    map.setView([pos.coords.latitude, pos.coords.longitude], 14);
  }, err => alert('Location error: '+err.message));
}
function updateUserMarker(lat,lng){
  if(!map) return;
  if(userMarker) userMarker.setLatLng([lat,lng]);
  else { userMarker = L.marker([lat,lng], {title:'You'}).addTo(map).bindPopup('You are here'); }
}
function checkProximity(lat,lng){
  const near = DB.zones.find(z => haversine(lat,lng,z.lat,z.lng) <= z.radius);
  if(near) toast(`You are within a ${near.severity} ${near.type} zone (radius ${near.radius} m)`);
}

/* ---------- Admin broadcasts ---------- */
function broadcastAlert(){
  const msg = document.getElementById('broadcastMsg').value.trim();
  if(!msg) return alert('Type message');
  DB.alerts = [{id:id(), type:'Admin', severity:'Medium', msg, time:Date.now()}, ...DB.alerts];
  document.getElementById('broadcastMsg').value='';
  renderAlerts();
  toast('Broadcast sent (demo)');
}

/* ---------- Utilities ---------- */
function id(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function timeAgo(t){
  const s = Math.floor((Date.now() - t)/1000);
  if(s<60) return s+'s ago';
  const m = Math.floor(s/60); if(m<60) return m+'m ago';
  const h = Math.floor(m/60); if(h<24) return h+'h ago';
  const d = Math.floor(h/24); return d+'d ago';
}
function haversine(lat1,lon1,lat2,lon2){
  const toRad=x=>x*Math.PI/180; const R=6371000;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
let toastTimer=null;
function toast(text){ let el=document.getElementById('toast'); if(!el){ el=document.createElement('div'); el.id='toast'; el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:100px;background:#07101a;border:1px solid #234;padding:10px 14px;border-radius:8px;z-index:9999'; document.body.appendChild(el); } el.textContent=text; el.style.opacity='1'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{ el.style.opacity='0'; }, 2800); }

/* ---------- CSV Export (simple) ---------- */
function exportAlertsCSV(){
  const rows = [['id','type','severity','msg','time','lat','lng']];
  DB.alerts.forEach(a => rows.push([a.id,a.type,a.severity,(a.msg||'').replace(/\n/g,' '), new Date(a.time).toISOString(), a.lat||'', a.lng||'']));
  const csv = rows.map(r => r.map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob); 
  const a = document.createElement('a'); a.href = url; a.download = 'alerts.csv'; a.click(); URL.revokeObjectURL(url);
}

/* ---------- Export helpers for demo ---------- */

/* ---------- Simple auth check on load ---------- */
if(DB.session) boot();

/* ---------- Extra: handle pressing Enter in search box to filter alerts/resources ---------- */
document.getElementById('searchBox').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    const q = e.target.value.trim().toLowerCase();
    if(!q) { renderAlerts(); renderResources(); return; }
    const al = DB.alerts.filter(a => (a.type||'').toLowerCase().includes(q) || (a.msg||'').toLowerCase().includes(q));
    const el = document.getElementById('alerts'); el.innerHTML='';
    if(al.length===0) el.innerHTML='<div class="muted">No results</div>';
    al.forEach(a=>{ const d=document.createElement('div'); d.className='item'; d.innerHTML=`<div><b>${a.type}</b> <div class="small muted">${a.severity} • ${timeAgo(a.time)}</div></div><div style="margin-top:6px">${a.msg}</div>`; el.appendChild(d); });
  }
});
