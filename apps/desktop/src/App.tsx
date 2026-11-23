import { useSyncExternalStore } from "react";
import { HashRouter } from "react-router";
import {
  BootErrorScreen,
  BootLoadingScreen,
  ServicesProvider,
  getBootSnapshot,
  resolveBootLocale,
  retryBoot,
  subscribeBoot,
} from "./boot/index.js";
import { AppShell, DataRevisionProvider, PreferencesProvider } from "./shell/index.js";

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
      <DataRevisionProvider>
        <PreferencesProvider>
          <HashRouter>
            <AppShell />
          </HashRouter>
        </PreferencesProvider>
      </DataRevisionProvider>
    </ServicesProvider>
  );
}

export default App;
