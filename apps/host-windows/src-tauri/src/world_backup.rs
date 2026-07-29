use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::{self, Read},
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const WORLD_DIRECTORIES: [&str; 4] = [
    "teacher_world",
    "teacher_world_nether",
    "teacher_world_the_end",
    "badgerbots_sheep_city_prototype",
];
const SHEEP_CITY_WORLD: &str = "badgerbots_sheep_city_prototype";
const MAX_BACKUPS: usize = 5;
const MAX_FILES: usize = 100_000;
const MAX_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const BACKUP_REASONS: [&str; 4] = [
    "automatic-before-start",
    "manual",
    "before-sheep-city-reset",
    "recovery-after-interruption",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorldBackupReport {
    pub backup_id: String,
    pub created_at: String,
    pub reason: String,
    pub world_count: usize,
    pub file_count: usize,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorldBackupManifest {
    schema_version: u8,
    backup_id: String,
    created_at: String,
    #[serde(default = "legacy_reason")]
    reason: String,
    files: Vec<BackupFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BackupFile {
    path: String,
    size: u64,
    sha256: String,
}

pub(crate) fn create(runtime: &Path, reason: &str) -> Result<WorldBackupReport, String> {
    if !BACKUP_REASONS.contains(&reason) {
        return Err("The world backup reason is unsupported.".to_string());
    }
    let backup_root = runtime.join("backups");
    fs::create_dir_all(&backup_root)
        .map_err(|_| "The managed backup directory could not be prepared.".to_string())?;
    cleanup_staging(&backup_root);

    let (backup_id, created_at) = new_backup_identity()?;
    let staging = backup_root.join(format!(".creating-{backup_id}"));
    let staging_worlds = staging.join("worlds");
    fs::create_dir_all(&staging_worlds)
        .map_err(|_| "The world backup could not be staged.".to_string())?;

    let result = (|| {
        let mut files = Vec::new();
        let mut total_bytes = 0_u64;
        let mut world_count = 0_usize;
        let mut included_worlds = BTreeSet::new();
        for world_name in WORLD_DIRECTORIES {
            let source = runtime.join(world_name);
            if !source.exists() {
                continue;
            }
            if !source.is_dir() {
                return Err(format!(
                    "The managed world {world_name} is not a directory. Backup stopped safely."
                ));
            }
            world_count += 1;
            included_worlds.insert(world_name);
            copy_tree(
                &source,
                &staging_worlds.join(world_name),
                Path::new(world_name),
                &mut files,
                &mut total_bytes,
            )?;
        }
        if world_count == 0 {
            return Err(
                "No managed Minecraft worlds exist yet. Run the graphical server test first."
                    .to_string(),
            );
        }
        if !included_worlds.contains("teacher_world") || !included_worlds.contains(SHEEP_CITY_WORLD)
        {
            return Err(
                "A complete operational backup requires both the teacher world and Sheep City."
                    .to_string(),
            );
        }
        files.sort_by(|left, right| left.path.cmp(&right.path));
        let manifest = WorldBackupManifest {
            schema_version: 1,
            backup_id: backup_id.clone(),
            created_at: created_at.clone(),
            reason: reason.to_string(),
            files,
        };
        write_json_atomic(&staging.join("manifest.json"), &manifest)?;
        verify_files(&staging_worlds, &manifest.files)?;
        let report = report_from_manifest(&manifest);
        let destination = backup_root.join(&backup_id);
        fs::rename(&staging, &destination).map_err(|_| {
            "The verified world backup could not be committed atomically.".to_string()
        })?;
        rotate(&backup_root)?;
        Ok(report)
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

pub(crate) fn verify_latest(runtime: &Path) -> Result<WorldBackupReport, String> {
    let latest = latest_backup_directory(runtime)?;
    verify_directory(&latest)
}

pub(crate) fn inventory(runtime: &Path) -> Result<Vec<WorldBackupReport>, String> {
    let mut backups = backup_directories(&runtime.join("backups"))?;
    backups.sort();
    backups.reverse();
    backups
        .into_iter()
        .map(|directory| read_manifest(&directory).map(|manifest| report_from_manifest(&manifest)))
        .collect()
}

pub(crate) fn restore(runtime: &Path, backup_id: &str) -> Result<WorldBackupReport, String> {
    let backup = backup_directories(&runtime.join("backups"))?
        .into_iter()
        .find(|directory| directory.file_name().and_then(|name| name.to_str()) == Some(backup_id))
        .ok_or_else(|| {
            "The selected world backup no longer exists. Refresh Host and choose another snapshot."
                .to_string()
        })?;
    let report = verify_directory(&backup)?;
    let manifest = read_manifest(&backup)?;
    let (operation_id, _) = new_backup_identity()?;
    let staging = runtime.join(format!(".restore-staging-{operation_id}"));
    let rollback = runtime.join(format!(".restore-rollback-{operation_id}"));
    fs::create_dir_all(&staging)
        .map_err(|_| "The restore staging directory could not be created.".to_string())?;

    let result = (|| {
        copy_manifest_files(&backup.join("worlds"), &staging, &manifest)?;
        verify_files(&staging, &manifest.files)?;
        fs::create_dir_all(&rollback)
            .map_err(|_| "The restore rollback directory could not be created.".to_string())?;

        let mut moved_previous = Vec::new();
        let mut installed = Vec::new();
        for world_name in WORLD_DIRECTORIES {
            let current = runtime.join(world_name);
            if current.exists() {
                fs::rename(&current, rollback.join(world_name)).map_err(|_| {
                    rollback_restore(runtime, &rollback, &moved_previous, &installed);
                    format!("The current {world_name} world could not be staged for restore.")
                })?;
                moved_previous.push(world_name);
            }
        }
        for world_name in WORLD_DIRECTORIES {
            let replacement = staging.join(world_name);
            if replacement.exists() {
                if fs::rename(&replacement, runtime.join(world_name)).is_err() {
                    rollback_restore(runtime, &rollback, &moved_previous, &installed);
                    return Err(format!(
                        "The restored {world_name} world could not be committed atomically."
                    ));
                }
                installed.push(world_name);
            }
        }
        let _ = remove_if_exists(&rollback);
        let _ = remove_if_exists(&staging);
        Ok(report)
    })();

    if result.is_err() {
        let _ = remove_if_exists(&staging);
    }
    result
}

pub(crate) fn reset_sheep_city(runtime: &Path) -> Result<(), String> {
    let target = runtime.join(SHEEP_CITY_WORLD);
    if !target.exists() {
        return Err(
            "Sheep City has not been generated yet. Start the server once before resetting it."
                .to_string(),
        );
    }
    if !target.is_dir() {
        return Err(
            "The Sheep City working world is invalid. Restore a verified backup.".to_string(),
        );
    }
    let (_, stamp) = new_backup_identity()?;
    let discarded = runtime
        .join("backups")
        .join(format!(".discarded-sheep-city-{stamp}"));
    fs::rename(&target, &discarded)
        .map_err(|_| "Sheep City could not be staged for a safe reset.".to_string())?;
    let _ = fs::remove_dir_all(&discarded);
    Ok(())
}

fn copy_tree(
    source: &Path,
    destination: &Path,
    relative: &Path,
    files: &mut Vec<BackupFile>,
    total_bytes: &mut u64,
) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|_| "A world backup directory could not be staged.".to_string())?;
    let mut entries = fs::read_dir(source)
        .map_err(|_| "A managed world directory could not be read.".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "A managed world entry could not be read.".to_string())?;
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|_| "A managed world entry could not be inspected.".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("World backups do not follow symbolic links or junctions.".to_string());
        }
        let child_relative = relative.join(entry.file_name());
        let child_destination = destination.join(entry.file_name());
        if metadata.is_dir() {
            copy_tree(
                &entry.path(),
                &child_destination,
                &child_relative,
                files,
                total_bytes,
            )?;
        } else if metadata.is_file() {
            if entry.file_name() == "session.lock" {
                continue;
            }
            *total_bytes = total_bytes
                .checked_add(metadata.len())
                .ok_or_else(|| "The world backup size could not be bounded.".to_string())?;
            if *total_bytes > MAX_TOTAL_BYTES {
                return Err("Managed worlds exceed the 4 GiB operational backup limit.".to_string());
            }
            if files.len() >= MAX_FILES {
                return Err("Managed worlds exceed the 100,000-file backup limit.".to_string());
            }
            fs::copy(entry.path(), &child_destination)
                .map_err(|_| "A managed world file could not be copied.".to_string())?;
            files.push(BackupFile {
                path: portable_path(&child_relative)?,
                size: metadata.len(),
                sha256: checksum_file_streaming(&child_destination)?,
            });
        } else {
            return Err("World backups accept only regular files and directories.".to_string());
        }
    }
    Ok(())
}

fn copy_manifest_files(
    source_root: &Path,
    destination_root: &Path,
    manifest: &WorldBackupManifest,
) -> Result<(), String> {
    for file in &manifest.files {
        let relative = safe_relative(&file.path)?;
        let source = source_root.join(&relative);
        let destination = destination_root.join(&relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|_| "A restore directory could not be staged.".to_string())?;
        }
        fs::copy(source, destination)
            .map_err(|_| "A verified backup file could not be staged for restore.".to_string())?;
    }
    Ok(())
}

fn verify_directory(directory: &Path) -> Result<WorldBackupReport, String> {
    let manifest = read_manifest(directory)?;
    verify_files(&directory.join("worlds"), &manifest.files)?;
    Ok(report_from_manifest(&manifest))
}

fn report_from_manifest(manifest: &WorldBackupManifest) -> WorldBackupReport {
    let worlds = manifest
        .files
        .iter()
        .filter_map(|file| file.path.split('/').next())
        .collect::<BTreeSet<_>>();
    WorldBackupReport {
        backup_id: manifest.backup_id.clone(),
        created_at: manifest.created_at.clone(),
        reason: manifest.reason.clone(),
        world_count: worlds.len(),
        file_count: manifest.files.len(),
        total_bytes: manifest.files.iter().map(|file| file.size).sum(),
    }
}

fn verify_files(root: &Path, expected: &[BackupFile]) -> Result<(), String> {
    if expected.len() > MAX_FILES {
        return Err("The backup manifest exceeds the file limit.".to_string());
    }
    let total_bytes = expected.iter().try_fold(0_u64, |total, file| {
        total
            .checked_add(file.size)
            .ok_or_else(|| "The backup manifest size is invalid.".to_string())
    })?;
    if total_bytes > MAX_TOTAL_BYTES {
        return Err("The backup manifest exceeds the 4 GiB limit.".to_string());
    }
    let mut declared = BTreeSet::new();
    for file in expected {
        let relative = safe_relative(&file.path)?;
        if !declared.insert(file.path.clone()) {
            return Err("The backup manifest contains a duplicate file.".to_string());
        }
        let path = root.join(relative);
        let metadata = fs::symlink_metadata(&path)
            .map_err(|_| "A file declared by the backup manifest is missing.".to_string())?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() != file.size
            || checksum_file_streaming(&path)? != file.sha256
        {
            return Err("A world backup file failed SHA-256 verification.".to_string());
        }
    }
    let actual = collect_relative_files(root)?;
    if actual != declared {
        return Err("The world backup contains undeclared or missing files.".to_string());
    }
    Ok(())
}

fn collect_relative_files(root: &Path) -> Result<BTreeSet<String>, String> {
    fn walk(root: &Path, current: &Path, files: &mut BTreeSet<String>) -> Result<(), String> {
        for entry in fs::read_dir(current)
            .map_err(|_| "The backup directory could not be inspected.".to_string())?
        {
            let entry = entry
                .map_err(|_| "A backup directory entry could not be inspected.".to_string())?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|_| "A backup entry could not be inspected.".to_string())?;
            if metadata.file_type().is_symlink() {
                return Err("A world backup contains a symbolic link or junction.".to_string());
            }
            if metadata.is_dir() {
                walk(root, &entry.path(), files)?;
            } else if metadata.is_file() {
                if files.len() >= MAX_FILES {
                    return Err("The world backup exceeds the 100,000-file limit.".to_string());
                }
                let relative = entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|_| "A backup file escaped its managed root.".to_string())?
                    .to_path_buf();
                files.insert(portable_path(&relative)?);
            } else {
                return Err("A world backup contains an unsupported file type.".to_string());
            }
        }
        Ok(())
    }
    let mut files = BTreeSet::new();
    walk(root, root, &mut files)?;
    Ok(files)
}

fn safe_relative(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("The backup manifest contains an unsafe path.".to_string());
    }
    let first = path
        .components()
        .next()
        .and_then(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .ok_or_else(|| "The backup manifest contains an empty path.".to_string())?;
    if !WORLD_DIRECTORIES.contains(&first) {
        return Err("The backup manifest names an unmanaged world.".to_string());
    }
    Ok(path.to_path_buf())
}

fn portable_path(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => parts.push(
                value
                    .to_str()
                    .ok_or_else(|| "World filenames must be valid Unicode.".to_string())?,
            ),
            _ => return Err("A managed world contained an unsafe path.".to_string()),
        }
    }
    Ok(parts.join("/"))
}

fn read_manifest(directory: &Path) -> Result<WorldBackupManifest, String> {
    let contents = fs::read_to_string(directory.join("manifest.json"))
        .map_err(|_| "The world backup manifest is missing.".to_string())?;
    let manifest: WorldBackupManifest = serde_json::from_str(&contents)
        .map_err(|_| "The world backup manifest is invalid.".to_string())?;
    if manifest.schema_version != 1
        || manifest.files.is_empty()
        || (!BACKUP_REASONS.contains(&manifest.reason.as_str()) && manifest.reason != "legacy")
        || directory.file_name().and_then(|name| name.to_str()) != Some(&manifest.backup_id)
    {
        return Err("The world backup manifest identity is invalid.".to_string());
    }
    Ok(manifest)
}

fn legacy_reason() -> String {
    "legacy".to_string()
}

fn latest_backup_directory(runtime: &Path) -> Result<PathBuf, String> {
    let mut backups = backup_directories(&runtime.join("backups"))?;
    backups.sort();
    backups.pop().ok_or_else(|| {
        "No verified world backup exists yet. Create a backup while Paper is stopped.".to_string()
    })
}

fn backup_directories(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in fs::read_dir(root)
        .map_err(|_| "The managed backup directory could not be inspected.".to_string())?
    {
        let entry =
            entry.map_err(|_| "A managed backup entry could not be inspected.".to_string())?;
        if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
            && entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.starts_with("world-"))
        {
            result.push(entry.path());
        }
    }
    Ok(result)
}

fn rotate(root: &Path) -> Result<(), String> {
    let mut backups = backup_directories(root)?;
    backups.sort();
    while backups.len() > MAX_BACKUPS {
        let oldest = backups.remove(0);
        fs::remove_dir_all(oldest)
            .map_err(|_| "An expired operational backup could not be removed.".to_string())?;
    }
    Ok(())
}

fn cleanup_staging(root: &Path) {
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            if entry.file_name().to_str().is_some_and(|name| {
                name.starts_with(".creating-") || name.starts_with(".discarded-sheep-city-")
            }) {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
}

fn rollback_restore(runtime: &Path, rollback: &Path, previous: &[&str], installed: &[&str]) {
    for world_name in installed {
        let _ = fs::remove_dir_all(runtime.join(world_name));
    }
    for world_name in previous {
        let _ = fs::rename(rollback.join(world_name), runtime.join(world_name));
    }
}

fn remove_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("A stale world-operation directory could not be removed.".to_string()),
    }
}

fn checksum_file_streaming(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|_| "A world backup file could not be opened.".to_string())?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "A world backup file could not be read.".to_string())?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| "The world backup manifest could not be serialized.".to_string())?;
    let temporary = path.with_extension("json.new");
    fs::write(&temporary, bytes)
        .map_err(|_| "The world backup manifest could not be staged.".to_string())?;
    fs::rename(temporary, path)
        .map_err(|_| "The world backup manifest could not be saved atomically.".to_string())
}

fn new_backup_identity() -> Result<(String, String), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "The system clock cannot create a backup identity.".to_string())?;
    let mut random = [0_u8; 4];
    getrandom::fill(&mut random)
        .map_err(|_| "A secure backup identity could not be created.".to_string())?;
    let suffix = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok((
        format!("world-{}-{suffix}", now.as_nanos()),
        format!("unix-{}", now.as_secs()),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PathBuf {
        let mut random = [0_u8; 4];
        getrandom::fill(&mut random).expect("test identity should be generated");
        let directory = std::env::temp_dir().join(format!(
            "badgerbots-world-backup-{}-{:x?}",
            std::process::id(),
            random
        ));
        fs::create_dir_all(directory.join("teacher_world/region"))
            .expect("teacher world should be created");
        fs::create_dir_all(directory.join(SHEEP_CITY_WORLD).join("region"))
            .expect("Sheep City should be created");
        fs::write(directory.join("teacher_world/level.dat"), b"teacher-v1")
            .expect("teacher fixture should be written");
        fs::write(
            directory.join(SHEEP_CITY_WORLD).join("region/r.0.0.mca"),
            b"sheep-v1",
        )
        .expect("Sheep City fixture should be written");
        directory
    }

    #[test]
    fn creates_and_verifies_a_bounded_world_backup() {
        let runtime = fixture();
        let report = create(&runtime, "automatic-before-start").expect("backup should succeed");
        assert_eq!(report.world_count, 2);
        assert_eq!(report.file_count, 2);
        assert_eq!(verify_latest(&runtime), Ok(report));
        fs::remove_dir_all(runtime).expect("fixture should be removed");
    }

    #[test]
    fn rejects_a_tampered_world_backup() {
        let runtime = fixture();
        let report = create(&runtime, "manual").expect("backup should succeed");
        fs::write(
            runtime
                .join("backups")
                .join(report.backup_id)
                .join("worlds/teacher_world/level.dat"),
            b"tampered",
        )
        .expect("backup should be tampered");
        assert!(verify_latest(&runtime).is_err());
        fs::remove_dir_all(runtime).expect("fixture should be removed");
    }

    #[test]
    fn refuses_an_incomplete_operational_snapshot() {
        let runtime = fixture();
        fs::remove_dir_all(runtime.join(SHEEP_CITY_WORLD))
            .expect("Sheep City fixture should be removed");
        assert!(create(&runtime, "manual").is_err());
        assert!(
            backup_directories(&runtime.join("backups"))
                .expect("backup inventory should load")
                .is_empty()
        );
        fs::remove_dir_all(runtime).expect("fixture should be removed");
    }

    #[test]
    fn restores_the_selected_older_snapshot_without_leaving_the_changed_world() {
        let runtime = fixture();
        let intact = create(&runtime, "automatic-before-start").expect("backup should succeed");
        fs::write(runtime.join("teacher_world/level.dat"), b"teacher-v2")
            .expect("working world should change");
        let changed = create(&runtime, "manual").expect("changed-world backup should succeed");
        let snapshots = inventory(&runtime).expect("backup history should load");
        assert_eq!(
            snapshots
                .iter()
                .map(|snapshot| snapshot.backup_id.as_str())
                .collect::<Vec<_>>(),
            vec![changed.backup_id.as_str(), intact.backup_id.as_str()]
        );
        assert_eq!(snapshots[0].reason, "manual");
        assert_eq!(snapshots[1].reason, "automatic-before-start");
        let restored = restore(&runtime, &intact.backup_id).expect("restore should succeed");
        assert_eq!(restored, intact);
        assert_eq!(
            fs::read(runtime.join("teacher_world/level.dat")).expect("world should be readable"),
            b"teacher-v1"
        );
        fs::remove_dir_all(runtime).expect("fixture should be removed");
    }

    #[test]
    fn resets_only_sheep_city_after_a_verified_backup() {
        let runtime = fixture();
        create(&runtime, "before-sheep-city-reset").expect("backup should succeed");
        reset_sheep_city(&runtime).expect("reset should succeed");
        assert!(!runtime.join(SHEEP_CITY_WORLD).exists());
        assert!(runtime.join("teacher_world").exists());
        assert!(verify_latest(&runtime).is_ok());
        fs::remove_dir_all(runtime).expect("fixture should be removed");
    }

    #[test]
    fn retains_only_the_newest_five_operational_backups() {
        let runtime = fixture();
        for revision in 0..7 {
            fs::write(
                runtime.join("teacher_world/level.dat"),
                format!("teacher-v{revision}"),
            )
            .expect("working world should change");
            create(&runtime, "manual").expect("backup should succeed");
        }
        assert_eq!(
            backup_directories(&runtime.join("backups"))
                .expect("backup inventory should load")
                .len(),
            MAX_BACKUPS
        );
        fs::remove_dir_all(runtime).expect("fixture should be removed");
    }
}
