/* ====================================================
   ADZAN PRO - FINAL PRODUCTION BY ARIADI FORESTER
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
   REALTIME JAM & TANGGAL
========================== */
function updateClock() {
  const now = new Date();
  document.getElementById("jam").innerText =
    now.toLocaleTimeString("id-ID", { hour12:false });
  document.getElementById("tanggal").innerText =
    now.toLocaleDateString("id-ID", {
      weekday:"long",
      day:"numeric",
      month:"long",
      year:"numeric"
    });
}
setInterval(updateClock, 1000);
updateClock();

/* ============================
   INIT METODE HISAB
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

/* ================
   GPS
================ */
navigator.geolocation.getCurrentPosition(
  async pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;

    await getGeoData();
    hitungKiblat();
    loadJadwal();
  },
  err => {
    document.getElementById("namaLokasi").innerText =
      "❌ Izin lokasi ditolak / GPS tidak aktif";
  },
  { enableHighAccuracy:true, timeout:15000, maximumAge:0 }
);

/* =========================
   FORMAT NAMA LOKASI
========================= */
function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

function bersihkanKabupaten(text) {
  if (!text) return "";
  return text.replace(/^Kabupaten\s+/i, "").replace(/^Kota\s+/i, "");
}

/* =========================
   GEO REVERSE (NO WORKER)
========================= */
async function getGeoData() {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLng}`
    );
    const data = await res.json();

    const a = data.address || {};

    const desa = a.village || a.hamlet || "";
    const kecamatan = a.suburb || a.town || "";
    const kabupaten = bersihkanKabupaten(a.county || a.city || "");
    const provinsi = a.state || "";

    const lokasiParts = [desa, kecamatan, kabupaten, provinsi].filter(Boolean);
    const lokasiFinal = lokasiParts.length
      ? capitalizeWords(lokasiParts.join(", "))
      : "Lokasi Tidak Ditemukan";

    const namaText = "📍 " + lokasiFinal;

    // ✅ HANYA KOORDINAT (tanpa elevasi)
    const koordinatText = userLat.toFixed(6) + ", " + userLng.toFixed(6);

    document.getElementById("namaLokasi").innerText = namaText;
    document.getElementById("koordinat").innerText = koordinatText;

    document.getElementById("compassLokasi").innerText = namaText;
    document.getElementById("compassKoordinat").innerText = koordinatText;

  } catch (e) {
    document.getElementById("namaLokasi").innerText = "📍 Gagal memuat lokasi";
  }
}

/* ===============================
   NAMA SHOLAT
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
   TAMPILKAN JADWAL
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
   LOAD JADWAL
================================= */
async function loadJadwal(){
  if(!userLat || !userLng) return;

  const now = new Date();
  const todayKey = now.toDateString();
  if(currentDateKey === todayKey && currentTimes) return;

  currentDateKey = todayKey;
  notified = {};

  const metodeValue = localStorage.getItem("metode")||"Kemenag";
  const aladhanMethod = {
    MWL:3, ISNA:2, Egypt:5, Makkah:4,
    Karachi:1, Singapore:7, Kemenag:20
  }[metodeValue]||20;

  try {
    const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${aladhanMethod}`);
    const json = await res.json();

    const apiTimes = json.data.timings;

    currentTimes = {
      fajr: apiTimes.Fajr.substring(0,5),
      sunrise: apiTimes.Sunrise.substring(0,5),
      dhuhr: apiTimes.Dhuhr.substring(0,5),
      asr: apiTimes.Asr.substring(0,5),
      maghrib: apiTimes.Maghrib.substring(0,5),
      isha: apiTimes.Isha.substring(0,5)
    };

  } catch(err){
    const offlineTimes = praytime
      .location([userLat,userLng])
      .timezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
      .getTimes(now);

    currentTimes = {
      fajr: offlineTimes.fajr,
      sunrise: offlineTimes.sunrise,
      dhuhr: offlineTimes.dhuhr,
      asr: offlineTimes.asr,
      maghrib: offlineTimes.maghrib,
      isha: offlineTimes.isha
    };
  }

  tampilkanJadwal(currentTimes);
  startCountdown();
}

/* ============================
   COUNTDOWN
============================ */
function startCountdown(){
  if(countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(()=>{
    if(!currentTimes) return;

    const now = new Date();

    let nextName=null, nextDate=null;

    for(let key of urutanSholat){
      const [h,m]=currentTimes[key].split(":").map(Number);
      const t=new Date();
      t.setHours(h,m,0,0);
      if(t>now){ nextName=key; nextDate=t; break; }
    }

    if(!nextDate){
      const [h,m]=currentTimes.fajr.split(":").map(Number);
      nextDate=new Date();
      nextDate.setDate(nextDate.getDate()+1);
      nextDate.setHours(h,m,0,0);
      nextName="fajr";
    }

    const diff=nextDate-now;
    const mnt=Math.floor(diff/60000);
    const jam=Math.floor(mnt/60);
    const menit=mnt%60;

    document.getElementById("menuju").innerText =
      `Menuju Waktu ${labelSholat(nextName)}`;

    document.getElementById("countdown").innerText =
      `${jam} jam ${menit} menit lagi`;

  },1000);
}

/* ===============================
   KIBLAT
================================= */
function hitungKiblat(){
  const dLon = (KAABAH.lng - userLng) * Math.PI/180;
  const lat1 = userLat * Math.PI/180;
  const lat2 = KAABAH.lat * Math.PI/180;

  const y = Math.sin(dLon)*Math.cos(lat2);
  const x = Math.cos(lat1)*Math.sin(lat2) -
            Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);

  azimuthKiblat = (Math.atan2(y,x)*180/Math.PI+360)%360;
}

/* ===============================
   KOMPAS & ARAH MATA ANGIN
================================= */
const arahMataAnginLabel = [
  "Utara","Timur Laut","Timur","Tenggara",
  "Selatan","Barat Daya","Barat","Barat Laut"
];

const arahMataAnginSingkat = ["N","NE","E","SE","S","SW","W","NW"];

const directionLabelsContainer = document.getElementById("directionLabels");

// Label arah di lingkaran kompas
function buatLabelPiringan() {
  if(!directionLabelsContainer) return;

  arahMataAnginSingkat.forEach((label,index)=>{
    const div = document.createElement("div");
    div.className = "direction-label";
    div.innerText = label;

    const angle = (index * 360 / arahMataAnginSingkat.length) * Math.PI / 180;
    const x = 50 + Math.sin(angle) * 50;
    const y = 50 - Math.cos(angle) * 50;

    div.style.left = `${x}%`;
    div.style.top = `${y}%`;

    directionLabelsContainer.appendChild(div);
  });
}
buatLabelPiringan();

/* =====================
   GARIS TICK KOMPAS 360°
===================== */
function createCompassTicks(){
  const container = document.getElementById("ticks");
  if(!container) return;

  container.innerHTML = "";

  for(let i=0;i<360;i+=5){
    const tick = document.createElement("div");

    tick.classList.add("tick");

    if(i%30===0) tick.classList.add("large");
    else if(i%10===0) tick.classList.add("medium");
    else tick.classList.add("small");

    if(i===0) tick.classList.add("north");

    tick.style.transform = `rotate(${i}deg)`;

    container.appendChild(tick);
  }
}
createCompassTicks();

/* =====================
   SENSOR ORIENTASI HP
===================== */
window.addEventListener("deviceorientation", e=>{
  if(e.alpha === null) return;

  // Heading dari sensor
  currentHeading = 360 - e.alpha;

  // Smooth biar tidak goyang
  smoothHeading += (currentHeading - smoothHeading) * 0.1;

  // Putar kompas
  const disk = document.getElementById("compassDisk");
  if(disk){
    disk.style.transform = `rotate(${-smoothHeading}deg)`;
  }

  // Garis arah kiblat
  const qiblatLine = document.getElementById("qiblatLine");
  if(qiblatLine){
    qiblatLine.style.transform =
      `translate(-50%,-100%) rotate(${azimuthKiblat - smoothHeading}deg)`;
  }

  // Selisih sudut
  const selisih = ((azimuthKiblat - smoothHeading + 540)%360)-180;
  const selisihEl = document.getElementById("selisihSudut");
  if(selisihEl){
    selisihEl.innerText =
      `Selisih Sudut : ${Math.abs(selisih).toFixed(1)}°`;
  }

  // Arah mata angin (teks)
  const index = Math.round(smoothHeading / 45) % 8;
  const arahEl = document.getElementById("arahMataAngin");
  if(arahEl){
    arahEl.innerText = arahMataAnginLabel[index];
  }
});

/* ==================
   OVERLAY KOMPAS
================== */
document.getElementById("btnKiblat").onclick = ()=>{
  document.getElementById("overlay").style.display = "flex";
};

document.getElementById("closeCompass").onclick = ()=>{
  document.getElementById("overlay").style.display = "none";
};
