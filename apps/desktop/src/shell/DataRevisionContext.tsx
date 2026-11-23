import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface DataRevisionContextValue {
  revision: number;
  bumpRevision: () => void;
}

const DataRevisionContext = createContext<DataRevisionContextValue | null>(null);

export interface DataRevisionProviderProps {
  children: ReactNode;
}

export function DataRevisionProvider({ children }: DataRevisionProviderProps) {
  const [revision, setRevision] = useState(0);

  const bumpRevision = useCallback(() => {
    setRevision((prev) => prev + 1);
  }, []);

  const value = useMemo<DataRevisionContextValue>(
    () => ({ revision, bumpRevision }),
    [revision, bumpRevision],
  );

  return <DataRevisionContext.Provider value={value}>{children}</DataRevisionContext.Provider>;
}

export function useDataRevision(): DataRevisionContextValue {
  const ctx = useContext(DataRevisionContext);
  if (!ctx) {
    throw new Error("useDataRevision must be used inside a DataRevisionProvider");
  }
  return ctx;
}
