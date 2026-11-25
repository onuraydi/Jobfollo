const REPO = "onuraydi/Jobfollo";
const RELEASES_FALLBACK = `https://github.com/${REPO}/releases/latest`;

const COPY = {
  tr: {
    "nav.features": "Özellikler",
    "nav.download": "İndir",
    "nav.privacy": "Gizlilik",
    "hero.badge": "Açık Kaynak · %100 Yerel · Ücretsiz",
    "hero.title": "İş başvurularını ve takiplerini tek yerden, zamanında yönet.",
    "hero.subtitle":
      "Açık ilan başvuruların, genel başvuruların, takip adımların, takvimin ve mesaj şablonların tamamen kendi bilgisayarında. Hesap yok, bulut yok, izleme yok.",
    "hero.downloadCta": "Ücretsiz İndir",
    "hero.githubCta": "GitHub'da İncele",
    "hero.platforms":
      "Windows (.exe / .msi) · macOS Apple Silicon & Intel (.dmg) · Linux (.AppImage / .deb)",
    "mock.today": "Bugün",
    "mock.jobPostings": "Açık ilanlar",
    "mock.general": "Genel başvurular",
    "mock.calendar": "Takvim",
    "mock.stats": "İstatistikler",
    "mock.templates": "Şablonlar",
    "mock.kpiActive": "Aktif başvuru",
    "mock.kpiToday": "Bugün takip",
    "mock.kpiInterview": "Mülakat",
    "mock.kpiOffer": "Teklif",
    "mock.step1": "7. gün takip e-postası gönder",
    "mock.step2": "LinkedIn bağlantı isteği ve kısa not",
    "mock.step3": "Mülakat sonrası teşekkür maili",
    "mock.dueToday": "Bugün",
    "mock.upcoming": "2 gün sonra",
    "mock.interview": "Mülakat",
    "features.heading": "Sürecini düzenli tutan her şey bir arada",
    "features.subheading":
      "Excel tablolarında kaybolmak yerine net takip adımları, hazır şablonlar ve akıllı hatırlatıcılarla ilerle.",
    "features.f1Title": "Açık İlanlar & Genel Başvurular",
    "features.f1Body":
      "İlan başvurularını ve şirketlere yaptığın genel başvuruları ayrı sekmelerde, Tablo veya Kanban panosu görünümüyle yönet.",
    "features.f2Title": "Bugün Paneli & Aylık Takvim",
    "features.f2Body":
      "Geciken, bugün yapılacak ve yaklaşan takip adımlarını tek ekranda gör; hafta sonlarını atla, adımları ertele veya .ics olarak takvimine aktar.",
    "features.f3Title": "Mail ve Mesaj Şablonları",
    "features.f3Body":
      "Başvuru, takip, teşekkür ve LinkedIn mesajlarını dinamik değişkenlerle ({{company}}, {{role}}) hazırla ve tek tıkla kopyala.",
    "features.f4Title": "Masaüstü & E-posta Hatırlatıcıları",
    "features.f4Body":
      "Yerel işletim sistemi bildirimleri veya kendi SMTP hesabın üzerinden günlük özet e-postası al; sistem tepsisinde sessizce çalışır.",
    "features.f5Title": "Yerel İstatistikler & Haftalık Hedef",
    "features.f5Body":
      "Yanıt, mülakat ve teklif dönüşüm oranlarını, çalışma şekli dağılımını ve haftalık başvuru hedefini canlı takip et.",
    "features.f6Title": "Kişiselleştirme, CSV & Yedekleme",
    "features.f6Body":
      "Türkçe & İngilizce arayüz, Açık/Koyu mod, 5 renk paleti, CSV içe/dışa aktarma ve tek tıkla JSON yedekleme.",
    "download.heading": "Jobfollo'yu İndir",
    "download.subheading":
      "Tüm kurulum dosyaları doğrudan GitHub Releases üzerinden ücretsiz sunulur.",
    "download.winDesc": "Windows 10 / 11 (64-bit)",
    "download.macDesc": "Apple Silicon & Intel",
    "download.linuxDesc": "Ubuntu, Debian, Fedora vb.",
    "download.noteTitle": "İlk kurulum notu (imzasız açık kaynak derleme):",
    "download.noteBody":
      'Windows SmartScreen uyarısında "Ek bilgi → Yine de çalıştır" seçeneğini kullanın. macOS\'ta ilk açılışta uygulamaya sağ tıklayıp "Aç" deyin veya terminalde xattr -cr /Applications/Jobfollo.app çalıştırın.',
    "privacy.heading": "Gizlilik öncelikli mimari",
    "privacy.body":
      "Jobfollo verilerini yalnızca kendi cihazındaki tek bir SQLite dosyasında saklar. Telemetri, analitik veya üçüncü taraf sunucu yoktur. SMTP şifren yalnızca işletim sisteminin güvenli anahtarlığında (OS Keychain) tutulur ve dışa aktarımlara asla eklenmez.",
    "privacy.cta": "Mimariyi İncele",
    downloadFor: {
      windows: "Windows için İndir",
      macos: "macOS için İndir",
      linux: "Linux için İndir",
      unknown: "Ücretsiz İndir",
    },
  },
  en: {
    "nav.features": "Features",
    "nav.download": "Download",
    "nav.privacy": "Privacy",
    "hero.badge": "Open Source · 100% Local-First · Free",
    "hero.title": "Keep your job applications and follow-ups on schedule.",
    "hero.subtitle":
      "Manage job postings, spontaneous general applications, follow-up steps, calendar, and reusable templates right on your computer. No accounts, no cloud, no tracking.",
    "hero.downloadCta": "Download Free",
    "hero.githubCta": "View on GitHub",
    "hero.platforms":
      "Windows (.exe / .msi) · macOS Apple Silicon & Intel (.dmg) · Linux (.AppImage / .deb)",
    "mock.today": "Today",
    "mock.jobPostings": "Job postings",
    "mock.general": "General apps",
    "mock.calendar": "Calendar",
    "mock.stats": "Statistics",
    "mock.templates": "Templates",
    "mock.kpiActive": "Active apps",
    "mock.kpiToday": "Due today",
    "mock.kpiInterview": "Interviews",
    "mock.kpiOffer": "Offers",
    "mock.step1": "Send 7-day follow-up email",
    "mock.step2": "LinkedIn connection request & note",
    "mock.step3": "Post-interview thank-you email",
    "mock.dueToday": "Today",
    "mock.upcoming": "In 2 days",
    "mock.interview": "Interview",
    "features.heading": "Everything you need to stay on top of your search",
    "features.subheading":
      "Replace messy spreadsheets with structured follow-up cadences, reusable templates, and gentle reminders.",
    "features.f1Title": "Job Postings & General Applications",
    "features.f1Body":
      "Track open job postings and spontaneous company outreach in dedicated tabs with both Table and Kanban views.",
    "features.f2Title": "Today Dashboard & Monthly Calendar",
    "features.f2Body":
      "See overdue, due-today, and upcoming steps at a glance; skip weekends, snooze steps, or export .ics events.",
    "features.f3Title": "Email & Message Templates",
    "features.f3Body":
      "Prepare application, follow-up, thank-you, and LinkedIn templates with live placeholders ({{company}}, {{role}}) and 1-click copy.",
    "features.f4Title": "Desktop & Email Reminders",
    "features.f4Body":
      "Get native OS notifications or daily digest emails through your own SMTP account while running quietly in the tray.",
    "features.f5Title": "Local Analytics & Weekly Goal",
    "features.f5Body":
      "Monitor response, interview, and offer conversion rates, work-mode breakdowns, and your weekly application goal.",
    "features.f6Title": "Themes, CSV & JSON Backup",
    "features.f6Body":
      "Bilingual TR/EN interface, Light/Dark mode, 5 color palettes, CSV import/export, and 1-click JSON backup.",
    "download.heading": "Download Jobfollo",
    "download.subheading":
      "All installers are built transparently via GitHub Actions and hosted free on GitHub Releases.",
    "download.winDesc": "Windows 10 / 11 (64-bit)",
    "download.macDesc": "Apple Silicon & Intel",
    "download.linuxDesc": "Ubuntu, Debian, Fedora, etc.",
    "download.noteTitle": "First launch note (unsigned open-source build):",
    "download.noteBody":
      'On Windows SmartScreen, click "More info → Run anyway". On macOS, right-click the app and choose "Open" or run xattr -cr /Applications/Jobfollo.app in Terminal.',
    "privacy.heading": "Privacy-first architecture",
    "privacy.body":
      "Jobfollo stores all your data in a single local SQLite file on your device. There is zero telemetry, analytics, or cloud sync. Your SMTP password lives exclusively in your OS keychain and is never included in exports.",
    "privacy.cta": "Read Architecture",
    downloadFor: {
      windows: "Download for Windows",
      macos: "Download for macOS",
      linux: "Download for Linux",
      unknown: "Download Free",
    },
  },
};

function detectOS() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

let currentLang =
  localStorage.getItem("jobfollo_site_lang") ||
  (navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en");

let currentTheme =
  localStorage.getItem("jobfollo_site_theme") ||
  (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

const detectedOS = detectOS();

function applyTheme() {
  document.documentElement.classList.toggle("dark", currentTheme === "dark");
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = currentTheme === "dark" ? "☀" : "☾";
}

function applyLang() {
  const dict = COPY[currentLang] || COPY.en;
  document.documentElement.lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && dict[key]) {
      el.textContent = dict[key];
    }
  });
  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) langBtn.textContent = currentLang === "tr" ? "EN" : "TR";

  const primaryLabel = document.getElementById("primary-download-label");
  if (primaryLabel) {
    primaryLabel.textContent = dict.downloadFor[detectedOS] || dict.downloadFor.unknown;
  }
}

function highlightOSCard() {
  if (detectedOS === "unknown") return;
  const card = document.querySelector(`.download-card[data-os="${detectedOS}"]`);
  if (card) card.classList.add("recommended");
}

async function hydrateLatestRelease() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const release = await res.json();
    if (release.tag_name) {
      const badge = document.getElementById("release-version");
      if (badge) badge.textContent = release.tag_name;
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const findAsset = (pred) => assets.find((a) => pred(String(a.name || "").toLowerCase()));

    const winExe = findAsset((n) => n.endsWith("-setup.exe") || n.endsWith(".exe"));
    const winMsi = findAsset((n) => n.endsWith(".msi"));
    const macArm = findAsset((n) => n.includes("aarch64") && n.endsWith(".dmg"));
    const macX64 = findAsset((n) => n.includes("x64") && n.endsWith(".dmg"));
    const linuxAppImage = findAsset((n) => n.endsWith(".appimage"));
    const linuxDeb = findAsset((n) => n.endsWith(".deb"));

    const setHref = (id, asset) => {
      const el = document.getElementById(id);
      if (el && asset?.browser_download_url) {
        el.setAttribute("href", asset.browser_download_url);
      }
    };

    setHref("dl-win-exe", winExe);
    setHref("dl-win-msi", winMsi);
    setHref("dl-mac-arm", macArm);
    setHref("dl-mac-x64", macX64);
    setHref("dl-linux-appimage", linuxAppImage);
    setHref("dl-linux-deb", linuxDeb);

    const primaryBtn = document.getElementById("primary-download-btn");
    if (primaryBtn) {
      const target =
        detectedOS === "windows"
          ? winExe || winMsi
          : detectedOS === "macos"
            ? macArm || macX64
            : detectedOS === "linux"
              ? linuxAppImage || linuxDeb
              : null;
      primaryBtn.setAttribute("href", target?.browser_download_url || RELEASES_FALLBACK);
    }
  } catch {
    // Graceful fallback: links already point to GitHub Releases
  }
}

document.getElementById("lang-toggle")?.addEventListener("click", () => {
  currentLang = currentLang === "tr" ? "en" : "tr";
  localStorage.setItem("jobfollo_site_lang", currentLang);
  applyLang();
});

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem("jobfollo_site_theme", currentTheme);
  applyTheme();
});

applyTheme();
applyLang();
highlightOSCard();
void hydrateLatestRelease();
