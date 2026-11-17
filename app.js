const $=id=>document.getElementById(id);
let token=localStorage.getItem('vyora_token'), user=null, watch=null, currentPos=null, journeyId=null, sharingRoom=null, inviteUrl='', socket=null, peers=new Map(), peerMarkers=new Map(), deferredInstall=null, map, marker, routeLine=null, compassHeading=0;
const api=async(url,opts={})=>{const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Request failed');return d};
function status(t,on=false){$('gpsStatus').textContent=t;document.querySelector('.pulse').classList.toggle('on',on)}
function initMap(){map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[10.8505,76.2711],zoom:5,pitch:0,bearing:0,antialias:true});map.addControl(new maplibregl.NavigationControl(),'bottom-left');map.on('load',()=>{const layers=map.getStyle().layers||[];const label=layers.find(l=>l.type==='symbol'&&l.layout?.['text-field']);try{map.addLayer({id:'vyora-3d-buildings',source:'openmaptiles', 'source-layer':'building',type:'fill-extrusion',minzoom:14,paint:{'fill-extrusion-color':'#8ea3ba','fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.72}},label?.id)}catch(e){console.info('3D building layer not available in this style')}})}
function setPosition(p){currentPos=p;const {latitude,longitude,accuracy}=p.coords;$('lat').textContent=latitude.toFixed(6);$('lon').textContent=longitude.toFixed(6);$('accuracy').textContent=`±${Math.round(accuracy||0)} m`;if(!marker){marker=new maplibregl.Marker({color:'#4b9cff'}).setLngLat([longitude,latitude]).addTo(map)}else marker.setLngLat([longitude,latitude]);if(map.getZoom()<13)map.flyTo({center:[longitude,latitude],zoom:16,duration:1000});if(sharingRoom&&socket?.connected)socket.emit('location:update',{room:sharingRoom,lat:latitude,lon:longitude,accuracy});if(journeyId)api(`/api/journeys/${journeyId}/points`,{method:'POST',body:JSON.stringify({lat:latitude,lon:longitude,accuracy,speed:p.coords.speed,heading:p.coords.heading})}).catch(e=>console.warn(e.message))}
function startGPS(){if(!navigator.geolocation)return status('GPS not supported');status('Finding GPS…');watch=navigator.geolocation.watchPosition(p=>{setPosition(p);status('GPS active',true)},e=>status(e.message),{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
$('locateBtn').onclick=()=>{if(!watch)startGPS();if(currentPos)map.flyTo({center:[currentPos.coords.longitude,currentPos.coords.latitude],zoom:17,pitch:55})};
$('tiltBtn').onclick=()=>{const p=map.getPitch()>20?0:60;map.easeTo({pitch:p,bearing:map.getBearing()+20,duration:900})};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tabpage').forEach(x=>x.hidden=x.id!==b.dataset.tab);if(b.dataset.tab==='journeys')loadJourneys()});
$('recordBtn').onclick=async()=>{if(!token)return openAccount();if(!journeyId){try{const j=await api('/api/journeys/start',{method:'POST',body:JSON.stringify({title:'My journey'})});journeyId=j.id;if(!watch)startGPS();$('recordBtn').textContent='Stop journey';$('recordBtn').classList.add('danger')}catch(e){alert(e.message)}}else{await api(`/api/journeys/${journeyId}/stop`,{method:'POST'});journeyId=null;$('recordBtn').textContent='Start journey';$('recordBtn').classList.remove('danger');loadJourneys()}};
function connectSocket(){if(!token||socket?.connected)return;socket=io({auth:{token}});socket.on('connect',()=>{if(sharingRoom)socket.emit('room:join',sharingRoom)});socket.on('room:joined',c=>{$('roomInfo').textContent=`Sharing room ${c} is active. Your live position is shared with joined members.`});socket.on('room:snapshot',arr=>arr.forEach(peer));socket.on('location:peer',peer);socket.on('location:left',x=>{peers.delete(x.userId);const m=peerMarkers.get(x.userId);if(m)m.remove();peerMarkers.delete(x.userId);renderPeers()});socket.on('room:error',m=>$('roomInfo').textContent=m)}
function peer(p){
 if(p.userId===user?.id)return;
 peers.set(p.userId,p);
 if(map){
  let m=peerMarkers.get(p.userId);
  if(!m){m=new maplibregl.Marker({color:'#ffbd59'}).setLngLat([p.lon,p.lat]).addTo(map);peerMarkers.set(p.userId,m)}
  else m.setLngLat([p.lon,p.lat]);
 }
 renderPeers();
}
function renderPeers(){$('peers').innerHTML='';for(const p of peers.values()){const el=document.createElement('div');el.className='peer';el.textContent=`${p.name||'Member'} · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;$('peers').append(el)}}
$('createRoom').onclick=async()=>{if(!token)return openAccount();try{const r=await api('/api/rooms',{method:'POST',body:JSON.stringify({minutes:120})});sharingRoom=r.code;inviteUrl=r.shareUrl||`${location.origin}/?room=${r.code}`;await api(`/api/rooms/${r.code}/join`,{method:'POST'});if(!socket||!socket.connected)connectSocket();else socket.emit('room:join',sharingRoom);$('roomInfo').textContent=`Room code: ${r.code} · Valid for 2 hours. Share this code with people you trust.`;$('roomCode').value=r.code;$('copyInvite').disabled=false;$('stopShare').disabled=false;if(!watch)startGPS();}catch(e){$('roomInfo').textContent=e.message}};
$('joinRoom').onclick=async()=>{if(!token)return openAccount();const c=$('roomCode').value.trim().toUpperCase();if(!c)return;try{await api(`/api/rooms/${c}/join`,{method:'POST'});sharingRoom=c;inviteUrl=`${location.origin}/?room=${c}`;peers.clear();connectSocket();$('copyInvite').disabled=false;$('stopShare').disabled=false;if(!watch)startGPS();$('roomInfo').textContent=`Joined room ${c}. Your location will be shared while sharing is active.`}catch(e){$('roomInfo').textContent=e.message}};
$('copyInvite').onclick=async()=>{
 if(!inviteUrl)return;
 try{await navigator.clipboard.writeText(inviteUrl);$('roomInfo').textContent='Invite link copied. Send it only to people you trust.'}
 catch{$('roomInfo').textContent=`Copy this invite link: ${inviteUrl}`}
};
$('stopShare').onclick=async()=>{
 const oldRoom=sharingRoom;
 sharingRoom=null;
 try{if(oldRoom&&token)await api(`/api/rooms/${oldRoom}/leave`,{method:'POST'})}catch(e){$('roomInfo').textContent=`Sharing stopped on this device; server cleanup failed: ${e.message}`}
 peers.clear();renderPeers();
 for(const m of peerMarkers.values())m.remove();
 peerMarkers.clear();
 if(socket){socket.disconnect();socket=null}
 $('roomInfo').textContent='Live sharing stopped. Your access to this room has been removed.';
 $('stopShare').disabled=true;$('copyInvite').disabled=true;inviteUrl='';
};
async function loadJourneys(){if(!token){$('journeyList').textContent='Sign in to view saved journeys.';return}try{const rows=await api('/api/journeys');$('journeyList').innerHTML='';if(!rows.length)$('journeyList').textContent='No journeys recorded yet.';rows.forEach(j=>{const el=document.createElement('div');el.className='journey';el.innerHTML=`<b></b><div class="muted"></div><button>Replay route</button>`;el.querySelector('b').textContent=j.title;el.querySelector('.muted').textContent=`${new Date(j.started_at).toLocaleString()} · ${j.points} points`;el.querySelector('button').onclick=()=>replay(j.id);$('journeyList').append(el)})}catch(e){$('journeyList').textContent=e.message}}
async function replay(id){try{const pts=await api(`/api/journeys/${id}/points`);if(!pts.length)return alert('No saved GPS points');const coords=pts.map(p=>[p.lon,p.lat]);if(map.getSource('replay')){map.removeLayer('replay-line');map.removeSource('replay')}map.addSource('replay',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});map.addLayer({id:'replay-line',type:'line',source:'replay',paint:{'line-color':'#ffbd59','line-width':5}});map.fitBounds(coords.reduce((b,c)=>b.extend(c),new maplibregl.LngLatBounds(coords[0],coords[0])),{padding:60});document.querySelector('[data-tab=explore]').click()}catch(e){alert(e.message)}}
function openAccount(){$('modal').hidden=false}
$('accountBtn').onclick=openAccount;$('closeModal').onclick=()=>$('modal').hidden=true;
async function account(mode){try{const body={email:$('email').value,password:$('password').value};if(mode==='register'){body.name=$('displayName').value}const d=await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify(body)});token=d.token;user=d.user;localStorage.setItem('vyora_token',token);$('accountMessage').textContent=`Signed in as ${d.user.display_name||d.user.email}`;$('accountBtn').textContent=d.user.display_name||'Account';$('logout').hidden=false;$('modalTitle').textContent='Account connected';connectSocket();}catch(e){$('accountMessage').textContent=e.message}}
$('login').onclick=()=>account('login');$('register').onclick=()=>account('register');$('logout').onclick=()=>{localStorage.removeItem('vyora_token');token=null;user=null;socket?.disconnect();$('accountBtn').textContent='Sign in';$('logout').hidden=true;$('accountMessage').textContent='Signed out.'};
$('compassBtn').onclick=async()=>{try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')throw Error('Compass permission denied')}window.addEventListener('deviceorientationabsolute',e=>{if(e.alpha!=null){compassHeading=(360-e.alpha)%360;$('compass').textContent=`Heading ${Math.round(compassHeading)}°`}});window.addEventListener('deviceorientation',e=>{if(e.alpha!=null){compassHeading=(360-e.alpha)%360;$('compass').textContent=`Heading ${Math.round(compassHeading)}°`}});$('compass').textContent='Move your phone to calibrate compass.'}catch(e){$('compass').textContent=e.message}};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;$('installBtn').hidden=false});$('installBtn').onclick=async()=>{if(deferredInstall){deferredInstall.prompt();deferredInstall=null}};
if(token){api('/api/me').then(u=>{if(!u)throw Error('Account not found');user=u;$('accountBtn').textContent=u.display_name||'Account';$('logout').hidden=false;connectSocket()}).catch(()=>{localStorage.removeItem('vyora_token');token=null;user=null})}
initMap();if(location.search.includes('room=')){const c=new URLSearchParams(location.search).get('room');$('roomCode').value=c;document.querySelector('[data-tab=share]').click()}

if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
