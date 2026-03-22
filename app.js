/* ====================================================
   ADZAN PRO - FINAL FULL FEATURE (FRONTEND ONLY)
==================================================== */

const KAABAH = { lat: 21.4225, lng: 39.8262 };

let countdownInterval = null;
let currentTimes = null;
let currentDateKey = null;
let userLat = null;
let userLng = null;
let azimuthKiblat = 0;
let currentHeading = 0;
let smoothHeading = 0;
let audioEnabled = true;
let notified = {};

const adzanSubuh = new Audio("audio/adzan_subuh.mp3");
const adzanNormal = new Audio("audio/adzan_normal.mp3");

const metodeSelect = document.getElementById("metode");
const jadwalList = document.getElementById("jadwalList");

/* ==========================
   1. REALTIME JAM & TANGGAL
========================== */
function updateClock() {
  const now = new Date();
  document.getElementById("jam").innerText =
    now.toLocaleTimeString("id-ID", { hour12:false });
  document.getElementById("tanggal").innerText =
    now.toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
}
setInterval(updateClock, 1000);
updateClock();

/* ============================
   2. INIT METODE HISAB
============================ */
let praytime;
const metodeList = {
  MWL:"Muslim World League",
  ISNA:"ISNA",
  Egypt:"Egypt",
  Makkah:"Umm Al-Qura",
  Karachi:"Karachi",
  Singapore:"Singapore",
  Kemenag:"Kemenag / MABIMS"
};

function initMetode() {
  Object.keys(metodeList).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = metodeList[key];
    metodeSelect.appendChild(opt);
  });

  const saved = localStorage.getItem("metode") || "Kemenag";
  metodeSelect.value = saved;
  praytime = new PrayTime(saved);

  metodeSelect.addEventListener("change", () => {
    localStorage.setItem("metode", metodeSelect.value);
    praytime = new PrayTime(metodeSelect.value);
    loadJadwal();
  });
}
initMetode();

/* ==========================
   3. GPS + LOKASI
========================== */
navigator.geolocation.getCurrentPosition(
  async pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;

    await getGeoData();
    hitungKiblat();
    loadJadwal();
  },
  () => {
    document.getElementById("namaLokasi").innerText =
      "❌ Izin lokasi ditolak";
  },
  { enableHighAccuracy:true }
);

function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

/* ==========================
   REVERSE GEOCODING (FRONTEND)
========================== */
async function getGeoData() {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`,
      { headers: { "User-Agent": "AdzanProApp" } }
    );

    const data = await res.json();
    const addr = data.address || {};

    const desa = addr.village || addr.town || "";
    const kecamatan = addr.suburb || addr.city_district || "";
    const kabupaten = addr.county || "";
    const provinsi = addr.state || "";

    const lokasi = [desa,kecamatan,kabupaten,provinsi].filter(Boolean).join(", ");

    const namaText = "📍 " + capitalizeWords(lokasi);
    const koordinatText = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;

    document.getElementById("namaLokasi").innerText = namaText;
    document.getElementById("koordinat").innerText = koordinatText;

    document.getElementById("compassLokasi").innerText = namaText;
    document.getElementById("compassKoordinat").innerText = koordinatText;

  } catch {
    document.getElementById("namaLokasi").innerText = "📍 Gagal memuat lokasi";
  }
}

/* ===============================
   4. NAMA SHOLAT
================================= */
const namaSholatID = {
  fajr:"Subuh",
  sunrise:"Terbit",
  dhuhr:"Dzuhur",
  asr:"Ashar",
  maghrib:"Maghrib",
  isha:"Isya"
};
function labelSholat(key){ return namaSholatID[key]||key; }
const urutanSholat = ["fajr","sunrise","dhuhr","asr","maghrib","isha"];

/* ===============================
   5. TAMPILKAN JADWAL
================================= */
function tampilkanJadwal(times){
  jadwalList.innerHTML = "";
  Object.keys(namaSholatID).forEach(key => {
    const div = document.createElement("div");
    div.className = "jadwal-item";
    const jam = times[key]?.substring(0,5) || "--:--";
    div.innerHTML = `<span>${labelSholat(key)}</span><span>${jam}</span>`;
    jadwalList.appendChild(div);
  });
}

/* ===============================
   6. LOAD JADWAL
================================= */
async function loadJadwal(){
  if(!userLat) return;

  const now = new Date();
  const todayKey = now.toDateString();
  if(currentDateKey === todayKey && currentTimes) return;

  currentDateKey = todayKey;
  notified = {};

  const metodeValue = localStorage.getItem("metode")||"Kemenag";
  const method = { MWL:3, ISNA:2, Egypt:5, Makkah:4, Karachi:1, Singapore:7, Kemenag:20 }[metodeValue]||20;

  try {
    const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${method}`);
    const json = await res.json();
    const t = json.data.timings;

    currentTimes = {
      fajr:t.Fajr.substring(0,5),
      sunrise:t.Sunrise.substring(0,5),
      dhuhr:t.Dhuhr.substring(0,5),
      asr:t.Asr.substring(0,5),
      maghrib:t.Maghrib.substring(0,5),
      isha:t.Isha.substring(0,5)
    };

  } catch {
    const t = praytime.location([userLat,userLng]).getTimes(now);
    currentTimes = t;
  }

  tampilkanJadwal(currentTimes);
  startCountdown();
}

/* ============================
   7. COUNTDOWN & ALERT
============================ */
function startCountdown(){
  if(countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(()=>{
    if(!currentTimes) return;

    const now = new Date();
    let nextName=null,nextDate=null;

    for(let key of urutanSholat){
      const [h,m] = currentTimes[key].split(":");
      const d = new Date();
      d.setHours(h,m,0,0);
      if(d>now){ nextName=key; nextDate=d; break; }
    }

    if(!nextDate){
      const [h,m] = currentTimes.fajr.split(":");
      nextDate=new Date(); nextDate.setDate(nextDate.getDate()+1);
      nextDate.setHours(h,m,0,0);
      nextName="fajr";
    }

    const diff = Math.floor((nextDate-now)/1000);
    const h = Math.floor(diff/3600);
    const m = Math.floor((diff%3600)/60);
    const s = diff%60;

    document.getElementById("menuju").innerText =
      `Menuju ${labelSholat(nextName)}`;
    document.getElementById("countdown").innerText =
      `${h}j ${m}m ${s}d`;

    checkNearPrayer();
    if(diff===0) checkNotification(nextName,0);

  },1000);
}

/* ======================
   8. NOTIFIKASI
====================== */
function checkNearPrayer(){
  if(!currentTimes) return;
  const now = new Date();
  const minutesNow = now.getHours()*60+now.getMinutes();

  for(let key of urutanSholat){
    const [h,m]=currentTimes[key].split(":");
    const diff = (h*60+m)-minutesNow;
    if(diff>0 && diff<=10){
      document.getElementById("prayerAlert").innerText =
        `⏰ ${labelSholat(key)} sebentar lagi`;
      return;
    }
  }
  document.getElementById("prayerAlert").innerText="";
}

function checkNotification(name){
  if(notified[name]) return;
  notified[name]=true;

  if(audioEnabled){
    if(name==="fajr") adzanSubuh.play();
    else adzanNormal.play();
  }

  if(Notification.permission==="granted"){
    new Notification("Adzan Pro",{body:`Waktu ${labelSholat(name)} telah tiba`});
  }
}
Notification.requestPermission();

/* ======================
   9. TOGGLE AUDIO
====================== */
document.getElementById("toggleAudio").onclick=()=>{
  audioEnabled=!audioEnabled;
  document.getElementById("toggleAudio").innerText =
    audioEnabled ? "🔔 Audio ON" : "🔕 Audio OFF";
};

/* ===============================
   10. HITUNG KIBLAT
================================= */
function hitungKiblat(){
  const dLon=(KAABAH.lng-userLng)*Math.PI/180;
  const lat1=userLat*Math.PI/180;
  const lat2=KAABAH.lat*Math.PI/180;

  const y=Math.sin(dLon)*Math.cos(lat2);
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);

  azimuthKiblat=(Math.atan2(y,x)*180/Math.PI+360)%360;

  document.getElementById("azimuthKabah").innerText =
    `Azimuth Ka'bah : ${azimuthKiblat.toFixed(2)}°`;
}

/* ===============================
   11. KOMPAS & MATA ANGIN
================================= */
const arahLabel=["Utara","Timur Laut","Timur","Tenggara","Selatan","Barat Daya","Barat","Barat Laut"];

function buatLabelPiringan(){
  const container=document.getElementById("directionLabels");
  ["N","NE","E","SE","S","SW","W","NW"].forEach((t,i)=>{
    const d=document.createElement("div");
    d.className="direction-label";
    d.innerText=t;
    d.style.transform=`rotate(${i*45}deg) translate(80px)`;
    container.appendChild(d);
  });
}
buatLabelPiringan();

/* =====================
   12. JARUM KOMPAS
===================== */
function createCompassTicks(){
  const c=document.getElementById("ticks");
  for(let i=0;i<360;i+=5){
    const t=document.createElement("div");
    t.className="tick";
    t.style.transform=`rotate(${i}deg)`;
    c.appendChild(t);
  }
}
createCompassTicks();

/* =====================
   13. ORIENTASI DEVICE
===================== */
window.addEventListener("deviceorientation", e=>{
  if(e.alpha===null) return;

  currentHeading=360-e.alpha;
  smoothHeading+=(currentHeading-smoothHeading)*0.1;

  document.getElementById("compassDisk").style.transform =
    `rotate(${-smoothHeading}deg)`;

  document.getElementById("qiblatLine").style.transform =
    `rotate(${azimuthKiblat-smoothHeading}deg)`;

  const idx=Math.round(smoothHeading/45)%8;
  document.getElementById("arahMataAngin").innerText=arahLabel[idx];
});

/* ==================
   14. OVERLAY KOMPAS
================== */
document.getElementById("btnKiblat").onclick=()=>{
  document.getElementById("overlay").style.display="flex";
};
document.getElementById("closeCompass").onclick=()=>{
  document.getElementById("overlay").style.display="none";
};
