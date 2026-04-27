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

// Audio (Pastikan file ini ada di folder audio/)
const adzanSubuh = new Audio("audio/adzan_subuh.mp3");
const adzanNormal = new Audio("audio/adzan_normal.mp3");

/* ==========================
   JAM & TANGGAL (Realtime)
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
   INISIALISASI METODE
============================ */
function initMetode() {
    const metodeSelect = document.getElementById("metode");
    if(!metodeSelect) return;

    const daftarMode = {
        Kemenag: "Kemenag / MABIMS",
        Makkah: "Umm Al-Qura (Makkah)",
        MWL: "Muslim World League",
        ISNA: "ISNA (North America)",
        Egypt: "Egyptian General Authority",
        Karachi: "Univ. Islamic Sciences",
        Singapore: "MUIS Singapore"
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

    // Inisialisasi Library PrayTime
    if (typeof PrayTime !== 'undefined') {
        praytime = new PrayTime();
        praytime.setMethod(saved);
        praytime.setTimeFormat(praytime.Time24); 
        praytime.adjust({ fajr: 20, isha: 18, highLats: 'None' });
    }

    metodeSelect.addEventListener("change", () => {
        localStorage.setItem("metode", metodeSelect.value);
        if(praytime) {
            praytime.setMethod(metodeSelect.value);
            if(metodeSelect.value === "Kemenag") praytime.adjust({ fajr: 20, isha: 18 });
        }
        loadJadwal();
    });
}

/* ===============================
   REVERSE GEOCODE (NOMINATIM)
================================= */
async function getGeoData() {
    const namaLokasiEl = document.getElementById("namaLokasi");
    const koordinatEl = document.getElementById("koordinat");

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userLat}&lng=${userLng}`, {
            headers: { "Accept-Language": "id-ID" }
        });
        const data = await res.json();
        const addr = data.address || {};

        const desa = addr.village || addr.suburb || addr.hamlet || "";
        const kec = addr.city_district || addr.district || "";
        const kab = (addr.city || addr.county || "").replace(/Kabupaten\s+|Kota\s+/i, "");
        
        const lokasiFinal = [desa, kec, kab].filter(Boolean).join(", ");
        
        if(namaLokasiEl) namaLokasiEl.innerText = "📍 " + (lokasiFinal || "Lokasi Ditemukan");
        if(koordinatEl) koordinatEl.innerText = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
        
        // Sinkron ke Kompas
        const cLokasi = document.getElementById("compassLokasi");
        const cKoord = document.getElementById("compassKoordinat");
        if(cLokasi) cLokasi.innerText = "📍 " + lokasiFinal;
        if(cKoord) cKoord.innerText = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
    } catch (e) {
        if(namaLokasiEl) namaLokasiEl.innerText = "📍 Lokasi Berhasil Didapat";
    }
}

/* ===============================
   JADWAL SHOLAT (CORE)
================================= */
const namaSholatID = { fajr: "Subuh", sunrise: "Terbit", dhuhr: "Dzuhur", asr: "Ashar", maghrib: "Maghrib", isha: "Isya" };
const urutanSholat = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

function tampilkanJadwal(times) {
    const jadwalList = document.getElementById("jadwalList");
    if (!jadwalList || !times) return;
    
    jadwalList.innerHTML = "";
    urutanSholat.forEach(key => {
        const div = document.createElement("div");
        div.className = "jadwal-item";
        const jam = times[key] ? times[key].substring(0, 5) : "--:--";
        div.innerHTML = `<span>${namaSholatID[key]}</span><span>${jam}</span>`;
        jadwalList.appendChild(div);
    });
}

async function loadJadwal() {
    if (!userLat || !userLng) return;
    const now = new Date();

    // 1. OFFLINE FIRST (Langsung Tampil)
    if(praytime) {
        const offline = praytime.getTimes(now, [userLat, userLng], "auto");
        currentTimes = offline;
        tampilkanJadwal(currentTimes);
        startCountdown();
    }

    // 2. ONLINE UPDATE (Background)
    const mValue = document.getElementById("metode")?.value || "Kemenag";
    const aladhanMethod = { MWL:3, ISNA:2, Egypt:5, Makkah:4, Karachi:1, Singapore:7, Kemenag:20 }[mValue] || 20;

    try {
        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${aladhanMethod}`);
        const json = await res.json();
        if (json.data) {
            const api = json.data.timings;
            currentTimes = { fajr: api.Fajr, sunrise: api.Sunrise, dhuhr: api.Dhuhr, asr: api.Asr, maghrib: api.Maghrib, isha: api.Isha };
            tampilkanJadwal(currentTimes);
            currentDateKey = now.toDateString();
        }
    } catch (e) {
        console.warn("Gagal fetch API, menggunakan data internal.");
    }
}

/* ============================
   COUNTDOWN & NOTIF
============================ */
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        if (!currentTimes) return;
        const now = new Date();
        
        let nextName = null, nextDate = null;
        for (let key of urutanSholat) {
            const timeSplit = currentTimes[key].split(":");
            const waktu = new Date();
            waktu.setHours(parseInt(timeSplit[0]), parseInt(timeSplit[1]), 0, 0);
            if (waktu > now) { nextName = key; nextDate = waktu; break; }
        }
        
        if (!nextDate) { // Jika semua sudah lewat, ambil Subuh besok
            const timeSplit = currentTimes["fajr"].split(":");
            nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 1);
            nextDate.setHours(parseInt(timeSplit[0]), parseInt(timeSplit[1]), 0, 0); 
            nextName = "fajr";
        }

        const diffMs = nextDate - now;
        const totalDetik = Math.floor(diffMs / 1000);
        const h = Math.floor(totalDetik / 3600);
        const m = Math.floor((totalDetik % 3600) / 60);
        const s = totalDetik % 60;

        const cdEl = document.getElementById("countdown");
        const menEl = document.getElementById("menuju");
        if(cdEl) cdEl.innerText = `${h > 0 ? h + 'j ' : ''}${m}m ${s}s lagi`;
        if(menEl) menEl.innerText = `Menuju ${namaSholatID[nextName]}`;

        if (totalDetik === 0 && !notified[nextName]) {
            notified[nextName] = true;
            if (audioEnabled) (nextName === "fajr") ? adzanSubuh.play() : adzanNormal.play();
            if (Notification.permission === "granted") {
                new Notification("Adzan Pro", { body: `Waktu ${namaSholatID[nextName]} tiba` });
            }
        }
    }, 1000);
}

/* ===============================
   KIBLAT & KOMPAS
================================= */
function hitungKiblat(){
    if(!userLat || !userLng) return;
    const lat1 = userLat * Math.PI/180;
    const lat2 = KAABAH.lat * Math.PI/180;
    const dLon = (KAABAH.lng - userLng) * Math.PI/180;
    const y = Math.sin(dLon)*Math.cos(lat2);
    const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    azimuthKiblat = (Math.atan2(y,x)*180/Math.PI+360)%360;

    const azEl = document.getElementById("azimuthKabah");
    const jarEl = document.getElementById("jarakKabah");
    if(azEl) azEl.innerText = `Azimuth: ${azimuthKiblat.toFixed(1)}°`;
    
    const R = 6371;
    const dLat = (KAABAH.lat - userLat) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    const jarak = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    if(jarEl) jarEl.innerText = `Jarak: ${jarak.toFixed(0)} Km`;
}

window.addEventListener("deviceorientation", e => {
    if (e.alpha === null) return;
    currentHeading = 360 - e.alpha;
    smoothHeading += (currentHeading - smoothHeading) * 0.1;

    const disk = document.getElementById("compassDisk");
    const qLine = document.getElementById("qiblatLine");
    if(disk) disk.style.transform = `rotate(${-smoothHeading}deg)`;
    if(qLine) qLine.style.transform = `translate(-50%,-100%) rotate(${azimuthKiblat - smoothHeading}deg)`;
    
    const selisih = ((azimuthKiblat - smoothHeading + 540) % 360) - 180;
    const sSudut = document.getElementById("selisihSudut");
    if(sSudut) sSudut.innerText = `Selisih: ${Math.abs(selisih).toFixed(1)}°`;
}, true);

/* ===============================
   INITIALIZE APP
================================= */
function initApp() {
    console.log("Aplikasi Dimulai...");
    initMetode();
    
    // Inisialisasi Ticks Kompas
    const ticksCont = document.getElementById("ticks");
    if(ticksCont) {
        ticksCont.innerHTML = "";
        for (let i = 0; i < 360; i += 5) {
            const t = document.createElement("div");
            t.className = "tick " + (i % 30 === 0 ? "large" : (i % 10 === 0 ? "medium" : "small"));
            t.style.transform = `rotate(${i}deg)`;
            ticksCont.appendChild(t);
        }
    }

    // Set Lokasi Default (Jakarta) agar UI tidak kosong saat nunggu GPS
    userLat = -6.1751;
    userLng = 106.8272;
    document.getElementById("namaLokasi").innerText = "📍 Mencari lokasi...";
    loadJadwal(); 

    // Ambil GPS Asli
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async pos => {
                console.log("GPS Berhasil didapat");
                userLat = pos.coords.latitude; 
                userLng = pos.coords.longitude;
                await getGeoData(); 
                hitungKiblat(); 
                loadJadwal();
            },
            err => { 
                console.warn("GPS Gagal:", err.message);
                document.getElementById("namaLokasi").innerText = "📍 Jakarta (Default - GPS Mati)";
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    } else {
        document.getElementById("namaLokasi").innerText = "📍 Jakarta (Browser tidak dukung GPS)";
    }
}

// Event Listeners
const bKiblat = document.getElementById("btnKiblat");
const cKiblat = document.getElementById("closeCompass");
const tAudio = document.getElementById("toggleAudio");

if(bKiblat) bKiblat.onclick = () => { document.getElementById("overlay").style.display = "flex"; };
if(cKiblat) cKiblat.onclick = () => { document.getElementById("overlay").style.display = "none"; };
if(tAudio) tAudio.onclick = () => {
    audioEnabled = !audioEnabled;
    tAudio.innerText = audioEnabled ? "🔔 Audio ON" : "🔕 Audio OFF";
};

document.addEventListener("DOMContentLoaded", initApp);
