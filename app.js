/* ====================================================
   ADZAN PRO - FINAL PRODUCTION BY ARIADI FORESTER
==================================================== */

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

/* ================
   HELPER: FORMAT
================ */
// Ubah angka desimal
function formatWaktuManual(time) {
    if (typeof time === 'string' && time.includes(':')) return time.substring(0, 5);
    
    let hours = Math.floor(time);
    let minutes = Math.round((time - hours) * 60);
    if (minutes === 60) { hours++; minutes = 0; }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

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
   INIT METODE
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
  praytime = new PrayTime(saved);

  metodeSelect.addEventListener("change", () => {
    localStorage.setItem("metode", metodeSelect.value);
    praytime = new PrayTime(metodeSelect.value);
    loadJadwal();
  });
}

/* =============
   GEOLOKASI
============= */
function capitalizeWords(str) { return str.replace(/\b\w/g, l => l.toUpperCase()); }
function bersihkanKabupaten(text) { return text ? text.replace(/^Kabupaten\s+/i, "").replace(/^Kota\s+/i, "") : ""; }

async function getGeoData() {
    const lokasiEl = document.getElementById('namaLokasi'); // Elemen Utama
    const locEl = document.getElementById('koordinat');     // Elemen Koordinat Utama
    const compLokasi = document.getElementById('compassLokasi'); // Elemen Kompas
    const compKoord = document.getElementById('compassKoordinat');

    // 1. Update teks koordinat angka
    const koordinatTeks = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
    if (locEl) locEl.innerText = koordinatTeks;
    if (compKoord) compKoord.innerText = koordinatTeks;

    try {
        if (lokasiEl) lokasiEl.innerText = "Mencari lokasi...";

        // Sesuai script Anda: format=json dan accept-language=id
        const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json&accept-language=id`,
            { headers: { "User-Agent": "AdzanPro/1.0" } }
        );
        
        if (!r.ok) throw new Error("Gagal mengambil data");
        
        const d = await r.json();
        const a = d.address || {};
        
        // 2. Susun komponen alamat secara hierarkis (Persis Script Anda)
        const komponenAlamat = [
            a.village || a.suburb || a.town || a.city || "",
            a.district || a.county || "",                    
            a.state || "",                                                          
            a.country || ""                                  
        ];

        // 3. Gabungkan komponen alamat
        const alamatLengkap = komponenAlamat
            .filter(v => v && v.trim() !== "") 
            .join(", ");                  

        const hasilFinal = alamatLengkap ? "📍 " + alamatLengkap : "📍 Lokasi tidak dikenal";

        // Update ke semua elemen UI
        if (lokasiEl) lokasiEl.innerText = hasilFinal;
        if (compLokasi) compLokasi.innerText = hasilFinal;

    } catch (err) {
        console.error("Geocode Error:", err);
        if (lokasiEl) {
            lokasiEl.innerText = "Gagal memuat nama lokasi (Cek Koneksi)";
        }
    }
}

/* ===============
   LOAD JADWAL
=============== */
const namaSholatID = { fajr: "Subuh", sunrise: "Terbit", dhuhr: "Dzuhur", asr: "Ashar", maghrib: "Maghrib", isha: "Isya" };
const urutanSholat = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

function tampilkanJadwal(times) {
  if (!jadwalList) return;
  jadwalList.innerHTML = "";
  
  const now = new Date();
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
  
  let activeIndex = -1;

  // Sholat yang sedang aktif
  for (let i = 0; i < urutanSholat.length; i++) {
    const [h, m] = times[urutanSholat[i]].split(":").map(Number);
    const prayerTotalMinutes = h * 60 + m;

    if (currentTotalMinutes >= prayerTotalMinutes) {
      activeIndex = i;
    }
  }

  // Render elemen UI
  urutanSholat.forEach((key, index) => {
    const div = document.createElement("div");
    div.className = "jadwal-item";
    
    // Tambahkan class 'active' jika indeks sesuai
    if (index === activeIndex) {
      div.classList.add("active");
    }

    const jam = times[key] || "--:--";
    div.innerHTML = `<span>${namaSholatID[key]}</span><span>${jam}</span>`;
    jadwalList.appendChild(div);
  });
}

async function loadJadwal() {
  if (!userLat || !userLng) return;
  const now = new Date();
  
  const mValue = metodeSelect.value;
  const aladhanMethod = { MWL:3, ISNA:2, Egypt:5, Makkah:4, Karachi:1, Singapore:7, Kemenag:20 }[mValue] || 20;

  try {
    const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${aladhanMethod}`);
    const json = await res.json();
    const api = json.data.timings;
    currentTimes = {
      fajr: api.Fajr, sunrise: api.Sunrise, dhuhr: api.Dhuhr,
      asr: api.Asr, maghrib: api.Maghrib, isha: api.Isha
    };
  } catch (err) {
    // FALLBACK: Manual Format jika PrayTime kirim angka desimal
    const tz = -now.getTimezoneOffset() / 60;
    const raw = praytime.getTimes(now, [userLat, userLng], tz);
    currentTimes = {
      fajr: formatWaktuManual(raw.fajr),
      sunrise: formatWaktuManual(raw.sunrise),
      dhuhr: formatWaktuManual(raw.dhuhr),
      asr: formatWaktuManual(raw.asr),
      maghrib: formatWaktuManual(raw.maghrib),
      isha: formatWaktuManual(raw.isha)
    };
  }
  currentDateKey = now.toDateString();
  tampilkanJadwal(currentTimes);
  startCountdown();
}

/* =================================
   COUNTDOWN & TICKS & ORIENTASI
================================== */
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    if (!currentTimes) return;
    const now = new Date();
    
    // Update status card aktif secara otomatis setiap menit (detik 0)
    if (now.getSeconds() === 0) {
      tampilkanJadwal(currentTimes);
    }

    let nextName = null, nextDate = null;
    for (let key of urutanSholat) {
      const [h, m] = currentTimes[key].split(":").map(Number);
      const waktu = new Date(); waktu.setHours(h, m, 0, 0);
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

    document.getElementById("menuju").innerText = totalDetik <= 1800 ? `Sebentar lagi Waktu ${namaSholatID[nextName]}` : `Menuju Waktu ${namaSholatID[nextName]}`;
    document.getElementById("countdown").innerText = `${jam > 0 ? jam + ' jam ' : ''}${menit} menit ${detik} detik lagi`;
    
    if (totalDetik === 0) {
      checkNotification(nextName, 0);
      tampilkanJadwal(currentTimes); // Refresh jadwal saat waktu sholat tiba
    }
  }, 1000);
}

function checkNotification(name, diff) {
  if (diff === 0 && !notified[name]) {
    notified[name] = true;
    if (!audioEnabled) return;
    (name === "fajr") ? adzanSubuh.play() : adzanNormal.play();
  }
}

function createCompassTicks() {
  const container = document.getElementById("ticks");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < 360; i += 5) {
    const tick = document.createElement("div");
    tick.className = `tick ${i % 30 === 0 ? 'large' : (i % 10 === 0 ? 'medium' : 'small')}`;
    tick.style.transform = `rotate(${i}deg)`;
    container.appendChild(tick);
  }
}

function buatLabelPiringan() {
  const container = document.getElementById("directionLabels");
  if (!container) return;
  container.innerHTML = "";
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].forEach((l, i) => {
    const div = document.createElement("div");
    div.className = "direction-label";
    div.innerText = l;
    const angle = (i * 45) * Math.PI / 180;
    div.style.left = `${50 + Math.sin(angle) * 44}%`;
    div.style.top = `${50 - Math.cos(angle) * 44}%`;
    container.appendChild(div);
  });
}

function hitungKiblat() {
  const dLon = (KAABAH.lng - userLng) * Math.PI / 180;
  const lat1 = userLat * Math.PI / 180;
  const lat2 = KAABAH.lat * Math.PI / 180;
  
  // Hitung Sudut Azimuth
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  azimuthKiblat = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

  // Tampilkan Azimuth
  const azimuthEl = document.getElementById("azimuthKabah");
  if (azimuthEl) azimuthEl.innerText = `Azimuth Ka'bah : ${azimuthKiblat.toFixed(2)}°`;

  // Hitung jarak ke Ka'bah
  const jarak = haversine(userLat, userLng, KAABAH.lat, KAABAH.lng);
  const jarakEl = document.getElementById("jarakKabah");
  if (jarakEl) {
    jarakEl.innerText = `Jarak ke Ka'bah : ${jarak.toFixed(2)} Km`;
  }
}

// Hitung Haversine
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius bumi dalam Km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + 
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

window.addEventListener("deviceorientation", e => {
  if (e.alpha === null) return;
  
  // 1. Logika Pergerakan Kompas
  currentHeading = 360 - e.alpha;
  smoothHeading += (currentHeading - smoothHeading) * 0.1;

  // Putar Piringan dan Garis Kiblat
  document.getElementById("compassDisk").style.transform = `rotate(${-smoothHeading}deg)`;
  document.getElementById("qiblatLine").style.transform = `translate(-50%,-100%) rotate(${azimuthKiblat - smoothHeading}deg)`;
  
  // 2. Hitung Selisih Sudut
  const selisih = ((azimuthKiblat - smoothHeading + 540) % 360) - 180;
  document.getElementById("selisihSudut").innerText = `Selisih Sudut : ${Math.abs(selisih).toFixed(1)}°`;

  // 3. Arah mata angin dinamis
  const labelsLengkap = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
  
  // Konversi smoothHeading (0-360) ke indeks array (0-7)
  const index = Math.round(smoothHeading / 45) % 8;
  
  const arahEl = document.getElementById("arahMataAngin");
  if (arahEl) {
    arahEl.innerText = `Arah Mata Angin : ${labelsLengkap[index]}`;
  }
}, true);

/* ===============
   INITIALIZE
=============== */
function initApp() {
  initMetode();
  createCompassTicks();
  buatLabelPiringan();
  navigator.geolocation.getCurrentPosition(
    async pos => {
      userLat = pos.coords.latitude; userLng = pos.coords.longitude;
      await getGeoData(); hitungKiblat(); loadJadwal();
    },
    err => { document.getElementById("namaLokasi").innerText = "❌ GPS tidak aktif"; },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

document.getElementById("btnKiblat").onclick = () => { document.getElementById("overlay").style.display = "flex"; };
document.getElementById("closeCompass").onclick = () => { document.getElementById("overlay").style.display = "none"; };
document.getElementById("toggleAudio").onclick = () => {
  audioEnabled = !audioEnabled;
  document.getElementById("toggleAudio").innerText = audioEnabled ? "🔔 Audio ON" : "🔕 Audio OFF";
};

document.addEventListener("DOMContentLoaded", initApp);

/* ========================
   PERFORMANCE MONITOR
======================== */
function updatePerformanceLog() {
    // 1. Bersihkan console agar log tidak menumpuk
    console.clear();

    const now = new Date();
    
    // 2. Siapkan data untuk tabel
    const performanceData = [
        { Parameter: "Waktu Sistem", Value: now.toLocaleTimeString("id-ID") },
        { Parameter: "Status GPS", Value: (userLat && userLng) ? "✅ Aktif" : "❌ Mencari..." },
        { Parameter: "Latitude", Value: userLat ? userLat.toFixed(6) : "-" },
        { Parameter: "Longitude", Value: userLng ? userLng.toFixed(6) : "-" },
        { Parameter: "Azimuth Kiblat", Value: azimuthKiblat ? azimuthKiblat.toFixed(2) + "°" : "-" },
        { Parameter: "Heading (Smooth)", Value: smoothHeading ? smoothHeading.toFixed(1) + "°" : "-" },
        { Parameter: "Metode Hisab", Value: metodeSelect?.value || "Default" },
        { Parameter: "Audio Adzan", Value: audioEnabled ? "🔔 ON" : "🔕 OFF" },
        { Parameter: "Memory Usage", Value: window.performance.memory ? (window.performance.memory.usedJSHeapSize / 1048576).toFixed(2) + " MB" : "N/A" }
    ];

    // 3. Tampilkan Header
    console.log("%c ADZAN PRO - PERFORMANCE MONITORING ", "background: #2c3e50; color: #ecf0f1; font-weight: bold; padding: 5px; border-radius: 3px;");
    
    // 4. Tampilkan Tabel
    console.table(performanceData);

    // 5. Log Jadwal Aktif (untuk memastikan sinkronisasi data)
    if (currentTimes) {
        console.log("%c Jadwal Sholat Aktif: ", "font-weight: bold; color: #2980b9;");
        console.table(currentTimes);
    }
}

// Jalankan log setiap 30 detik agar tetap update tanpa membebani prosesor
setInterval(updatePerformanceLog, 30000);
