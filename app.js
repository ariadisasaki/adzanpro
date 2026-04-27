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

// Elemen DOM
const metodeSelect = document.getElementById("metode");
const jadwalList = document.getElementById("jadwalList");

/* ==========================
   REALTIME JAM & TANGGAL
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
   INIT METODE & PRAYTIME
============================ */
function initMetode() {
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

    praytime = new PrayTime();
    praytime.setMethod(saved);
    praytime.setTimeFormat(praytime.Time24); // Fix bug 00:12
    praytime.adjust({ fajr: 20, isha: 18, highLats: 'None' });

    metodeSelect.addEventListener("change", () => {
        localStorage.setItem("metode", metodeSelect.value);
        praytime.setMethod(metodeSelect.value);
        if(metodeSelect.value === "Kemenag") praytime.adjust({ fajr: 20, isha: 18 });
        loadJadwal();
    });
}

/* ===============================
   NOMINATIM INLINE (GEOLOKASI)
================================= */
async function getGeoData() {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userLat}&lng=${userLng}`, {
            headers: { "Accept-Language": "id-ID" }
        });
        const data = await res.json();
        const addr = data.address;

        const desa = addr.village || addr.suburb || addr.hamlet || "";
        const kec = addr.city_district || addr.district || "";
        const kab = (addr.city || addr.county || "").replace(/Kabupaten\s+|Kota\s+/i, "");
        const prov = addr.state || "";

        const lokasiFinal = [desa, kec, kab, prov].filter(Boolean).join(", ");
        
        document.getElementById("namaLokasi").innerText = "📍 " + (lokasiFinal || "Lokasi Ditemukan");
        document.getElementById("koordinat").innerText = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
        
        if(document.getElementById("compassLokasi")) {
            document.getElementById("compassLokasi").innerText = "📍 " + lokasiFinal;
            document.getElementById("compassKoordinat").innerText = `${userLat.toFixed(6)}, ${userLng.toFixed(6)}`;
        }
    } catch (e) {
        document.getElementById("namaLokasi").innerText = "📍 Gagal memuat nama lokasi";
    }
}

/* ===============================
   TAMPILKAN & LOAD JADWAL
================================= */
const namaSholatID = { fajr: "Subuh", sunrise: "Terbit", dhuhr: "Dzuhur", asr: "Ashar", maghrib: "Maghrib", isha: "Isya" };
const urutanSholat = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

function tampilkanJadwal(times) {
    if (!times) return;
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

    // Offline First
    const offline = praytime.getTimes(now, [userLat, userLng], "auto");
    currentTimes = offline;
    tampilkanJadwal(currentTimes);
    startCountdown();

    // API Update
    const aladhanMethod = { MWL:3, ISNA:2, Egypt:5, Makkah:4, Karachi:1, Singapore:7, Kemenag:20 }[metodeSelect.value] || 20;
    try {
        const res = await fetch(`https://api.aladhan.com/v1/timings?latitude=${userLat}&longitude=${userLng}&method=${aladhanMethod}`);
        const json = await res.json();
        if (json.data) {
            const api = json.data.timings;
            currentTimes = { fajr: api.Fajr, sunrise: api.Sunrise, dhuhr: api.Dhuhr, asr: api.Asr, maghrib: api.Maghrib, isha: api.Isha };
            tampilkanJadwal(currentTimes);
            currentDateKey = now.toDateString();
        }
    } catch (e) { console.warn("API Offline, menggunakan hitungan internal."); }
}

/* ============================
   LOGIKA COUNTDOWN & NOTIF
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

        const diffMs = nextDate - now;
        const totalDetik = Math.floor(diffMs / 1000);
        const h = Math.floor(totalDetik / 3600);
        const m = Math.floor((totalDetik % 3600) / 60);
        const s = totalDetik % 60;

        document.getElementById("countdown").innerText = `${h > 0 ? h + 'j ' : ''}${m}m ${s}detik lagi`;
        document.getElementById("menuju").innerText = `Menuju ${namaSholatID[nextName]}`;

        if (totalDetik === 0 && !notified[nextName]) {
            notified[nextName] = true;
            if (audioEnabled) (nextName === "fajr") ? adzanSubuh.play() : adzanNormal.play();
            if (Notification.permission === "granted") {
                new Notification("Adzan Pro", { body: `Waktu ${namaSholatID[nextName]} telah tiba` });
            }
        }
    }, 1000);
}

/* ===============================
   HITUNG KIBLAT
================================= */
function hitungKiblat(){
    const lat1 = userLat * Math.PI/180;
    const lat2 = KAABAH.lat * Math.PI/180;
    const dLon = (KAABAH.lng - userLng) * Math.PI/180;
    const y = Math.sin(dLon)*Math.cos(lat2);
    const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    azimuthKiblat = (Math.atan2(y,x)*180/Math.PI+360)%360;

    document.getElementById("azimuthKabah").innerText = `Azimuth Ka'bah : ${azimuthKiblat.toFixed(2)}°`;
    const R = 6371;
    const dLat = (KAABAH.lat - userLat) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    const jarak = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    document.getElementById("jarakKabah").innerText = `Jarak : ${jarak.toFixed(2)} Km`;
}

/* ===============================
   KOMPAS & ORIENTASI
================================= */
window.addEventListener("deviceorientation", e => {
    if (e.alpha === null) return;
    currentHeading = 360 - e.alpha;
    smoothHeading += (currentHeading - smoothHeading) * 0.1;

    const disk = document.getElementById("compassDisk");
    const qLine = document.getElementById("qiblatLine");
    if(disk) disk.style.transform = `rotate(${-smoothHeading}deg)`;
    if(qLine) qLine.style.transform = `translate(-50%,-100%) rotate(${azimuthKiblat - smoothHeading}deg)`;
    
    const selisih = ((azimuthKiblat - smoothHeading + 540) % 360) - 180;
    document.getElementById("selisihSudut").innerText = `Selisih: ${Math.abs(selisih).toFixed(1)}°`;

    const labels = ["Utara","Timur Laut","Timur","Tenggara","Selatan","Barat Daya","Barat","Barat Laut"];
    document.getElementById("arahMataAngin").innerText = `Arah Mata Angin : ${labels[Math.round(smoothHeading / 45) % 8]}`;
}, true);

/* ===============================
   INIT UI & ASSETS
================================= */
function initApp() {
    initMetode();
    
    // Ticks & Labels Piringan
    const ticksCont = document.getElementById("ticks");
    const labelsCont = document.getElementById("directionLabels");
    const labelSingkat = ["N","NE","E","SE","S","SW","W","NW"];

    for (let i = 0; i < 360; i += 5) {
        const t = document.createElement("div");
        t.className = "tick " + (i % 30 === 0 ? "large" : (i % 10 === 0 ? "medium" : "small"));
        t.style.transform = `rotate(${i}deg)`;
        ticksCont.appendChild(t);
    }
    labelSingkat.forEach((l, i) => {
        const div = document.createElement("div");
        div.className = "direction-label";
        div.innerText = l;
        const angle = (i * 45) * Math.PI / 180;
        div.style.left = `${50 + Math.sin(angle) * 42}%`;
        div.style.top = `${50 - Math.cos(angle) * 42}%`;
        labelsCont.appendChild(div);
    });

    // Lokasi
    navigator.geolocation.getCurrentPosition(
        async pos => {
            userLat = pos.coords.latitude; userLng = pos.coords.longitude;
            await getGeoData(); hitungKiblat(); loadJadwal();
        },
        err => { document.getElementById("namaLokasi").innerText = "❌ GPS tidak aktif"; },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Event Listeners
document.getElementById("btnKiblat").onclick = () => { document.getElementById("overlay").style.display = "flex"; };
document.getElementById("closeCompass").onclick = () => { document.getElementById("overlay").style.display = "none"; };
document.getElementById("toggleAudio").onclick = () => {
    audioEnabled = !audioEnabled;
    document.getElementById("toggleAudio").innerText = audioEnabled ? "🔔 Audio ON" : "🔕 Audio OFF";
};

document.addEventListener("DOMContentLoaded", initApp);
