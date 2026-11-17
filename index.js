import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
const allowedOrigin = publicUrl ? new URL(publicUrl).origin : 'http://localhost:3000';
const io = new Server(server, { cors: { origin: allowedOrigin, credentials: true } });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const SECRET = process.env.JWT_SECRET || 'local-development-secret-change-before-deploy-123456';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || SECRET.length < 32)) {
  throw new Error('Set a strong JWT_SECRET (at least 32 characters) in production.');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname,'../public')));
await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));

const sign = u => jwt.sign({sub:u.id,email:u.email,name:u.display_name}, SECRET, {expiresIn:'30d'});
async function auth(req,res,next) {
  try {
    const h=req.headers.authorization||'';
    const token=h.startsWith('Bearer ')?h.slice(7):'';
    req.user=jwt.verify(token,SECRET);
    next();
  } catch { res.status(401).json({error:'Please sign in again'}); }
}
app.get('/api/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({ok:true,service:'VYORA'}); }
  catch { res.status(503).json({ok:false,error:'Database unavailable'}); }
});
app.post('/api/auth/register', async (req,res) => {
  const {email,password,name}=req.body||{};
  if(!email||!password||password.length<8||!name) return res.status(400).json({error:'Name, email and password (8+ characters) required'});
  try {
    const id=uuid(), hash=await bcrypt.hash(password,12);
    const q=await pool.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4) RETURNING id,email,display_name',[id,email.toLowerCase(),hash,name.trim()]);
    res.json({token:sign(q.rows[0]),user:q.rows[0]});
  } catch(e) { res.status(409).json({error:e.code==='23505'?'Email already registered':'Could not create account'}); }
});
app.post('/api/auth/login', async (req,res) => {
  const {email,password}=req.body||{};
  const q=await pool.query('SELECT * FROM users WHERE email=$1',[String(email||'').toLowerCase()]);
  if(!q.rowCount || !await bcrypt.compare(password||'',q.rows[0].password_hash)) return res.status(401).json({error:'Incorrect email or password'});
  const u=q.rows[0]; res.json({token:sign(u),user:{id:u.id,email:u.email,display_name:u.display_name}});
});
app.get('/api/me',auth,async(req,res)=>{
 const q=await pool.query('SELECT id,email,display_name FROM users WHERE id=$1',[req.user.sub]);
 res.json(q.rows[0]||null);
});
app.post('/api/journeys/start',auth,async(req,res)=>{
 const id=uuid(); const q=await pool.query('INSERT INTO journeys(id,user_id,title) VALUES($1,$2,$3) RETURNING *',[id,req.user.sub,(req.body?.title||'My journey').slice(0,80)]);
 res.json(q.rows[0]);
});
app.post('/api/journeys/:id/points',auth,async(req,res)=>{
 const {lat,lon,accuracy,speed,heading}=req.body||{};
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return res.status(400).json({error:'Invalid coordinates'});
 const q=await pool.query(`INSERT INTO location_points(journey_id,user_id,position,accuracy,speed,heading)
 SELECT j.id,$2,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography,$5,$6,$7 FROM journeys j WHERE j.id=$1 AND j.user_id=$2 RETURNING id`,
 [req.params.id,req.user.sub,lon,lat,accuracy??null,speed??null,heading??null]);
 if(!q.rowCount) return res.status(404).json({error:'Journey not found'});
 res.json({saved:true,id:q.rows[0].id});
});
app.post('/api/journeys/:id/stop',auth,async(req,res)=>{
 const q=await pool.query('UPDATE journeys SET ended_at=now() WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.user.sub]);
 res.json({stopped:!!q.rowCount});
});
app.get('/api/journeys',auth,async(req,res)=>{
 const q=await pool.query(`SELECT j.id,j.title,j.started_at,j.ended_at,count(p.id)::int AS points
 FROM journeys j LEFT JOIN location_points p ON p.journey_id=j.id WHERE j.user_id=$1
 GROUP BY j.id ORDER BY j.started_at DESC LIMIT 50`,[req.user.sub]); res.json(q.rows);
});
app.get('/api/journeys/:id/points',auth,async(req,res)=>{
 const q=await pool.query(`SELECT ST_Y(position::geometry) lat,ST_X(position::geometry) lon,accuracy,speed,heading,recorded_at
 FROM location_points WHERE journey_id=$1 AND user_id=$2 ORDER BY recorded_at`,[req.params.id,req.user.sub]); res.json(q.rows);
});
app.post('/api/rooms',auth,async(req,res)=>{
 const code=crypto.randomBytes(4).toString('hex').toUpperCase();
 const mins=Math.min(Math.max(Number(req.body?.minutes)||120,5),1440);
 await pool.query('INSERT INTO share_rooms(code,owner_id,expires_at) VALUES($1,$2,now()+make_interval(mins=>$3))',[code,req.user.sub,mins]);
 res.json({code,expiresInMinutes:mins,shareUrl:`${(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '')}/?room=${code}`});
});
app.post('/api/rooms/:code/join',auth,async(req,res)=>{
 const code=req.params.code.toUpperCase();
 const q=await pool.query('SELECT code FROM share_rooms WHERE code=$1 AND expires_at>now()',[code]);
 if(!q.rowCount) return res.status(404).json({error:'Room expired or not found'});
 await pool.query('INSERT INTO room_members(room_code,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[code,req.user.sub]);
 res.json({joined:true,code});
});
app.get('/api/rooms/:code/members',auth,async(req,res)=>{
 const code=String(req.params.code||'').toUpperCase();
 const allowed=await pool.query(`SELECT 1 FROM room_members m JOIN share_rooms r ON r.code=m.room_code
 WHERE m.room_code=$1 AND m.user_id=$2 AND r.expires_at>now()`,[code,req.user.sub]);
 if(!allowed.rowCount) return res.status(403).json({error:'You are not a member of this active room'});
 const q=await pool.query(`SELECT u.id,u.display_name FROM room_members m JOIN users u ON u.id=m.user_id
 WHERE m.room_code=$1`,[code]);
 res.json(q.rows);
});
app.post('/api/rooms/:code/leave',auth,async(req,res)=>{
 const code=String(req.params.code||'').toUpperCase();
 await pool.query('DELETE FROM room_members WHERE room_code=$1 AND user_id=$2',[code,req.user.sub]);
 for (const socket of io.sockets.sockets.values()) {
   if (socket.user?.sub===req.user.sub) socket.leave(code);
 }
 const item=live.get(req.user.sub);
 if(item?.room===code) live.delete(req.user.sub);
 io.to(code).emit('location:left',{userId:req.user.sub});
 res.json({left:true});
});
const live = new Map();
io.use((socket,next)=>{
 try { socket.user=jwt.verify(socket.handshake.auth?.token||'',SECRET); next(); }
 catch { next(new Error('Authentication required')); }
});
io.on('connection',socket=>{
 socket.on('room:join',async code=>{
  const c=String(code||'').toUpperCase();
  const q=await pool.query('SELECT code FROM share_rooms WHERE code=$1 AND expires_at>now() AND EXISTS(SELECT 1 FROM room_members WHERE room_code=$1 AND user_id=$2)',[c,socket.user.sub]);
  if(!q.rowCount) return socket.emit('room:error','Join a valid room first');
  socket.join(c); socket.emit('room:joined',c);
  const current=[...live.values()].filter(x=>x.room===c);
  socket.emit('room:snapshot',current);
 });
 socket.on('location:update',payload=>{
  const {room,lat,lon,accuracy}=payload||{};
  const c=String(room||'').toUpperCase();
  // A client may broadcast only after the server has admitted it to this room.
  if(!c || !socket.rooms.has(c) || !Number.isFinite(lat) || !Number.isFinite(lon) ||
     Math.abs(lat)>90 || Math.abs(lon)>180) return;
  const item={userId:socket.user.sub,name:socket.user.name,lat,lon,accuracy:accuracy??null,updatedAt:Date.now(),room:c};
  live.set(socket.user.sub,item);
  socket.to(c).emit('location:peer',item);
 });
 socket.on('disconnect',()=>{ const item=live.get(socket.user.sub); if(item){live.delete(socket.user.sub);socket.to(item.room).emit('location:left',{userId:socket.user.sub});} });
});
const port=process.env.PORT||3000;
server.listen(port,()=>console.log(`VYORA listening on ${port}`));
