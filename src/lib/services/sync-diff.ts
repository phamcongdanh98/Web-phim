export interface SyncFile {
  id: string;
  name: string;
  size: number | null;
}

export interface SyncEpisode {
  id: string;
  storage_file_id: string;
  file_status: string;
  storage_file_name: string | null;
}

export interface SyncReport {
  /** On Drive, not linked to any episode. */
  newFiles: SyncFile[];
  /** On Drive and linked. */
  linked: { episodeId: string; fileId: string; name: string }[];
  /** Linked in DB but gone from Drive. */
  missing: { episodeId: string; fileId: string; name: string | null }[];
  markMissing: string[];
  markRecovered: string[];
}

/** Pure diff between a Drive scan and DB episodes (unit-tested). */
export function diffSync(driveFiles: SyncFile[], episodes: SyncEpisode[]): SyncReport {
  const byFile = new Map(episodes.map((e) => [e.storage_file_id, e]));
  const onDrive = new Set(driveFiles.map((f) => f.id));
  const report: SyncReport = { newFiles: [], linked: [], missing: [], markMissing: [], markRecovered: [] };

  for (const f of driveFiles) {
    const ep = byFile.get(f.id);
    if (!ep) report.newFiles.push({ id: f.id, name: f.name, size: f.size });
    else {
      report.linked.push({ episodeId: ep.id, fileId: f.id, name: f.name });
      if (ep.file_status === "missing") report.markRecovered.push(ep.id);
    }
  }
  for (const ep of episodes) {
    if (!onDrive.has(ep.storage_file_id)) {
      report.missing.push({ episodeId: ep.id, fileId: ep.storage_file_id, name: ep.storage_file_name });
      if (ep.file_status !== "missing") report.markMissing.push(ep.id);
    }
  }
  return report;
}
