/* =================================
   ADZAN PRO - FINAL PRODUCTION
================================= */

const KAABAH = { lat: 21.4225, lng: 39.8262 };

// State Global
let praytime;
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

// Audio
const adzanSubuh = new Audio("audio/adzan_subuh.mp3");
const adzanNormal = new Audio("audio/adzan_normal.mp3");

// Ambil Elemen DOM
const metodeSelect = document.getElementById("metode");
const jadwalList = document.getElementById("jadwalList");

/* ==========================
   REALTIME JAM & TANGGAL
========================== */
function updateClock() {
  const now = new Date();
  const jamEl = document.getElementById("jam");
  const tglEl = document.getElementById("tanggal");
  if (jamEl) jamEl.innerText = now.toLocaleTimeString("id-ID", { hour12: false });
  if (tglEl) tglEl.innerText = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
setInterval(updateClock, 1000);
updateClock();

/* ============================
   INIT METODE HITUNG HISAB
============================ */
const metodeList = {
  MWL: "Muslim World League",
  ISNA: "ISNA",
  Egypt: "Egypt",
  Makkah: "Umm Al-Qura",
  Karachi: "Karachi",
  Singapore: "Singapore",
  Kemenag: "Kemenag / MABIMS"
};

function initMetode() {
  if (!metodeSelect) return;
  metodeSelect.innerHTML = "";
  Object.keys(metodeList).forEach(key => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = metodeList[key];
    metodeSelect.appendChild(opt);
  });

  const saved = localStorage.getItem("metode") || "Kemenag";
  metodeSelect.value = saved;
  
  // Inisialisasi PrayTime
  praytime = new PrayTime(saved);

  // DETEKSI FUNGSI FORMAT (Agar tidak TypeError)
  if (typeof praytime.setFormat === 'function') {
    praytime.setFormat('24h');
  } else if (typeof praytime.setTimeFormat === 'function') {
    praytime.setTimeFormat('24h');
  } else {
    // Jika keduanya tidak ada, kita atur manual lewat properti jika memungkinkan
    praytime.timeFormat = '24h';
  }

  metodeSelect.addEventListener("change", () => {
    localStorage.setItem("metode", metodeSelect.value);
    praytime = new PrayTime(metodeSelect.value);
    
    // Ulangi pengecekan saat ganti metode
    if (typeof praytime.setFormat === 'function') praytime.setFormat('24h');
    else if (typeof praytime.setTimeFormat === 'function') praytime.setTimeFormat('24h');
    
    loadJadwal();
  });
}

/* ===============================
   NOMINATIM INLINE (REPLACING WORKER)
================================= */
function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

function bersihkanKabupaten(text) {
  if (!text) return "";
  return text.replace(/^Kabupaten\s+/i, "").replace(/^Kota\s+/i, "");
}

async function getGeoData() {
  try {
    // Memberikan header User-Agent sederhana agar Nominatim lebih kooperatif
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userLat}&lon=${userLng}`, 
      {
        headers: {
          "Accept-Language": "id-ID",
          "User-Agent": "AdzanProApp/1.0" 
        }
      }
    );
    
    const data = await res.json();
    const addr = data.address || {};

    // Nominatim menggunakan lon (bukan lng) di parameter URL, 
    // dan strukturnya sering meletakkan nama daerah di key yang bervariasi.
    const desa = addr.village || addr.suburb || addr.hamlet || addr.neighbourhood || addr.village || "";
    const kecamatan = addr.city_district || addr.district || addr.municipality || "";
    const kabupaten = bersihkanKabupaten(addr.city || addr.county || addr.town || addr.city_city || "");
    const provinsi = addr.state || "";

    // Gabungkan bagian lokasi
    let lokasiParts = [desa, kecamatan, kabupaten, provinsi].filter(Boolean);
    
    // Jika array masih kosong atau terlalu pendek, ambil potongan dari display_name
    let lokasiFinal;
    if (lokasiParts.length >= 2) {
      lokasiFinal = capitalizeWords(lokasiParts.join(", "));
    } else if (data.display_name) {
      // Ambil 3 bagian pertama dari display_name (biasanya Jalan, Desa, Kec)
      lokasiFinal = data.display_name.split(',').slice(0, 3).join(',').trim();
    } else {
      lokasiFinal = "Lokasi Tidak Spesifik";
    }

    const namaText = "📍 " + lokasiFinal;
    const koordinatText = userLat.toFixed(6) + ", " + userLng.toFixed(6);

    // Update Halaman Utama
    document.getElementById("namaLokasi").innerText = namaText;
    document.getElementById("koordinat").innerText = koordinatText;

    // Update Overlay Kompas
    const cLokasi = document.getElementById("compassLokasi");
    const cKoord = document.getElementById("compassKoordinat");
    if (cLokasi) cLokasi.innerText = namaText;
    if (cKoord) cKoord.innerText = koordinatText;

  } catch (e) {
    console.error("Geocode error:", e);
    document.getElementById("namaLokasi").innerText = "📍 Gagal memuat alamat";
  }
}

/* ===============================
   JADWAL SHOLAT LOGIC
================================= */
const namaSholatID = { fajr: "Subuh", sunrise: "Terbit", dhuhr: "Dzuhur", asr: "Ashar", maghrib: "Maghrib", isha: "Isya" };
const urutanSholat = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

function labelSholat(key) { return namaSholatID[key] || key; }

function tampilkanJadwal(times) {
  if (!jadwalList) return;
  jadwalList.innerHTML = "";
  urutanSholat.forEach(key => {
    const div = document.createElement("div");
    div.className = "jadwal-item";
    const jam = times[key]?.substring(0, 5) || "--:--";
    div.innerHTML = `<span>${labelSholat(key)}</span><span>${jam}</span>`;
    jadwalList.appendChild(div);
  });
}

async function loadJadwal(){
  if(!userLat || !userLng) return;

  const now = new Date();
  const todayKey = now.toDateString();
  
  // Reset state
  notified = {};
  const metodeValue = metodeSelect.value;
  const aladhanMethod = {
    MWL:3, ISNA:2, Egypt:5, Makkah:4,
    Karachi:1, Singapore:7, Kemenag:20
  }[metodeValue]||20;

  try {
    // 1. Coba ambil dari API Aladhan (Sangat Akurat)
    const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${aladhanMethod}`);
    const json = await res.json();
    
    if(json.code === 200) {
      const apiTimes = json.data.timings;
      currentTimes = {
        fajr: apiTimes.Fajr,
        sunrise: apiTimes.Sunrise,
        dhuhr: apiTimes.Dhuhr,
        asr: apiTimes.Asr,
        maghrib: apiTimes.Maghrib,
        isha: apiTimes.Isha
      };
      currentDateKey = todayKey;
    } else {
      throw new Error("API Response Error");
    }

  } catch(err){
    console.warn("API gagal, menggunakan offline PrayTime", err);
    // 2. Fallback Offline (Perbaikan Parameter)
    // Gunakan offset timezone lokal agar tidak muncul 00:xx
    const timezone = -now.getTimezoneOffset() / 60; 
    const offlineTimes = praytime.getTimes(now, [userLat, userLng], timezone);
    
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
   HITUNG MUNDUR & PERINGATAN
============================ */
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    if (!currentTimes) return;
    const now = new Date();
    
    let nextName = null, nextDate = null;
    for (let key of urutanSholat) {
      const [h, m] = currentTimes[key].split(":").map(Number);
      const waktu = new Date();
      waktu.setHours(h, m, 0, 0);
      if (waktu > now) { nextName = key; nextDate = waktu; break; }
    }
    
    if (!nextDate) {
      const [h, m] = currentTimes["fajr"].split(":").map(Number);
      nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 1);
      nextDate.setHours(h, m, 0, 0); nextName = "fajr";
    }

    const totalDetik = Math.floor((nextDate - now) / 1000);
    const jam = Math.floor(totalDetik / 3600);
    const menit = Math.floor((totalDetik % 3600) / 60);
    const detik = totalDetik % 60;

    let teksWaktu = jam > 0 ? `${jam} jam ${menit} menit ${detik} detik lagi` : `${menit} menit ${detik} detik lagi`;

    document.getElementById("menuju").innerText = totalDetik <= 1800 ? `Sebentar lagi Waktu ${labelSholat(nextName)}` : `Menuju Waktu ${labelSholat(nextName)}`;
    document.getElementById("countdown").innerText = teksWaktu;

    checkNearPrayer();
    if (totalDetik === 0) checkNotification(nextName, 0);
  }, 1000);
}

function checkNearPrayer() {
  if (!currentTimes) return;
  const now = new Date();
  const currentTotalMin = now.getHours() * 60 + now.getMinutes();
  const alertText = document.getElementById("prayerAlert");
  let found = false;

  for (let key of urutanSholat) {
    const [h, m] = currentTimes[key].split(":").map(Number);
    const prayerTotalMin = h * 60 + m;
    const diff = prayerTotalMin - currentTotalMin;
    if (diff > 0 && diff <= 10) {
      alertText.textContent = `⏰ ${labelSholat(key)} sebentar lagi (${currentTimes[key].substring(0,5)})`;
      alertText.classList.add("blink-text");
      found = true;
      break;
    }
  }
  if (!found) {
    alertText.textContent = "";
    alertText.classList.remove("blink-text");
  }
}

/* ======================
   NOTIFIKASI & AUDIO
====================== */
function checkNotification(name, diff) {
  if (diff === 0 && !notified[name]) {
    notified[name] = true;
    if (!audioEnabled) return;
    if (name === "fajr") adzanSubuh.play();
    else adzanNormal.play();
    if (Notification.permission === "granted") {
      new Notification("Adzan Pro", { body: `Waktu ${labelSholat(name)} telah tiba` });
    }
  }
}

document.getElementById("toggleAudio").onclick = () => {
  audioEnabled = !audioEnabled;
  document.getElementById("toggleAudio").innerText = audioEnabled ? "🔔 Audio ON" : "🔕 Audio OFF";
};

/* ===============================
   KOMPAS: TICKS & LABELS
================================= */
function createCompassTicks() {
  const container = document.getElementById("ticks");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < 360; i += 5) {
    const tick = document.createElement("div");
    tick.classList.add("tick");
    if (i % 30 === 0) tick.classList.add("large");
    else if (i % 10 === 0) tick.classList.add("medium");
    else tick.classList.add("small");
    tick.style.transform = `rotate(${i}deg)`;
    container.appendChild(tick);
  }
}

function buatLabelPiringan() {
  const container = document.getElementById("directionLabels");
  if (!container) return;
  container.innerHTML = "";
  const labelsSingkat = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  labelsSingkat.forEach((label, index) => {
    const div = document.createElement("div");
    div.className = "direction-label";
    div.innerText = label;
    const angle = (index * 45) * Math.PI / 180;
    const x = 50 + Math.sin(angle) * 44; // Jarak label dari pusat
    const y = 50 - Math.cos(angle) * 44;
    div.style.left = `${x}%`;
    div.style.top = `${y}%`;
    container.appendChild(div);
  });
}

/* ===============================
   KIBLAT & ORIENTASI
================================= */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hitungKiblat() {
  const dLon = (KAABAH.lng - userLng) * Math.PI / 180;
  const lat1 = userLat * Math.PI / 180;
  const lat2 = KAABAH.lat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  azimuthKiblat = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

  document.getElementById("azimuthKabah").innerText = `Azimuth Ka'bah : ${azimuthKiblat.toFixed(2)}°`;
  const jarak = haversine(userLat, userLng, KAABAH.lat, KAABAH.lng);
  document.getElementById("jarakKabah").innerText = `Jarak ke Ka'bah : ${jarak.toFixed(2)} Km`;
}

window.addEventListener("deviceorientation", e => {
  if (e.alpha === null) return;
  currentHeading = 360 - e.alpha;
  smoothHeading += (currentHeading - smoothHeading) * 0.1;

  document.getElementById("compassDisk").style.transform = `rotate(${-smoothHeading}deg)`;
  document.getElementById("qiblatLine").style.transform = `translate(-50%,-100%) rotate(${azimuthKiblat - smoothHeading}deg)`;
  
  const selisih = ((azimuthKiblat - smoothHeading + 540) % 360) - 180;
  document.getElementById("selisihSudut").innerText = `Selisih Sudut : ${Math.abs(selisih).toFixed(1)}°`;

  const labelsLengkap = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  const index = Math.round(smoothHeading / 45) % 8;
  document.getElementById("arahMataAngin").innerText = labelsLengkap[index];
}, true);

/* ===============================
   GPS & INITIALIZE
================================= */
function initApp() {
  initMetode();
  createCompassTicks();
  buatLabelPiringan();

  navigator.geolocation.getCurrentPosition(
    async pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      await getGeoData();
      hitungKiblat();
      loadJadwal();
    },
    err => {
      document.getElementById("namaLokasi").innerText = "❌ GPS tidak aktif";
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

document.getElementById("btnKiblat").onclick = () => { document.getElementById("overlay").style.display = "flex"; };
document.getElementById("closeCompass").onclick = () => { document.getElementById("overlay").style.display = "none"; };

document.addEventListener("DOMContentLoaded", initApp);
