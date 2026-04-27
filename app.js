/* ====================================================
   ADZAN PRO - FINAL PRODUCTION BY ARIADI FORESTER
==================================================== */

const KAABAH = { lat: 21.4225, lng: 39.8262 };

// State Global
let praytime;
let countdownInterval = null;
let currentTimes = null;
let userLat = -6.1751; // Default Jakarta agar tidak blank
let userLng = 106.8272;
let azimuthKiblat = 0;
let smoothHeading = 0;
let audioEnabled = true;
let notified = {};

// Audio
const adzanSubuh = new Audio("audio/adzan_subuh.mp3");
const adzanNormal = new Audio("audio/adzan_normal.mp3");

/* ==========================
   JAM & TANGGAL
========================== */
function updateClock() {
    const now = new Date();
    const jamEl = document.getElementById("jam");
    const tglEl = document.getElementById("tanggal");
    if(jamEl) jamEl.innerText = now.toLocaleTimeString("id-ID", { hour12: false });
    if(tglEl) tglEl.innerText = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
setInterval(updateClock, 1000);
updateClock();

/* ============================
   INISIALISASI METODE (SAFE)
============================ */
function initMetode() {
    const metodeSelect = document.getElementById("metode");
    if(!metodeSelect) return;

    const daftarMode = {
        Kemenag: "Kemenag / MABIMS",
        Makkah: "Umm Al-Qura (Makkah)",
        MWL: "Muslim World League",
        ISNA: "ISNA",
        Egypt: "Egypt",
        Karachi: "Karachi",
        Singapore: "Singapore"
    };

    metodeSelect.innerHTML = "";
    Object.keys(daftarMode).forEach(key => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = daftarMode[key];
        metodeSelect.appendChild(opt);
    });

    const saved = localStorage.getItem("metode") || "Kemenag";
    metodeSelect.value = saved;

    // Proteksi Library
    try {
        praytime = new PrayTime(saved);
        // Gunakan cara paling universal untuk set format 24 jam
        if(praytime.setFormat) praytime.setFormat('24h');
        else if(praytime.setTimeFormat) praytime.setTimeFormat('24h');
    } catch (e) {
        console.error("Gagal inisialisasi PrayTime:", e);
    }

    metodeSelect.addEventListener("change", () => {
        localStorage.setItem("metode", metodeSelect.value);
        if(praytime) praytime.setMethod(metodeSelect.value);
        loadJadwal();
    });
}

/* ===============================
   NOMINATIM INLINE
================================= */
async function getGeoData() {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userLat}&lng=${userLng}`, {
            headers: { "Accept-Language": "id-ID" }
        });
        const data = await res.json();
        const addr = data.address || {};
        const lokasi = [addr.village || addr.suburb, addr.city_district || addr.district, addr.city || addr.county]
                        .filter(Boolean).join(", ");
        
        document.getElementById("namaLokasi").innerText = "📍 " + (lokasi || "Lokasi Ditemukan");
        document.getElementById("koordinat").innerText = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
    } catch (e) {
        document.getElementById("namaLokasi").innerText = "📍 Lokasi Berhasil Didapat";
    }
}

/* ===============================
   LOAD & TAMPILKAN JADWAL
================================= */
const namaSholatID = { fajr: "Subuh", sunrise: "Terbit", dhuhr: "Dzuhur", asr: "Ashar", maghrib: "Maghrib", isha: "Isya" };

function tampilkanJadwal(times) {
    const list = document.getElementById("jadwalList");
    if (!list || !times) return;
    list.innerHTML = "";
    ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"].forEach(key => {
        const div = document.createElement("div");
        div.className = "jadwal-item";
        const jam = times[key] ? times[key].toString().substring(0, 5) : "--:--";
        div.innerHTML = `<span>${namaSholatID[key]}</span><span>${jam}</span>`;
        list.appendChild(div);
    });
}

async function loadJadwal() {
    if (!userLat || !userLng) return;
    const now = new Date();

    // 1. Ambil Internal (Anti-Stuck)
    try {
        // Beberapa versi praytime butuh timezone offset (now.getTimezoneOffset() / -60)
        const times = praytime.getTimes(now, [userLat, userLng], "auto");
        currentTimes = times;
        tampilkanJadwal(currentTimes);
        startCountdown();
    } catch (e) {
        console.error("Gagal hitung internal:", e);
    }

    // 2. Ambil API (Update)
    const m = document.getElementById("metode")?.value || "Kemenag";
    const aladhanMethod = { MWL:3, ISNA:2, Egypt:5, Makkah:4, Karachi:1, Singapore:7, Kemenag:20 }[m] || 20;
    try {
        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${aladhanMethod}`);
        const json = await res.json();
        if (json.data) {
            const api = json.data.timings;
            currentTimes = { fajr: api.Fajr, sunrise: api.Sunrise, dhuhr: api.Dhuhr, asr: api.Asr, maghrib: api.Maghrib, isha: api.Isha };
            tampilkanJadwal(currentTimes);
        }
    } catch (e) {}
}

/* ============================
   COUNTDOWN & KIBLAT
============================ */
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        if (!currentTimes) return;
        const now = new Date();
        let nextName = null, nextDate = null;
        
        for (let key of ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]) {
            const t = currentTimes[key].split(":");
            const d = new Date(); d.setHours(t[0], t[1], 0, 0);
            if (d > now) { nextName = key; nextDate = d; break; }
        }
        
        if (!nextDate) {
            const t = currentTimes["fajr"].split(":");
            nextDate = new Date(); nextDate.setDate(nextDate.getDate()+1);
            nextDate.setHours(t[0], t[1], 0, 0); nextName = "fajr";
        }

        const s = Math.floor((nextDate - now) / 1000);
        document.getElementById("countdown").innerText = `${Math.floor(s/3600)}j ${Math.floor((s%3600)/60)}m ${s%60}s lagi`;
        document.getElementById("menuju").innerText = `Menuju ${namaSholatID[nextName]}`;
    }, 1000);
}

function hitungKiblat(){
    const lat1 = userLat * Math.PI/180, lat2 = KAABAH.lat * Math.PI/180;
    const dLon = (KAABAH.lng - userLng) * Math.PI/180;
    const y = Math.sin(dLon)*Math.cos(lat2);
    const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    azimuthKiblat = (Math.atan2(y,x)*180/Math.PI+360)%360;
    
    document.getElementById("azimuthKabah").innerText = `Azimuth: ${azimuthKiblat.toFixed(1)}°`;
}

/* ===============================
   INITIALIZE & GPS
================================= */
function initApp() {
    initMetode();
    
    // Tampilkan data Jakarta dulu agar tidak blank
    loadJadwal();
    hitungKiblat();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async pos => {
                userLat = pos.coords.latitude; 
                userLng = pos.coords.longitude;
                await getGeoData(); 
                hitungKiblat(); 
                loadJadwal();
            },
            err => { document.getElementById("namaLokasi").innerText = "📍 Jakarta (Lokasi Default)"; },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
}

// Global Listeners
document.getElementById("btnKiblat").onclick = () => document.getElementById("overlay").style.display = "flex";
document.getElementById("closeCompass").onclick = () => document.getElementById("overlay").style.display = "none";
document.getElementById("toggleAudio").onclick = function() {
    audioEnabled = !audioEnabled;
    this.innerText = audioEnabled ? "🔔 Audio ON" : "🔕 Audio OFF";
};

document.addEventListener("DOMContentLoaded", initApp);
