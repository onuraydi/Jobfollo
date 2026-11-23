import type { BootErrorKind } from "./types.js";

export type BootLocale = "tr" | "en";

export function resolveBootLocale(language: string | undefined): BootLocale {
  if (typeof language === "string" && language.toLowerCase().startsWith("tr")) {
    return "tr";
  }
  return "en";
}

export interface BootErrorCopy {
  title: string;
  explanation: string;
  guidance: string;
  canRetry: boolean;
}

export interface BootMessageBundle {
  loading: string;
  readySubtitle: string;
  dataFolderLabel: string;
  technicalDetailsSummary: string;
  copyButton: string;
  copiedButton: string;
  copyFallbackHint: string;
  retryButton: string;
  errors: Record<BootErrorKind, BootErrorCopy>;
}

export const BOOT_MESSAGES: Record<BootLocale, BootMessageBundle> = {
  en: {
    loading: "Starting Jobfollo…",
    readySubtitle: "Ready",
    dataFolderLabel: "Data folder",
    technicalDetailsSummary: "Technical details",
    copyButton: "Copy details",
    copiedButton: "Copied",
    copyFallbackHint: "Select and copy the text below.",
    retryButton: "Try again",
    errors: {
      unsupported_environment: {
        title: "Unsupported environment",
        explanation:
          "This runtime does not provide the required browser cryptography features (WebCrypto SHA-256 and random values) needed to verify your local database.",
        guidance: "Please report this issue with the technical details below.",
        canRetry: false,
      },
      open_failed: {
        title: "Could not open your database",
        explanation:
          "Jobfollo could not open or create its local database file. Your existing data was not modified.",
        guidance: "Check folder permissions or disk availability, then try again.",
        canRetry: true,
      },
      database_busy: {
        title: "Database is busy",
        explanation:
          "Another process or another Jobfollo window is currently using the database file.",
        guidance: "Close any other Jobfollo window and try again.",
        canRetry: true,
      },
      database_io: {
        title: "Storage error",
        explanation:
          "A disk input/output error occurred while accessing your local database.",
        guidance: "Check available disk space and drive health, then try again.",
        canRetry: true,
      },
      database_newer: {
        title: "Database requires a newer version of Jobfollo",
        explanation:
          "Your local database was updated by a newer version of Jobfollo. To protect your data, this older version will not modify it.",
        guidance: "Please update Jobfollo to the latest version and open it again.",
        canRetry: false,
      },
      migration_checksum: {
        title: "Application installation appears damaged",
        explanation:
          "A database migration check failed because the installed application files do not match the recorded database history.",
        guidance: "Please reinstall Jobfollo without removing your data folder.",
        canRetry: false,
      },
      migration_invalid: {
        title: "Invalid application migration set",
        explanation:
          "The built-in database migration sequence in this build is inconsistent.",
        guidance: "Please reinstall Jobfollo from an official release.",
        canRetry: false,
      },
      migration_failed: {
        title: "Database upgrade failed",
        explanation:
          "Updating the database schema did not complete. All changes were rolled back so your data remains intact.",
        guidance: "Please report this issue with the technical details below.",
        canRetry: false,
      },
      unknown: {
        title: "Jobfollo could not start",
        explanation: "An unexpected error occurred during startup.",
        guidance: "Please report this issue with the technical details below.",
        canRetry: false,
      },
    },
  },
  tr: {
    loading: "Jobfollo başlatılıyor…",
    readySubtitle: "Hazır",
    dataFolderLabel: "Veri klasörü",
    technicalDetailsSummary: "Teknik ayrıntılar",
    copyButton: "Ayrıntıları kopyala",
    copiedButton: "Kopyalandı",
    copyFallbackHint: "Aşağıdaki metni seçip kopyalayabilirsiniz.",
    retryButton: "Tekrar dene",
    errors: {
      unsupported_environment: {
        title: "Desteklenmeyen çalışma ortamı",
        explanation:
          "Bu ortam, yerel veritabanınızı doğrulamak için gereken WebCrypto (SHA-256 ve rastgele değer üretimi) özelliklerini sunmuyor.",
        guidance: "Lütfen aşağıdaki teknik ayrıntılarla birlikte bu sorunu bildirin.",
        canRetry: false,
      },
      open_failed: {
        title: "Veritabanı açılamadı",
        explanation:
          "Jobfollo yerel veritabanı dosyasını açamadı veya oluşturamadı. Mevcut verilerinize dokunulmadı.",
        guidance: "Klasör izinlerini ve disk erişimini kontrol edip tekrar deneyin.",
        canRetry: true,
      },
      database_busy: {
        title: "Veritabanı meşgul",
        explanation:
          "Veritabanı dosyası şu anda başka bir işlem veya başka bir Jobfollo penceresi tarafından kullanılıyor.",
        guidance: "Diğer Jobfollo pencerelerini kapatıp tekrar deneyin.",
        canRetry: true,
      },
      database_io: {
        title: "Depolama hatası",
        explanation: "Yerel veritabanına erişilirken bir disk okuma/yazma hatası oluştu.",
        guidance: "Boş disk alanını ve sürücü durumunu kontrol edip tekrar deneyin.",
        canRetry: true,
      },
      database_newer: {
        title: "Veritabanı daha yeni bir Jobfollo sürümü gerektiriyor",
        explanation:
          "Yerel veritabanınız daha yeni bir Jobfollo sürümüyle güncellenmiş. Verilerinizi korumak için bu eski sürüm değişiklik yapmayacaktır.",
        guidance: "Lütfen Jobfollo'yu en son sürüme güncelleyip yeniden açın.",
        canRetry: false,
      },
      migration_checksum: {
        title: "Uygulama kurulumu tutarsız görünüyor",
        explanation:
          "Kurulu uygulama dosyaları veritabanı geçmişindeki doğrulama özetiyle eşleşmiyor.",
        guidance: "Veri klasörünüze dokunmadan Jobfollo'yu yeniden kurun.",
        canRetry: false,
      },
      migration_invalid: {
        title: "Geçersiz veritabanı geçiş tanımı",
        explanation: "Bu derlemedeki yerleşik veritabanı geçiş sırası tutarsız.",
        guidance: "Lütfen Jobfollo'yu resmi sürümden yeniden kurun.",
        canRetry: false,
      },
      migration_failed: {
        title: "Veritabanı yükseltmesi tamamlanamadı",
        explanation:
          "Veritabanı şeması güncellenirken hata oluştu. Tüm değişiklikler geri alındığı için verileriniz korundu.",
        guidance: "Lütfen aşağıdaki teknik ayrıntılarla birlikte bu sorunu bildirin.",
        canRetry: false,
      },
      unknown: {
        title: "Jobfollo başlatılamadı",
        explanation: "Başlatma sırasında beklenmeyen bir hata oluştu.",
        guidance: "Lütfen aşağıdaki teknik ayrıntılarla birlikte bu sorunu bildirin.",
        canRetry: false,
      },
    },
  },
};
