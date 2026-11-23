import { useSyncExternalStore } from "react";
import {
  BOOT_MESSAGES,
  BootErrorScreen,
  BootLoadingScreen,
  ServicesProvider,
  getBootSnapshot,
  resolveBootLocale,
  retryBoot,
  subscribeBoot,
} from "./boot/index.js";

export function App() {
  const snapshot = useSyncExternalStore(subscribeBoot, getBootSnapshot, getBootSnapshot);
  const locale = resolveBootLocale(
    typeof navigator !== "undefined" ? navigator.language : undefined,
  );

  if (snapshot.status === "loading") {
    return <BootLoadingScreen locale={locale} />;
  }

  if (snapshot.status === "error") {
    return (
      <BootErrorScreen
        error={snapshot.error}
        dataLocation={snapshot.dataLocation}
        locale={locale}
        onRetry={() => {
          void retryBoot();
        }}
      />
    );
  }

  return (
    <ServicesProvider services={snapshot.services}>
      <main>
        <h1>Jobfollo</h1>
        <p>{BOOT_MESSAGES[locale].readySubtitle}</p>
      </main>
    </ServicesProvider>
  );
}

export default App;
