import type { Dispatch, SetStateAction } from "react";
import type { MigrationState } from "../types/migration";

export interface PageProps {
  state: MigrationState;
  updateState: (patch: Partial<MigrationState>) => void;
  updateNested: <Key extends keyof MigrationState>(
    key: Key,
    value: Partial<MigrationState[Key]>,
  ) => void;
  goNext: () => void;
  goBack: () => void;
  busy: boolean;
  setNotice: Dispatch<SetStateAction<string>>;
}
