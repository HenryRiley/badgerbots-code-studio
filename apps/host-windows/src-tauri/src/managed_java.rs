use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(windows)]
use std::env;
#[cfg(any(windows, test))]
use std::io::{Cursor, Write};
use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::Read,
    path::{Component, Path, PathBuf},
    process::Command,
};

pub(crate) const JAVA_VERSION: &str = "Eclipse Temurin JRE 21.0.11+10";
pub(crate) const JAVA_ARCHIVE_SHA256: &str =
    "be26677aaa20b39a62edcaab4c8857a8b76673b0f45abc0b6143b142b62717e4";
#[cfg(windows)]
const JAVA_ARCHIVE_URL: &str = "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jre_x64_windows_hotspot_21.0.11_10.zip";
const JAVA_DIRECTORY_NAME: &str = "temurin-21.0.11+10-windows-x64";
const EXTERNAL_JAVA_MANIFEST_NAME: &str = "existing-java.json";
#[cfg(windows)]
const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
#[cfg(any(windows, test))]
const MAX_EXPANDED_BYTES: u64 = 256 * 1024 * 1024;
#[cfg(any(windows, test))]
const MAX_ARCHIVE_ENTRIES: usize = 4_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallProgress {
    pub phase: String,
    pub message: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<u8>,
    pub repair: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct ManagedJava {
    pub version: String,
    pub fingerprint: String,
    pub executable_path: PathBuf,
    pub repaired: bool,
    pub source: JavaSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum JavaSource {
    ExistingSystem,
    PrivatePinned,
}

impl JavaSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::ExistingSystem => "existing-system",
            Self::PrivatePinned => "private-pinned",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JavaManifest {
    schema_version: u8,
    vendor: String,
    version: String,
    archive_sha256: String,
    files: Vec<InstalledFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
struct InstalledFile {
    path: String,
    bytes: u64,
    sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExistingJavaManifest {
    schema_version: u8,
    executable_path: PathBuf,
    executable_sha256: String,
    version: String,
}

pub(crate) async fn ensure(
    runtime_directory: &Path,
    progress: &(dyn Fn(InstallProgress) + Send + Sync),
) -> Result<ManagedJava, String> {
    let root = runtime_directory.join("managed-java");
    let installation = root.join(JAVA_DIRECTORY_NAME);
    let manifest_path = root.join("manifest.json");
    let repair = installation.exists() || manifest_path.exists();

    emit(
        progress,
        "checking",
        "Checking the private BadgerBots Java 21 runtime…",
        0,
        None,
        None,
        repair,
    );
    if let Ok(manifest) = verify_installation(&installation, &manifest_path) {
        let executable_path = java_executable(&installation);
        let version = inspect_java_process(&executable_path)?;
        emit(
            progress,
            "verifying",
            "Managed Java 21 is verified; checking Paper and the BadgerBots plugin…",
            0,
            None,
            Some(15),
            false,
        );
        return Ok(ManagedJava {
            version,
            fingerprint: manifest.archive_sha256,
            executable_path,
            repaired: false,
            source: JavaSource::PrivatePinned,
        });
    }

    #[cfg(not(windows))]
    {
        let _ = (runtime_directory, progress, repair);
        Err(
            "The managed Java download is for the Windows Host. Use the browser preview on macOS or run the installed Host on Windows."
                .to_string(),
        )
    }

    #[cfg(windows)]
    {
        if std::env::consts::ARCH != "x86_64" {
            return Err(
                "This prototype currently supports the Windows x64 Host only; no Java runtime was installed."
                    .to_string(),
            );
        }
        fs::create_dir_all(&root)
            .map_err(|_| "The private Java runtime directory could not be prepared.".to_string())?;
        emit(
            progress,
            "checking",
            "Looking for an existing compatible Java 21 installation…",
            0,
            None,
            Some(5),
            repair,
        );
        if let Some(java) = find_existing_java(&root)? {
            emit(
                progress,
                "verifying",
                "Compatible Java 21 found and verified; no duplicate runtime was installed.",
                0,
                None,
                Some(15),
                false,
            );
            return Ok(java);
        }
        emit(
            progress,
            "downloading",
            if repair {
                "Repairing Java 21: downloading a clean pinned copy…"
            } else {
                "Downloading the pinned Java 21 runtime…"
            },
            0,
            None,
            Some(0),
            repair,
        );
        let archive = download(progress, repair).await?;
        emit(
            progress,
            "verifying",
            "Verifying the Java 21 archive checksum…",
            archive.len() as u64,
            Some(archive.len() as u64),
            Some(76),
            repair,
        );
        verify_checksum(&archive, JAVA_ARCHIVE_SHA256)?;

        let staging = root.join(format!("{JAVA_DIRECTORY_NAME}.installing"));
        let previous = root.join(format!("{JAVA_DIRECTORY_NAME}.previous"));
        remove_private_directory(&staging, &root)?;
        remove_private_directory(&previous, &root)?;
        fs::create_dir_all(&staging)
            .map_err(|_| "The Java repair staging directory could not be created.".to_string())?;
        emit(
            progress,
            "installing",
            "Installing Java privately inside BadgerBots Host…",
            archive.len() as u64,
            Some(archive.len() as u64),
            Some(82),
            repair,
        );
        let files = extract_archive(&archive, &staging)?;
        let manifest = JavaManifest {
            schema_version: 1,
            vendor: "Eclipse Adoptium".to_string(),
            version: JAVA_VERSION.to_string(),
            archive_sha256: JAVA_ARCHIVE_SHA256.to_string(),
            files,
        };
        verify_files(&staging, &manifest)?;

        if installation.exists() {
            fs::rename(&installation, &previous).map_err(|_| {
                "The damaged Java runtime could not be staged for repair.".to_string()
            })?;
        }
        if let Err(error) = fs::rename(&staging, &installation) {
            if previous.exists() {
                let _ = fs::rename(&previous, &installation);
            }
            return Err(format!(
                "The verified Java runtime could not be activated: {error}"
            ));
        }
        let serialized = serde_json::to_vec_pretty(&manifest)
            .map_err(|_| "The Java verification record could not be serialized.".to_string())?;
        if let Err(error) = persist_bytes_atomic(&manifest_path, &serialized) {
            let _ = remove_private_directory(&installation, &root);
            if previous.exists() {
                let _ = fs::rename(&previous, &installation);
            }
            return Err(error);
        }
        remove_private_directory(&previous, &root)?;

        emit(
            progress,
            "verifying",
            "Checking every installed Java runtime file…",
            archive.len() as u64,
            Some(archive.len() as u64),
            Some(96),
            repair,
        );
        verify_installation(&installation, &manifest_path)?;
        let executable_path = java_executable(&installation);
        let version = inspect_java_process(&executable_path)?;
        emit(
            progress,
            "verifying",
            if repair {
                "Managed Java 21 was repaired; checking Paper and the BadgerBots plugin…"
            } else {
                "Managed Java 21 was installed; checking Paper and the BadgerBots plugin…"
            },
            archive.len() as u64,
            Some(archive.len() as u64),
            Some(90),
            repair,
        );
        Ok(ManagedJava {
            version,
            fingerprint: JAVA_ARCHIVE_SHA256.to_string(),
            executable_path,
            repaired: repair,
            source: JavaSource::PrivatePinned,
        })
    }
}

pub(crate) fn verify(runtime_directory: &Path, source: &str) -> Result<ManagedJava, String> {
    let root = runtime_directory.join("managed-java");
    if source == JavaSource::ExistingSystem.as_str() {
        return verify_existing_java_manifest(&root);
    }
    let installation = root.join(JAVA_DIRECTORY_NAME);
    let manifest = verify_installation(&installation, &root.join("manifest.json"))?;
    let executable_path = java_executable(&installation);
    Ok(ManagedJava {
        version: manifest.version,
        fingerprint: manifest.archive_sha256,
        executable_path,
        repaired: false,
        source: JavaSource::PrivatePinned,
    })
}

#[cfg(windows)]
fn find_existing_java(root: &Path) -> Result<Option<ManagedJava>, String> {
    if let Ok(java) = verify_existing_java_manifest(root) {
        return Ok(Some(java));
    }

    for candidate in discover_existing_java_candidates() {
        let Ok(canonical) = candidate.canonicalize() else {
            continue;
        };
        if !canonical.is_absolute()
            || !canonical.is_file()
            || canonical
                .file_name()
                .is_none_or(|name| !name.to_string_lossy().eq_ignore_ascii_case("java.exe"))
        {
            continue;
        }
        let Ok(version) = inspect_java_process(&canonical) else {
            continue;
        };
        let Some(executable_sha256) = checksum_file(&canonical) else {
            continue;
        };
        let manifest = ExistingJavaManifest {
            schema_version: 1,
            executable_path: canonical.clone(),
            executable_sha256: executable_sha256.clone(),
            version: version.clone(),
        };
        let serialized = serde_json::to_vec_pretty(&manifest)
            .map_err(|_| "The existing Java verification record could not be saved.".to_string())?;
        persist_bytes_atomic(&root.join(EXTERNAL_JAVA_MANIFEST_NAME), &serialized)?;
        return Ok(Some(ManagedJava {
            version,
            fingerprint: executable_sha256,
            executable_path: canonical,
            repaired: false,
            source: JavaSource::ExistingSystem,
        }));
    }
    Ok(None)
}

fn verify_existing_java_manifest(root: &Path) -> Result<ManagedJava, String> {
    let manifest: ExistingJavaManifest = serde_json::from_slice(
        &fs::read(root.join(EXTERNAL_JAVA_MANIFEST_NAME))
            .map_err(|_| "The existing Java verification record is missing.".to_string())?,
    )
    .map_err(|_| "The existing Java verification record is invalid.".to_string())?;
    if manifest.schema_version != 1
        || !manifest.executable_path.is_absolute()
        || manifest
            .executable_path
            .file_name()
            .is_none_or(|name| !name.to_string_lossy().eq_ignore_ascii_case("java.exe"))
        || checksum_file(&manifest.executable_path).as_deref()
            != Some(manifest.executable_sha256.as_str())
    {
        return Err("The existing Java 21 installation changed or is unavailable.".to_string());
    }
    let version = inspect_java_process(&manifest.executable_path)?;
    Ok(ManagedJava {
        version,
        fingerprint: manifest.executable_sha256,
        executable_path: manifest.executable_path,
        repaired: false,
        source: JavaSource::ExistingSystem,
    })
}

#[cfg(windows)]
fn discover_existing_java_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(java_home) = env::var_os("JAVA_HOME") {
        candidates.push(PathBuf::from(java_home).join("bin").join("java.exe"));
    }

    let mut where_command = Command::new("where.exe");
    where_command.arg("java.exe");
    use std::os::windows::process::CommandExt;
    where_command.creation_flags(0x0800_0000);
    if let Ok(output) = where_command.output() {
        if output.status.success() {
            candidates.extend(
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .map(str::trim)
                    .filter(|line| !line.is_empty())
                    .map(PathBuf::from),
            );
        }
    }

    let mut vendor_roots = Vec::new();
    if let Some(program_files) = env::var_os("ProgramFiles") {
        let program_files = PathBuf::from(program_files);
        for vendor in [
            "Eclipse Adoptium",
            "Java",
            "Microsoft",
            "Amazon Corretto",
            "BellSoft",
            "Zulu",
        ] {
            vendor_roots.push(program_files.join(vendor));
        }
    }
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        vendor_roots.push(
            PathBuf::from(local_app_data)
                .join("Programs")
                .join("Eclipse Adoptium"),
        );
    }
    for vendor_root in vendor_roots {
        let Ok(entries) = fs::read_dir(vendor_root) else {
            continue;
        };
        for entry in entries.flatten().take(128) {
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                candidates.push(entry.path().join("bin").join("java.exe"));
            }
        }
    }

    let mut unique = BTreeSet::new();
    candidates
        .into_iter()
        .filter(|candidate| unique.insert(candidate.clone()))
        .collect()
}

#[cfg(windows)]
async fn download(
    progress: &(dyn Fn(InstallProgress) + Send + Sync),
    repair: bool,
) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent(
            "BadgerBots-Code-Studio/0.8.2 (https://github.com/HenryRiley/badgerbots-code-studio)",
        )
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|_| "The secure Java downloader could not be prepared.".to_string())?;
    let mut response = client.get(JAVA_ARCHIVE_URL).send().await.map_err(|_| {
        "Java 21 could not be downloaded. Check the internet connection and select Try repair."
            .to_string()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Java 21 download failed with HTTP status {}. Try repair again later.",
            response.status()
        ));
    }
    let total = response.content_length();
    if total.is_some_and(|length| length > MAX_ARCHIVE_BYTES) {
        return Err("The Java 21 download exceeded its expected size limit.".to_string());
    }
    let mut bytes = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut last_percent = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The Java 21 download ended unexpectedly. Select Try repair.".to_string())?
    {
        if bytes.len() as u64 + chunk.len() as u64 > MAX_ARCHIVE_BYTES {
            return Err("The Java 21 download exceeded its expected size limit.".to_string());
        }
        bytes.extend_from_slice(&chunk);
        let download_percent = total
            .filter(|value| *value > 0)
            .map(|value| ((bytes.len() as u64 * 70 / value).min(70)) as u8);
        if download_percent.is_some_and(|value| value >= last_percent + 2) {
            last_percent = download_percent.unwrap_or(last_percent);
            emit(
                progress,
                "downloading",
                if repair {
                    "Repairing Java 21: downloading a clean pinned copy…"
                } else {
                    "Downloading the pinned Java 21 runtime…"
                },
                bytes.len() as u64,
                total,
                download_percent,
                repair,
            );
        }
    }
    Ok(bytes)
}

#[cfg(any(windows, test))]
fn extract_archive(archive: &[u8], destination: &Path) -> Result<Vec<InstalledFile>, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(archive))
        .map_err(|_| "The verified Java archive could not be opened.".to_string())?;
    if zip.len() > MAX_ARCHIVE_ENTRIES {
        return Err("The Java archive contains too many files.".to_string());
    }
    let mut files = Vec::new();
    let mut expanded_bytes = 0_u64;
    let mut roots = BTreeSet::new();
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| "A Java archive entry could not be read.".to_string())?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "The Java archive contains an unsafe path.".to_string())?;
        let mut components = enclosed.components();
        let root = components
            .next()
            .and_then(|component| match component {
                Component::Normal(value) => Some(value.to_owned()),
                _ => None,
            })
            .ok_or_else(|| "The Java archive layout is invalid.".to_string())?;
        roots.insert(root);
        let relative = components.collect::<PathBuf>();
        if relative.as_os_str().is_empty() {
            continue;
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err("The Java archive contains an unsupported link.".to_string());
        }
        let output = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|_| "A Java runtime directory could not be created.".to_string())?;
            continue;
        }
        expanded_bytes = expanded_bytes
            .checked_add(entry.size())
            .filter(|total| *total <= MAX_EXPANDED_BYTES)
            .ok_or_else(|| "The expanded Java runtime exceeded its size limit.".to_string())?;
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)
                .map_err(|_| "A Java runtime directory could not be created.".to_string())?;
        }
        let mut output_file = File::create(&output)
            .map_err(|_| "A Java runtime file could not be staged.".to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        let mut written = 0_u64;
        loop {
            let count = entry
                .read(&mut buffer)
                .map_err(|_| "A Java runtime file could not be extracted.".to_string())?;
            if count == 0 {
                break;
            }
            output_file
                .write_all(&buffer[..count])
                .map_err(|_| "A Java runtime file could not be staged.".to_string())?;
            hasher.update(&buffer[..count]);
            written += count as u64;
        }
        files.push(InstalledFile {
            path: portable_path(&relative)?,
            bytes: written,
            sha256: format!("{:x}", hasher.finalize()),
        });
    }
    if roots.len() != 1 {
        return Err("The Java archive must contain exactly one top-level directory.".to_string());
    }
    files.sort();
    if !files.iter().any(|file| file.path == "bin/java.exe") {
        return Err("The Java archive does not contain bin/java.exe.".to_string());
    }
    if !files.iter().any(|file| file.path == "release") {
        return Err("The Java archive does not contain its release metadata.".to_string());
    }
    Ok(files)
}

fn verify_installation(installation: &Path, manifest_path: &Path) -> Result<JavaManifest, String> {
    let manifest: JavaManifest = serde_json::from_slice(
        &fs::read(manifest_path)
            .map_err(|_| "The managed Java verification record is missing.".to_string())?,
    )
    .map_err(|_| "The managed Java verification record is invalid.".to_string())?;
    if manifest.schema_version != 1
        || manifest.vendor != "Eclipse Adoptium"
        || manifest.version != JAVA_VERSION
        || manifest.archive_sha256 != JAVA_ARCHIVE_SHA256
    {
        return Err("The managed Java verification record is not approved.".to_string());
    }
    verify_files(installation, &manifest)?;
    Ok(manifest)
}

fn verify_files(installation: &Path, manifest: &JavaManifest) -> Result<(), String> {
    let actual_paths = collect_files(installation)?;
    let expected_paths = manifest
        .files
        .iter()
        .map(|file| file.path.clone())
        .collect::<BTreeSet<_>>();
    if actual_paths != expected_paths {
        return Err("The managed Java runtime has missing or unexpected files.".to_string());
    }
    for file in &manifest.files {
        let path = installation.join(PathBuf::from(
            file.path.replace('/', std::path::MAIN_SEPARATOR_STR),
        ));
        let metadata = fs::metadata(&path)
            .map_err(|_| "A managed Java runtime file is missing.".to_string())?;
        if metadata.len() != file.bytes || checksum_file(&path).as_deref() != Some(&file.sha256) {
            return Err(format!(
                "The managed Java runtime file {} is damaged.",
                file.path
            ));
        }
    }
    Ok(())
}

fn collect_files(root: &Path) -> Result<BTreeSet<String>, String> {
    fn visit(base: &Path, directory: &Path, output: &mut BTreeSet<String>) -> Result<(), String> {
        for entry in fs::read_dir(directory)
            .map_err(|_| "The managed Java directory could not be inspected.".to_string())?
        {
            let entry =
                entry.map_err(|_| "A managed Java directory entry is invalid.".to_string())?;
            let file_type = entry
                .file_type()
                .map_err(|_| "A managed Java file type could not be inspected.".to_string())?;
            if file_type.is_symlink() {
                return Err("The managed Java runtime contains an unexpected link.".to_string());
            }
            if file_type.is_dir() {
                visit(base, &entry.path(), output)?;
            } else if file_type.is_file() {
                let relative = entry
                    .path()
                    .strip_prefix(base)
                    .map_err(|_| "A managed Java file escaped its private directory.".to_string())?
                    .to_path_buf();
                output.insert(portable_path(&relative)?);
            } else {
                return Err("The managed Java runtime contains an unsupported file.".to_string());
            }
        }
        Ok(())
    }
    if !root.is_dir() {
        return Err("The managed Java runtime is missing.".to_string());
    }
    let mut files = BTreeSet::new();
    visit(root, root, &mut files)?;
    Ok(files)
}

fn inspect_java_process(executable: &Path) -> Result<String, String> {
    let mut command = Command::new(executable);
    command
        .args(["-XshowSettings:properties", "-version"])
        .env_remove("JAVA_HOME")
        .env_remove("JAVA_TOOL_OPTIONS")
        .env_remove("JDK_JAVA_OPTIONS")
        .env_remove("_JAVA_OPTIONS")
        .env_remove("CLASSPATH");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().map_err(|_| {
        "The Java runtime could not start. Select Verify & repair Java.".to_string()
    })?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let first_line = combined.lines().next().unwrap_or_default().trim();
    let java_version = java_property(&combined, "java.version").unwrap_or(first_line);
    let architecture = java_property(&combined, "os.arch").unwrap_or_default();
    if !output.status.success()
        || !is_java_21(java_version)
        || !matches!(
            architecture.to_ascii_lowercase().as_str(),
            "amd64" | "x86_64"
        )
    {
        return Err(
            "The Java runtime must be a working 64-bit Java 21 installation. Select Verify & repair Java."
                .to_string()
        );
    }
    let version_line = combined
        .lines()
        .map(str::trim)
        .find(|line| line.contains("version"))
        .unwrap_or(first_line);
    Ok(format!(
        "Java 21 ({architecture}) — {}",
        version_line.chars().take(100).collect::<String>()
    ))
}

fn java_property<'a>(output: &'a str, property: &str) -> Option<&'a str> {
    output.lines().find_map(|line| {
        let (name, value) = line.trim().split_once('=')?;
        (name.trim() == property).then_some(value.trim())
    })
}

fn is_java_21(version: &str) -> bool {
    version
        .trim()
        .trim_matches('"')
        .split(['.', '-', '+'])
        .next()
        == Some("21")
}

fn java_executable(installation: &Path) -> PathBuf {
    installation.join("bin").join("java.exe")
}

fn portable_path(path: &Path) -> Result<String, String> {
    path.components()
        .map(|component| match component {
            Component::Normal(value) => value
                .to_str()
                .map(str::to_string)
                .ok_or_else(|| "A Java archive path is not valid UTF-8.".to_string()),
            _ => Err("A Java archive path is unsafe.".to_string()),
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|parts| parts.join("/"))
}

fn checksum_file(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).ok()?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

#[cfg(windows)]
fn verify_checksum(bytes: &[u8], expected: &str) -> Result<(), String> {
    let actual = format!("{:x}", Sha256::digest(bytes));
    if actual == expected {
        Ok(())
    } else {
        Err(
            "Java 21 failed checksum verification. Nothing was installed; select Try repair."
                .to_string(),
        )
    }
}

#[cfg(windows)]
fn persist_bytes_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("new");
    fs::write(&temporary, contents)
        .map_err(|_| "The Java verification record could not be staged.".to_string())?;
    replace_file_atomic(&temporary, path)
        .map_err(|_| "The Java verification record could not be saved.".to_string())
}

#[cfg(windows)]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    };

    let source = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let succeeded = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if succeeded == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn remove_private_directory(path: &Path, approved_root: &Path) -> Result<(), String> {
    if !path.starts_with(approved_root) || path == approved_root {
        return Err("Refused an unsafe Java repair path.".to_string());
    }
    if path.exists() {
        fs::remove_dir_all(path).map_err(|_| {
            "An old private Java repair directory could not be removed.".to_string()
        })?;
    }
    Ok(())
}

fn emit(
    progress: &(dyn Fn(InstallProgress) + Send + Sync),
    phase: &str,
    message: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    percent: Option<u8>,
    repair: bool,
) {
    progress(InstallProgress {
        phase: phase.to_string(),
        message: message.to_string(),
        downloaded_bytes,
        total_bytes,
        percent,
        repair,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::{ZipWriter, write::SimpleFileOptions};

    fn test_archive() -> Vec<u8> {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut bytes);
            let options = SimpleFileOptions::default();
            zip.start_file("jdk-test/bin/java.exe", options)
                .expect("java test entry");
            zip.write_all(b"test-java").expect("java test bytes");
            zip.start_file("jdk-test/release", options)
                .expect("release test entry");
            zip.write_all(b"JAVA_VERSION=21")
                .expect("release test bytes");
            zip.finish().expect("test zip should finish");
        }
        bytes.into_inner()
    }

    #[test]
    fn extracts_only_the_single_safe_runtime_root() {
        let root = std::env::temp_dir().join(format!(
            "badgerbots-managed-java-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("test root");
        let files = extract_archive(&test_archive(), &root).expect("safe archive should extract");
        assert!(files.iter().any(|file| file.path == "bin/java.exe"));
        assert!(files.iter().any(|file| file.path == "release"));
        fs::remove_dir_all(root).expect("test root cleanup");
    }

    #[test]
    fn detects_a_damaged_installed_runtime_file() {
        let root = std::env::temp_dir().join(format!(
            "badgerbots-managed-java-damage-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("test root");
        let files = extract_archive(&test_archive(), &root).expect("safe archive should extract");
        let manifest = JavaManifest {
            schema_version: 1,
            vendor: "Eclipse Adoptium".to_string(),
            version: JAVA_VERSION.to_string(),
            archive_sha256: JAVA_ARCHIVE_SHA256.to_string(),
            files,
        };
        assert!(verify_files(&root, &manifest).is_ok());
        fs::write(root.join("release"), b"damaged").expect("damage fixture");
        assert!(verify_files(&root, &manifest).is_err());
        fs::remove_dir_all(root).expect("test root cleanup");
    }

    #[test]
    fn rejects_archive_paths_that_escape_the_private_runtime() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut zip = ZipWriter::new(&mut bytes);
            zip.start_file("../outside.exe", SimpleFileOptions::default())
                .expect("unsafe fixture entry");
            zip.write_all(b"outside").expect("unsafe fixture bytes");
            zip.finish().expect("unsafe fixture should finish");
        }
        let root = std::env::temp_dir().join(format!(
            "badgerbots-managed-java-path-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("test root");
        assert!(extract_archive(&bytes.into_inner(), &root).is_err());
        fs::remove_dir_all(root).expect("test root cleanup");
    }

    #[test]
    fn accepts_only_java_21_major_versions() {
        assert!(is_java_21("21"));
        assert!(is_java_21("21.0.11+10"));
        assert!(is_java_21("\"21.0.11\""));
        assert!(!is_java_21("17.0.12"));
        assert!(!is_java_21("210.0.1"));
    }

    #[test]
    fn parses_java_property_output_without_trusting_line_order() {
        let output = "Property settings:\n    os.arch = amd64\n    java.version = 21.0.11\n";
        assert_eq!(java_property(output, "java.version"), Some("21.0.11"));
        assert_eq!(java_property(output, "os.arch"), Some("amd64"));
        assert_eq!(java_property(output, "java.vendor"), None);
    }
}
