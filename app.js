/* ====================================================
   ADZAN PRO - FINAL PRODUCTION BY ARIADI FORESTER
==================================================== */

const KAABAH = { lat: 21.4225, lng: 39.8262 };

// State Global
let praytime;
let countdownInterval = null;
let currentTimes = null;
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

// Elemen DOM
const metodeSelect = document.getElementById("metode");
const jadwalList = document.getElementById("jadwalList");

/* ================
   HELPER: FORMAT
================ */
function formatWaktuManual(time) {
    if (typeof time === 'string' && time.includes(':')) return time.substring(0, 5);
    let hours = Math.floor(time);
    let minutes = Math.round((time - hours) * 60);
    if (minutes === 60) { hours++; minutes = 0; }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function updateClock() {
    const now = new Date();
    const jamEl = document.getElementById("jam");
    const tglEl = document.getElementById("tanggal");
    if (jamEl) jamEl.innerText = now.toLocaleTimeString("id-ID", { hour12: false });
    if (tglEl) tglEl.innerText = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
setInterval(updateClock, 1000);

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
async function getGeoData() {
    const lokasiEl = document.getElementById('namaLokasi');
    const locEl = document.getElementById('koordinat');
    const compLokasi = document.getElementById('compassLokasi');
    const compKoord = document.getElementById('compassKoordinat');

    const koordinatTeks = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
    if (locEl) locEl.innerText = koordinatTeks;
    if (compKoord) compKoord.innerText = koordinatTeks;

    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json&accept-language=id`, { headers: { "User-Agent": "AdzanPro/1.0" } });
        const d = await r.json();
        const a = d.address || {};
        const komponenAlamat = [a.village || a.suburb || a.town || a.city || "", a.district || a.county || "", a.state || "", a.country || ""];
        const alamatLengkap = komponenAlamat.filter(v => v && v.trim() !== "").join(", ");
        const hasilFinal = alamatLengkap ? "📍 " + alamatLengkap : "📍 Lokasi tidak dikenal";

        if (lokasiEl) lokasiEl.innerText = hasilFinal;
        if (compLokasi) compLokasi.innerText = hasilFinal;
    } catch (err) {
        if (lokasiEl) lokasiEl.innerText = "Gagal memuat nama lokasi";
    }
}

/* ===============
   LOAD JADWAL
=============== */
const namaSholatID = { fajr: "Subuh", sunrise: "Terbit", dhuhr: "Dzuhur", asr: "Ashar", maghrib: "Maghrib", isha: "Isya" };
const urutanSholat = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

function tampilkanJadwal(times) {
    if (!jadwalList || !times) return;
    jadwalList.innerHTML = "";
    const now = new Date();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    let activeIndex = -1;

    for (let i = 0; i < urutanSholat.length; i++) {
        const [h, m] = times[urutanSholat[i]].split(":").map(Number);
        if (currentTotalMinutes >= (h * 60 + m)) activeIndex = i;
    }

    urutanSholat.forEach((key, index) => {
        const div = document.createElement("div");
        div.className = "jadwal-item" + (index === activeIndex ? " active" : "");
        div.innerHTML = `<span>${namaSholatID[key]}</span><span>${times[key] || "--:--"}</span>`;
        jadwalList.appendChild(div);
    });
}

async function loadJadwal() {
    if (!userLat || !userLng) return;
    const mValue = metodeSelect.value;
    const aladhanMethod = { MWL:3, ISNA:2, Egypt:5, Makkah:4, Karachi:1, Singapore:7, Kemenag:20 }[mValue] || 20;

    try {
        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${aladhanMethod}`);
        const json = await res.json();
        const api = json.data.timings;
        currentTimes = { fajr: api.Fajr, sunrise: api.Sunrise, dhuhr: api.Dhuhr, asr: api.Asr, maghrib: api.Maghrib, isha: api.Isha };
    } catch (err) {
        const tz = -new Date().getTimezoneOffset() / 60;
        const raw = praytime.getTimes(new Date(), [userLat, userLng], tz);
        currentTimes = { fajr: formatWaktuManual(raw.fajr), sunrise: formatWaktuManual(raw.sunrise), dhuhr: formatWaktuManual(raw.dhuhr), asr: formatWaktuManual(raw.asr), maghrib: formatWaktuManual(raw.maghrib), isha: formatWaktuManual(raw.isha) };
    }
    tampilkanJadwal(currentTimes);
    startCountdown();
}

/* =================================
   COUNTDOWN & ORIENTASI
================================== */
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    let lastMinute = -1;

    countdownInterval = setInterval(() => {
        if (!currentTimes) return;
        const now = new Date();
        
        if (now.getMinutes() !== lastMinute) {
            tampilkanJadwal(currentTimes);
            lastMinute = now.getMinutes();
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
        const h = Math.floor(totalDetik / 3600);
        const m = Math.floor((totalDetik % 3600) / 60);
        const s = totalDetik % 60;

        document.getElementById("menuju").innerText = totalDetik <= 1800 ? `Sebentar lagi Waktu ${namaSholatID[nextName]}` : `Menuju Waktu ${namaSholatID[nextName]}`;
        document.getElementById("countdown").innerText = `${h > 0 ? h + ' jam ' : ''}${m} menit ${s} detik lagi`;
        
        if (totalDetik === 0) {
            checkNotification(nextName, 0);
            setTimeout(loadJadwal, 2000);
        }
    }, 1000);
}

function checkNotification(name, diff) {
    if (diff === 0 && !notified[name]) {
        notified[name] = true;
        if (audioEnabled) (name === "fajr") ? adzanSubuh.play() : adzanNormal.play();
    }
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function hitungKiblat() {
    const dLon = (KAABAH.lng - userLng) * Math.PI / 180;
    const lat1 = userLat * Math.PI / 180;
    const lat2 = KAABAH.lat * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    azimuthKiblat = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

    document.getElementById("azimuthKabah").innerText = `Azimuth Ka'bah : ${azimuthKiblat.toFixed(2)}°`;
    document.getElementById("jarakKabah").innerText = `Jarak ke Ka'bah : ${haversine(userLat, userLng, KAABAH.lat, KAABAH.lng).toFixed(2)} Km`;
}

window.addEventListener("deviceorientation", e => {
    if (e.alpha === null) return;
    currentHeading = 360 - e.alpha;
    smoothHeading += (currentHeading - smoothHeading) * 0.1;

    document.getElementById("compassDisk").style.transform = `rotate(${-smoothHeading}deg)`;
    document.getElementById("qiblatLine").style.transform = `translate(-50%,-100%) rotate(${azimuthKiblat - smoothHeading}deg)`;
    
    const selisih = ((azimuthKiblat - smoothHeading + 540) % 360) - 180;
    document.getElementById("selisihSudut").innerText = `Selisih Sudut : ${Math.abs(selisih).toFixed(1)}°`;

    const labels = ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"];
    document.getElementById("arahMataAngin").innerText = `Arah Mata Angin : ${labels[Math.round(smoothHeading / 45) % 8]}`;
}, true);

 /* =================================
   FUNGSI PEMBUAT ELEMEN KOMPAS
================================== */
function createCompassTicks() {
    const container = document.getElementById("ticks");
    if (!container) return;
    container.innerHTML = "";
    
    for (let i = 0; i < 360; i += 5) {
        const tick = document.createElement("div");
        // Menentukan ukuran garis: Besar tiap 30°, Sedang tiap 10°, sisanya Kecil
        let size = "small";
        if (i % 30 === 0) size = "large";
        else if (i % 10 === 0) size = "medium";
        
        tick.className = `tick ${size}`;
        tick.style.transform = `rotate(${i}deg)`;
        container.appendChild(tick);
    }
}

function buatLabelPiringan() {
    const container = document.getElementById("directionLabels");
    if (!container) return;
    container.innerHTML = "";
    
    // Daftar label mata angin dan posisinya dalam derajat
    const labels = [
        { t: "N", a: 0 }, { t: "NE", a: 45 }, { t: "E", a: 90 }, { t: "SE", a: 135 },
        { t: "S", a: 180 }, { t: "SW", a: 225 }, { t: "W", a: 270 }, { t: "NW", a: 315 }
    ];

    labels.forEach(l => {
        const div = document.createElement("div");
        div.className = "direction-label";
        div.innerText = l.t;
        const rad = l.a * (Math.PI / 180);
        // Jarak label dari pusat piringan (44%)
        div.style.left = `${50 + Math.sin(rad) * 44}%`;
        div.style.top = `${50 - Math.cos(rad) * 44}%`;
        container.appendChild(div);
    });
}      

/* ===============
   INITIALIZE
=============== */
function initApp() {
    initMetode();
    updateClock();
    // Fungsi pembuat ticks & label tetap dipanggil di sini
    if(typeof createCompassTicks === 'function') createCompassTicks();
    if(typeof buatLabelPiringan === 'function') buatLabelPiringan();
    
    navigator.geolocation.getCurrentPosition(async pos => {
        userLat = pos.coords.latitude; userLng = pos.coords.longitude;
        await getGeoData(); hitungKiblat(); loadJadwal();
    }, err => { document.getElementById("namaLokasi").innerText = "❌ GPS tidak aktif"; }, { enableHighAccuracy: true });
}

document.getElementById("btnKiblat").onclick = () => { document.getElementById("overlay").style.display = "flex"; };
document.getElementById("closeCompass").onclick = () => { document.getElementById("overlay").style.display = "none"; };
document.getElementById("toggleAudio").onclick = () => {
    audioEnabled = !audioEnabled;
    document.getElementById("toggleAudio").innerText = audioEnabled ? "🔔 Audio ON" : "🔕 Audio OFF";
};

document.addEventListener("DOMContentLoaded", initApp);

// Performance Log (Refresh setiap 30 detik)
setInterval(() => {
    if(!userLat) return;
    console.clear();
    console.log("%c ADZAN PRO MONITOR ", "background:#2c3e50;color:#fff;padding:5px;");
    console.table([{Lat: userLat, Lon: userLng, Azimuth: azimuthKiblat.toFixed(2), Heading: smoothHeading.toFixed(1)}]);
}, 30000);
