const REPO = "onuraydi/Jobfollo";
const RELEASES_FALLBACK = `https://github.com/${REPO}/releases/latest`;

const COPY = {
  tr: {
    "nav.features": "Özellikler",
    "nav.workflow": "Nasıl Çalışır",
    "nav.download": "İndir",
    "nav.privacy": "Gizlilik",
    "hero.badge": "Açık Kaynak · %100 Yerel · Ücretsiz",
    "hero.titleLine1": "İş başvurularını unutma,",
    "hero.titleLine2": "takiplerini zamanında yönet.",
    "hero.subtitle":
      "Açık ilan başvuruları, genel başvurular, otomatik takip adımları, aylık takvim ve hazır mail/mesaj şablonları — hepsi tek bir hızlı, gizlilik odaklı masaüstü uygulamasında.",
    "hero.downloadCta": "Ücretsiz İndir",
    "hero.githubCta": "Kaynak Kodu İncele",
    "trust.local": "Tek SQLite dosyası",
    "trust.noAccount": "Hesap gerektirmez",
    "trust.os": "Windows · macOS · Linux",
    "trust.license": "MIT Lisansı",
    "mock.groupTracking": "Takip",
    "mock.today": "Bugün",
    "mock.jobPostings": "Açık ilanlar",
    "mock.templates": "Şablonlar",
    "mock.stats": "İstatistikler",
    "mock.todayTitle": "Bugün",
    "mock.todaySub": "Bugün yapılacak ve geciken takiplerin",
    "mock.overdue": "Geciken",
    "mock.dueToday": "Bugün",
    "mock.overdue1": "1 gün gecikti",
    "mock.step1": "7. gün takip e-postası gönder",
    "mock.step2": "LinkedIn bağlantı isteği ve kısa not",
    "mock.step3": "Mülakat sonrası teşekkür maili",
    "mock.done": "Tamamla",
    "mock.snooze": "Ertele",
    "mock.interview": "Mülakat",
    "mock.postingsTitle": "Açık ilan başvuruları",
    "mock.postingsSub": "Tablo ve Kanban görünümüyle tüm ilanlar",
    "mock.newPosting": "+ Yeni ilan başvurusu",
    "mock.templatesTitle": "Mail ve mesaj şablonları",
    "mock.templatesSub": "Değişkenlerle canlı önizleme ve tek tıkla kopyala",
    "mock.copyBtn": "Metni kopyala",
    "mock.statsTitle": "Yerel istatistikler",
    "mock.statsSub": "Dönüşüm hunisi ve haftalık başvuru hedefi",
    "features.eyebrow": "Özellikler",
    "features.heading": "Karmaşık tablolar yerine net bir takip sistemi",
    "features.subheading":
      "Her başvuru için bir sonraki adımın ne olduğunu ve tarihini her sabah hazır gör.",
    "features.f1Title": "Açık İlanlar & Genel Başvurular Ayrı Sekmelerde",
    "features.f1Body":
      "İlan başvurularını ve şirketlere doğrudan yaptığın genel başvuruları ayrı sekmelerde, hem Tablo hem sürükle-bırak Kanban panosuyla yönet. Şirket, konum, çalışma şekli, maaş aralığı, öncelik ve CV sürümünü tek kartta tut.",
    "features.f2Title": "Aylık Takvim & .ics",
    "features.f2Body":
      "Tüm takip tarihlerini aylık takvimde gör, hafta sonlarını otomatik Pazartesi'ye kaydır ve istediğin adımı .ics olarak dışa aktar.",
    "features.f3Title": "Mail & Mesaj Şablonları",
    "features.f3Body":
      "6 hazır TR/EN şablon + kendi özel şablonların. Kayıttan canlı değişken doldurma, tek tıkla kopyalama ve doğrudan e-posta uygulamasında açma.",
    "features.f4Title": "Masaüstü Bildirimleri, Sistem Tepsisi & Günlük Özet Maili",
    "features.f4Body":
      "SMTP kurmadan yerel işletim sistemi bildirimleri al veya kendi SMTP sunucunla günlük özet e-postası gönder. Bilgisayar açılışında sessizce tepside başlar.",
    "features.f5Title": "Yerel Analitik & Hedef",
    "features.f5Body":
      "Yanıt, mülakat ve teklif oranları, sonuç hunisi ve haftalık başvuru hedefin her zaman gözünün önünde.",
    "features.f6Title": "Özelleştirilebilir İş Akışları",
    "features.f6Body":
      "Yerleşik takip akışlarını kopyalayıp kendi gün aralıklarını, adımlarını ve mesaj şablonlarını oluştur.",
    "features.f7Title": "5 Renk Paleti, CSV & Yedek",
    "features.f7Body":
      "TR/EN dil, Açık/Koyu tema, 5 özel renk teması, CSV içe/dışa aktarma ve tek tıkla JSON yedekleme.",
    "workflow.eyebrow": "Nasıl Çalışır",
    "workflow.heading": "Üç adımda düzenli başvuru takibi",
    "workflow.s1Title": "Başvurunu ekle",
    "workflow.s1Body":
      "Açık ilan veya genel başvuru olarak kaydet, iş akışını ve başlangıç tarihini seç.",
    "workflow.s2Title": "Adımlar otomatik planlansın",
    "workflow.s2Body":
      "Bağlantı, ilk mesaj, 7. gün ve 14. gün takipleri hafta sonları atlanarak otomatik hesaplanır.",
    "workflow.s3Title": "Bugün panelinden tamamla",
    "workflow.s3Body":
      "Hazır şablonu tek tıkla kopyala, adımı tamamla veya ertele; yanıt gelince akış otomatik durur.",
    "download.eyebrow": "İndir",
    "download.heading": "İşletim sistemine uygun sürümü seç",
    "download.subheading":
      "Tüm kurulum dosyaları GitHub Actions üzerinde açık kaynak koddan otomatik derlenir.",
    "download.winDesc": "Windows 10 / 11 (64-bit)",
    "download.macDesc": "Apple Silicon & Intel",
    "download.linuxDesc": "Ubuntu, Debian, Fedora vb.",
    "download.noteTitle": "İlk açılışta güvenlik uyarısı görürseniz (imzasız açık kaynak derleme)",
    "download.noteBody":
      'Windows SmartScreen penceresinde "Ek bilgi → Yine de çalıştır" seçeneğini kullanın. macOS\'ta uygulamaya sağ tıklayıp "Aç" deyin veya Terminal\'de xattr -cr /Applications/Jobfollo.app komutunu çalıştırın.',
    "privacy.eyebrow": "Gizlilik & Güvenlik",
    "privacy.heading": "Verilerin yalnızca senin cihazında kalır",
    "privacy.body":
      "Jobfollo tüm kayıtlarını yerel bir SQLite dosyasında tutar. Hesap, bulut senkronizasyonu veya telemetri yoktur. SMTP şifren yalnızca işletim sisteminin güvenli anahtarlığında (OS Keychain) saklanır ve yedeklere asla dahil edilmez.",
    "privacy.ctaSecurity": "Güvenlik Politikası",
    "privacy.ctaArch": "Mimari",
    downloadFor: {
      windows: "Windows için İndir",
      macos: "macOS için İndir",
      linux: "Linux için İndir",
      unknown: "Ücretsiz İndir",
    },
  },
  en: {
    "nav.features": "Features",
    "nav.workflow": "How It Works",
    "nav.download": "Download",
    "nav.privacy": "Privacy",
    "hero.badge": "Open Source · 100% Local-First · Free",
    "hero.titleLine1": "Never miss a follow-up,",
    "hero.titleLine2": "stay ahead of every application.",
    "hero.subtitle":
      "Track open job postings, spontaneous general applications, automated follow-up steps, monthly calendar, and reusable email/message templates — all in one fast, private desktop app.",
    "hero.downloadCta": "Download Free",
    "hero.githubCta": "Explore Source",
    "trust.local": "Single SQLite file",
    "trust.noAccount": "No account needed",
    "trust.os": "Windows · macOS · Linux",
    "trust.license": "MIT License",
    "mock.groupTracking": "Tracking",
    "mock.today": "Today",
    "mock.jobPostings": "Job postings",
    "mock.templates": "Templates",
    "mock.stats": "Statistics",
    "mock.todayTitle": "Today",
    "mock.todaySub": "Your overdue and due-today follow-ups",
    "mock.overdue": "Overdue",
    "mock.dueToday": "Due today",
    "mock.overdue1": "1 day overdue",
    "mock.step1": "Send 7-day follow-up email",
    "mock.step2": "LinkedIn connection request & short note",
    "mock.step3": "Post-interview thank-you email",
    "mock.done": "Done",
    "mock.snooze": "Snooze",
    "mock.interview": "Interview",
    "mock.postingsTitle": "Job posting applications",
    "mock.postingsSub": "Manage every opening in Table or Kanban view",
    "mock.newPosting": "+ New job posting",
    "mock.templatesTitle": "Email & message templates",
    "mock.templatesSub": "Live placeholder preview and 1-click copy",
    "mock.copyBtn": "Copy body",
    "mock.statsTitle": "Local statistics",
    "mock.statsSub": "Conversion funnel and weekly application goal",
    "features.eyebrow": "Features",
    "features.heading": "Replace messy spreadsheets with a calm system",
    "features.subheading":
      "Know the exact next step and due date for every application the moment you open the app.",
    "features.f1Title": "Dedicated Job Postings & General Applications Tabs",
    "features.f1Body":
      "Keep open job postings and spontaneous company outreach cleanly separated with Table and drag-and-drop Kanban views. Track company, location, work mode, salary, priority, and CV version.",
    "features.f2Title": "Monthly Calendar & .ics",
    "features.f2Body":
      "See every scheduled step across the month, automatically shift weekend dates to Monday, and export any step as .ics.",
    "features.f3Title": "Email & Message Templates",
    "features.f3Body":
      "6 built-in TR/EN templates plus your own custom library. Fill placeholders live from any application, copy in one click, or open in your mail client.",
    "features.f4Title": "Desktop Notifications, System Tray & Daily Email Digest",
    "features.f4Body":
      "Get native OS notifications without SMTP or send yourself a daily digest via your own SMTP server. Minimizes quietly to tray and starts at login.",
    "features.f5Title": "Local Analytics & Goal",
    "features.f5Body":
      "Track response, interview, and offer conversion rates, outcome funnel, and your weekly application target.",
    "features.f6Title": "Customizable Workflows",
    "features.f6Body":
      "Duplicate built-in cadences or craft your own multi-step schedules and message templates.",
    "features.f7Title": "5 Palettes, CSV & Backups",
    "features.f7Body":
      "TR/EN interface, Light/Dark themes, 5 color palettes, CSV import/export, and 1-click JSON backups.",
    "workflow.eyebrow": "How It Works",
    "workflow.heading": "Three steps to effortless follow-ups",
    "workflow.s1Title": "Log your application",
    "workflow.s1Body":
      "Add an open job posting or general application, pick a cadence workflow and start date.",
    "workflow.s2Title": "Steps schedule automatically",
    "workflow.s2Body":
      "Connect, message, day-7 and day-14 follow-ups are calculated automatically — skipping weekends.",
    "workflow.s3Title": "Act from your Today view",
    "workflow.s3Body":
      "Copy a personalized template in one click, complete or snooze; setting an outcome stops pending steps.",
    "download.eyebrow": "Download",
    "download.heading": "Choose the installer for your platform",
    "download.subheading":
      "Every installer is built transparently from source via GitHub Actions.",
    "download.winDesc": "Windows 10 / 11 (64-bit)",
    "download.macDesc": "Apple Silicon & Intel",
    "download.linuxDesc": "Ubuntu, Debian, Fedora, etc.",
    "download.noteTitle": "Seeing a security prompt on first launch? (unsigned open-source build)",
    "download.noteBody":
      'On Windows SmartScreen, click "More info → Run anyway". On macOS, right-click the app and choose "Open", or run xattr -cr /Applications/Jobfollo.app in Terminal.',
    "privacy.eyebrow": "Privacy & Security",
    "privacy.heading": "Your data never leaves your machine",
    "privacy.body":
      "Jobfollo stores everything in a single local SQLite database. There are no accounts, no cloud sync, and no telemetry. Your SMTP password stays strictly in your OS keychain and is never included in backups.",
    "privacy.ctaSecurity": "Security Policy",
    "privacy.ctaArch": "Architecture",
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

let currentTheme = localStorage.getItem("jobfollo_site_theme") || "dark";
const detectedOS = detectOS();

function applyTheme() {
  document.documentElement.classList.toggle("dark", currentTheme === "dark");
}

function applyLang() {
  const dict = COPY[currentLang] || COPY.en;
  document.documentElement.lang = currentLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && dict[key]) el.textContent = dict[key];
  });
  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) langBtn.textContent = currentLang === "tr" ? "EN" : "TR";

  const primaryLabel = document.getElementById("primary-download-label");
  if (primaryLabel) {
    primaryLabel.textContent = dict.downloadFor[detectedOS] || dict.downloadFor.unknown;
  }
}

function wireShowcaseTabs() {
  const tabs = document.querySelectorAll(".mock-nav[data-screen]");
  const panels = document.querySelectorAll(".mock-panel[data-panel]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-screen");
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
      });
      panels.forEach((p) => {
        p.classList.toggle("active", p.getAttribute("data-panel") === target);
      });
    });
  });
}

function highlightOSCard() {
  if (detectedOS === "unknown") return;
  const card = document.querySelector(`.dl-card[data-os="${detectedOS}"]`);
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
    // Fallback links already point to GitHub Releases
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
wireShowcaseTabs();
highlightOSCard();
void hydrateLatestRelease();
