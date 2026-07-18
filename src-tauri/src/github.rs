//! GitHub-backed vault transfer for mobile builds.
//!
//! Responsibilities:
//! - Download a GitHub repository into Glyphary's private application storage.
//! - Pull remote changes and push local changes through the GitHub API.
//! - Refuse stale or dirty synchronization rather than overwriting notes.
//!
//! Contracts:
//! - Tokens are stored in the platform credential store and never written into the vault.
//! - `.glyphary/` and `.git/` stay local to the app.
//! - A pull requires a clean tracked workspace; a push requires the remote
//!   commit recorded by the last successful sync.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const GITHUB_API: &str = "https://api.github.com";
const GITHUB_METADATA_FILE: &str = "github.json";
const GITHUB_KEYRING_SERVICE: &str = "Glyphary GitHub";

#[derive(Debug, Clone)]
struct GithubRepository {
    owner: String,
    name: String,
    branch: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubCloneRequest {
    repo_url: String,
    branch: String,
    #[serde(default)]
    token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubVaultResult {
    root: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GithubSyncProgress {
    operation: &'static str,
    phase: &'static str,
    completed: usize,
    total: usize,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GithubFileState {
    remote_sha: String,
    local_sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GithubVaultMetadata {
    owner: String,
    repo: String,
    branch: String,
    commit_sha: String,
    files: BTreeMap<String, GithubFileState>,
}

#[derive(Debug, Deserialize)]
struct GithubContentEntry {
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: String,
    download_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRef {
    object: GithubObject,
}

#[derive(Debug, Deserialize)]
struct GithubCommit {
    tree: GithubObject,
}

#[derive(Debug, Deserialize)]
struct GithubObject {
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GithubTreeResponse {
    tree: Vec<GithubTreeEntry>,
}

#[derive(Debug, Deserialize)]
struct GithubTreeEntry {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: String,
}

#[derive(Debug, Serialize)]
struct GithubBlobRequest {
    content: String,
    encoding: &'static str,
}

#[derive(Debug, Serialize)]
struct GithubTreeRequest {
    base_tree: String,
    tree: Vec<GithubTreeChange>,
}

#[derive(Debug, Serialize)]
struct GithubTreeChange {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: Option<String>,
}

#[derive(Debug, Serialize)]
struct GithubCommitRequest {
    message: String,
    tree: String,
    parents: Vec<String>,
}

#[derive(Debug, Serialize)]
struct GithubRefUpdate {
    sha: String,
    force: bool,
}

#[derive(Debug, Clone)]
struct GithubRemoteFile {
    sha: String,
    download_url: Option<String>,
}

fn emit_sync_progress(
    app: &AppHandle,
    operation: &'static str,
    phase: &'static str,
    completed: usize,
    total: usize,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "github-sync-progress",
        GithubSyncProgress {
            operation,
            phase,
            completed,
            total,
            message: message.into(),
        },
    );
}

fn github_api_url<I, S>(repository: &GithubRepository, segments: I) -> Result<reqwest::Url, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut url = reqwest::Url::parse(GITHUB_API).map_err(|err| err.to_string())?;
    {
        let mut path = url
            .path_segments_mut()
            .map_err(|_| "Could not build GitHub API URL".to_string())?;
        path.push("repos")
            .push(&repository.owner)
            .push(&repository.name);

        for segment in segments {
            for part in segment.as_ref().split('/') {
                if !part.is_empty() {
                    path.push(part);
                }
            }
        }
    }

    Ok(url)
}

fn parse_github_repository(value: &str, branch: &str) -> Result<GithubRepository, String> {
    let value = value.trim().trim_end_matches('/');
    let (owner, name) = if value.starts_with("https://") || value.starts_with("http://") {
        let url = reqwest::Url::parse(value).map_err(|_| "GitHub repository URL is invalid")?;

        if url.host_str() != Some("github.com") {
            return Err("Repository URL must point to github.com".into());
        }

        let parts = url
            .path_segments()
            .ok_or_else(|| "GitHub repository URL has no repository path".to_string())?
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();

        if parts.len() != 2 {
            return Err(
                "GitHub repository URL must look like https://github.com/owner/repo".into(),
            );
        }

        (
            parts[0].to_string(),
            parts[1].trim_end_matches(".git").to_string(),
        )
    } else {
        let parts = value
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();

        if parts.len() != 2 {
            return Err("GitHub repository must be owner/repo or a GitHub URL".into());
        }

        (
            parts[0].to_string(),
            parts[1].trim_end_matches(".git").to_string(),
        )
    };

    let valid_name = |value: &str| {
        !value.is_empty()
            && value.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
            })
    };

    if !valid_name(&owner) || !valid_name(&name) {
        return Err("GitHub repository owner and name are invalid".into());
    }

    let branch = branch.trim();
    if branch.is_empty() {
        return Err("GitHub branch cannot be empty".into());
    }

    Ok(GithubRepository {
        owner,
        name,
        branch: branch.to_string(),
    })
}

fn github_keyring_entry(repository: &GithubRepository) -> Result<keyring::Entry, String> {
    keyring::Entry::new(
        GITHUB_KEYRING_SERVICE,
        &format!("{}/{}", repository.owner, repository.name),
    )
    .map_err(|err| format!("Could not access the device credential store: {err}"))
}

fn read_saved_github_token(repository: &GithubRepository) -> Result<String, String> {
    match github_keyring_entry(repository)?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(err) => Err(format!("Could not read the saved GitHub token: {err}")),
    }
}

fn save_github_token(repository: &GithubRepository, token: &str) -> Result<(), String> {
    github_keyring_entry(repository)?
        .set_password(token.trim())
        .map_err(|err| format!("Could not save the GitHub token: {err}"))
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .user_agent("Glyphary/1.0")
        .build()
        .map_err(|err| format!("Could not create GitHub client: {err}"))
}

fn github_request(
    client: &reqwest::Client,
    method: reqwest::Method,
    url: reqwest::Url,
    token: &str,
) -> reqwest::RequestBuilder {
    let request = client
        .request(method, url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");

    if token.trim().is_empty() {
        request
    } else {
        request.bearer_auth(token.trim())
    }
}

async fn github_json<T: DeserializeOwned>(
    response: reqwest::Response,
    action: &str,
) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("GitHub {action} response could not be read: {err}"))?;

    if !status.is_success() {
        return Err(format!("GitHub {action} failed ({}): {}", status, body));
    }

    serde_json::from_str(&body)
        .map_err(|err| format!("GitHub {action} returned invalid data: {err}"))
}

async fn github_bytes(response: reqwest::Response, action: &str) -> Result<Vec<u8>, String> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("GitHub {action} failed ({}): {}", status, body));
    }

    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|err| format!("GitHub {action} response could not be read: {err}"))
}

async fn branch_commit(
    client: &reqwest::Client,
    repository: &GithubRepository,
    token: &str,
) -> Result<String, String> {
    let segments = vec![
        "git".to_string(),
        "ref".to_string(),
        "heads".to_string(),
        repository.branch.clone(),
    ];
    let response = github_request(
        client,
        reqwest::Method::GET,
        github_api_url(repository, segments)?,
        token,
    )
    .send()
    .await
    .map_err(|err| format!("GitHub branch lookup failed: {err}"))?;
    let reference: GithubRef = github_json(response, "branch lookup").await?;
    Ok(reference.object.sha)
}

async fn repository_tree(
    client: &reqwest::Client,
    repository: &GithubRepository,
    commit_sha: &str,
    token: &str,
) -> Result<BTreeMap<String, GithubTreeEntry>, String> {
    let commit_url = github_api_url(repository, ["git", "commits", commit_sha])?;
    let commit_response = github_request(client, reqwest::Method::GET, commit_url, token)
        .send()
        .await
        .map_err(|err| format!("GitHub commit lookup failed: {err}"))?;
    let commit: GithubCommit = github_json(commit_response, "commit lookup").await?;

    let tree_url = github_api_url(repository, ["git", "trees", commit.tree.sha.as_str()])?;
    let mut tree_url = tree_url;
    tree_url.query_pairs_mut().append_pair("recursive", "1");
    let tree_response = github_request(client, reqwest::Method::GET, tree_url, token)
        .send()
        .await
        .map_err(|err| format!("GitHub tree lookup failed: {err}"))?;
    let tree: GithubTreeResponse = github_json(tree_response, "tree lookup").await?;

    Ok(tree
        .tree
        .into_iter()
        .filter(|entry| entry.entry_type == "blob")
        .map(|entry| (entry.path.clone(), entry))
        .collect())
}

async fn repository_contents(
    client: &reqwest::Client,
    repository: &GithubRepository,
    token: &str,
    app: &AppHandle,
    operation: &'static str,
) -> Result<BTreeMap<String, GithubRemoteFile>, String> {
    let mut directories = vec![Vec::<String>::new()];
    let mut files = BTreeMap::new();

    while let Some(path) = directories.pop() {
        emit_sync_progress(
            app,
            operation,
            "scanning",
            files.len(),
            0,
            if path.is_empty() {
                "Scanning repository"
            } else {
                "Scanning repository folders"
            },
        );
        let mut segments = vec!["contents".to_string()];
        segments.extend(path.iter().cloned());
        let mut url = github_api_url(repository, segments)?;
        url.query_pairs_mut().append_pair("ref", &repository.branch);
        let response = github_request(client, reqwest::Method::GET, url, token)
            .send()
            .await
            .map_err(|err| format!("GitHub contents lookup failed: {err}"))?;
        let entries: Vec<GithubContentEntry> = github_json(response, "contents lookup").await?;

        for entry in entries {
            match entry.entry_type.as_str() {
                "dir" => directories.push(entry.path.split('/').map(str::to_string).collect()),
                "file" => {
                    files.insert(
                        entry.path,
                        GithubRemoteFile {
                            sha: entry.sha,
                            download_url: entry.download_url,
                        },
                    );
                }
                _ => {}
            }
        }
    }

    Ok(files)
}

async fn download_file(
    client: &reqwest::Client,
    repository: &GithubRepository,
    path: &str,
    file: &GithubRemoteFile,
    token: &str,
) -> Result<Vec<u8>, String> {
    let response = if let Some(download_url) = &file.download_url {
        let url = reqwest::Url::parse(download_url)
            .map_err(|_| format!("GitHub returned an invalid download URL for {path}"))?;
        github_request(client, reqwest::Method::GET, url, token)
            .send()
            .await
            .map_err(|err| format!("GitHub file download failed for {path}: {err}"))?
    } else {
        let segments = ["contents".to_string(), path.to_string()];
        let mut url = github_api_url(repository, segments)?;
        url.query_pairs_mut().append_pair("ref", &repository.branch);
        github_request(client, reqwest::Method::GET, url, token)
            .send()
            .await
            .map_err(|err| format!("GitHub file lookup failed for {path}: {err}"))?
    };

    github_bytes(response, &format!("file download for {path}")).await
}

fn is_local_only_path(path: &str) -> bool {
    path == ".git"
        || path.starts_with(".git/")
        || path == SETTINGS_DIRECTORY_NAME
        || path.starts_with(".glyphary/")
}

fn local_vault_files(root: &Path) -> Result<BTreeMap<String, Vec<u8>>, String> {
    fn visit(
        root: &Path,
        directory: &Path,
        files: &mut BTreeMap<String, Vec<u8>>,
    ) -> Result<(), String> {
        for entry in fs::read_dir(directory)
            .map_err(|err| format!("Could not list vault for GitHub: {err}"))?
        {
            let entry =
                entry.map_err(|err| format!("Could not read vault entry for GitHub: {err}"))?;
            let path = entry.path();
            let relative = relative_string(root, &path)?;

            if is_local_only_path(&relative) {
                continue;
            }

            let file_type = entry
                .file_type()
                .map_err(|err| format!("Could not inspect vault entry for GitHub: {err}"))?;
            if file_type.is_dir() {
                visit(root, &path, files)?;
            } else if file_type.is_file() {
                files.insert(
                    relative,
                    fs::read(&path)
                        .map_err(|err| format!("Could not read vault file for GitHub: {err}"))?,
                );
            }
        }

        Ok(())
    }

    let mut files = BTreeMap::new();
    visit(root, root, &mut files)?;
    Ok(files)
}

fn local_sha256(content: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(content);
    format!("{:x}", digest.finalize())
}

fn metadata_path(root: &Path) -> PathBuf {
    root.join(SETTINGS_DIRECTORY_NAME)
        .join(GITHUB_METADATA_FILE)
}

fn read_metadata(root: &Path) -> Result<GithubVaultMetadata, String> {
    let content = fs::read_to_string(metadata_path(root))
        .map_err(|_| "This vault is not connected to GitHub".to_string())?;
    serde_json::from_str(&content).map_err(|err| format!("GitHub vault metadata is invalid: {err}"))
}

fn write_metadata(root: &Path, metadata: &GithubVaultMetadata) -> Result<(), String> {
    let path = metadata_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create GitHub metadata directory: {err}"))?;
    }

    let content = serde_json::to_string_pretty(metadata)
        .map_err(|err| format!("Could not serialize GitHub metadata: {err}"))?;
    fs::write(path, content).map_err(|err| format!("Could not save GitHub metadata: {err}"))
}

fn metadata_from_remote_files(
    root: &Path,
    commit_sha: String,
    repository: &GithubRepository,
    remote_files: &BTreeMap<String, GithubRemoteFile>,
) -> Result<GithubVaultMetadata, String> {
    let local = local_vault_files(root)?;
    let files = remote_files
        .iter()
        .filter(|(path, _)| !is_local_only_path(path))
        .map(|(path, remote)| {
            (
                path.clone(),
                GithubFileState {
                    remote_sha: remote.sha.clone(),
                    local_sha256: local
                        .get(path)
                        .map(|bytes| local_sha256(bytes))
                        .unwrap_or_default(),
                },
            )
        })
        .collect();

    Ok(GithubVaultMetadata {
        owner: repository.owner.clone(),
        repo: repository.name.clone(),
        branch: repository.branch.clone(),
        commit_sha,
        files,
    })
}

fn repository_from_metadata(metadata: &GithubVaultMetadata) -> Result<GithubRepository, String> {
    parse_github_repository(
        &format!("{}/{}", metadata.owner, metadata.repo),
        &metadata.branch,
    )
}

fn has_local_changes(root: &Path, metadata: &GithubVaultMetadata) -> Result<bool, String> {
    let local = local_vault_files(root)?;

    Ok(metadata.files.iter().any(|(path, state)| {
        local
            .get(path)
            .map(|content| local_sha256(content) != state.local_sha256)
            .unwrap_or(true)
    }))
}

fn write_remote_file(root: &Path, path: &str, content: &[u8]) -> Result<(), String> {
    let relative = clean_relative(path)?;
    let target = root.join(relative);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create GitHub vault folder: {err}"))?;
    }

    fs::write(target, content).map_err(|err| format!("Could not write GitHub vault file: {err}"))
}

fn remove_remote_file(root: &Path, path: &str) -> Result<(), String> {
    let relative = clean_relative(path)?;
    let target = root.join(relative);
    if target.is_file() {
        fs::remove_file(target)
            .map_err(|err| format!("Could not remove pulled GitHub file: {err}"))?;
    }
    Ok(())
}

async fn create_blob(
    client: &reqwest::Client,
    repository: &GithubRepository,
    content: &[u8],
    token: &str,
) -> Result<String, String> {
    let body = GithubBlobRequest {
        content: STANDARD.encode(content),
        encoding: "base64",
    };
    let response = github_request(
        client,
        reqwest::Method::POST,
        github_api_url(repository, ["git", "blobs"])?,
        token,
    )
    .json(&body)
    .send()
    .await
    .map_err(|err| format!("GitHub blob upload failed: {err}"))?;
    let blob: GithubObject = github_json(response, "blob upload").await?;
    Ok(blob.sha)
}

async fn push_repository(
    client: &reqwest::Client,
    repository: &GithubRepository,
    root: &Path,
    metadata: &GithubVaultMetadata,
    token: &str,
    message: &str,
    app: &AppHandle,
) -> Result<GithubVaultResult, String> {
    emit_sync_progress(app, "push", "scanning", 0, 0, "Preparing local changes");
    let current_commit = branch_commit(client, repository, token).await?;
    if current_commit != metadata.commit_sha {
        return Err("GitHub has newer commits. Pull them before pushing local changes.".into());
    }

    let remote_tree = repository_tree(client, repository, &current_commit, token).await?;
    let local = local_vault_files(root)?;
    let mut changes = Vec::new();
    let mut next_files = BTreeMap::new();

    for (path, content) in &local {
        let local_hash = local_sha256(content);
        let previous = metadata.files.get(path);
        let remote = remote_tree.get(path);
        let unchanged = previous
            .zip(remote)
            .map(|(previous, remote)| {
                previous.remote_sha == remote.sha && previous.local_sha256 == local_hash
            })
            .unwrap_or(false);

        let sha = if unchanged {
            remote
                .expect("unchanged files have a remote entry")
                .sha
                .clone()
        } else {
            create_blob(client, repository, content, token).await?
        };

        if remote.map(|entry| entry.sha.as_str()) != Some(sha.as_str()) {
            changes.push(GithubTreeChange {
                path: path.clone(),
                mode: remote
                    .map(|entry| entry.mode.clone())
                    .unwrap_or_else(|| "100644".into()),
                entry_type: "blob".into(),
                sha: Some(sha.clone()),
            });
        }

        next_files.insert(
            path.clone(),
            GithubFileState {
                remote_sha: sha,
                local_sha256: local_hash,
            },
        );
    }

    for (path, entry) in &remote_tree {
        if is_local_only_path(path) || local.contains_key(path) {
            continue;
        }

        if metadata.files.contains_key(path) {
            changes.push(GithubTreeChange {
                path: path.clone(),
                mode: entry.mode.clone(),
                entry_type: "blob".into(),
                sha: None,
            });
        } else {
            next_files.insert(
                path.clone(),
                GithubFileState {
                    remote_sha: entry.sha.clone(),
                    local_sha256: String::new(),
                },
            );
        }
    }

    if changes.is_empty() {
        emit_sync_progress(
            app,
            "push",
            "complete",
            0,
            0,
            "GitHub is already up to date",
        );
        return Ok(GithubVaultResult {
            root: root.to_string_lossy().into_owned(),
            message: "GitHub is already up to date".into(),
        });
    }

    emit_sync_progress(
        app,
        "push",
        "uploading",
        0,
        changes.len(),
        format!("Uploading {} change(s)", changes.len()),
    );
    let change_count = changes.len();

    let commit_url = github_api_url(repository, ["git", "commits", current_commit.as_str()])?;
    let commit_response = github_request(client, reqwest::Method::GET, commit_url, token)
        .send()
        .await
        .map_err(|err| format!("GitHub commit lookup failed: {err}"))?;
    let commit: GithubCommit = github_json(commit_response, "commit lookup").await?;
    let tree_body = GithubTreeRequest {
        base_tree: commit.tree.sha,
        tree: changes,
    };
    let tree_response = github_request(
        client,
        reqwest::Method::POST,
        github_api_url(repository, ["git", "trees"])?,
        token,
    )
    .json(&tree_body)
    .send()
    .await
    .map_err(|err| format!("GitHub tree upload failed: {err}"))?;
    let tree: GithubObject = github_json(tree_response, "tree upload").await?;

    let commit_body = GithubCommitRequest {
        message: if message.trim().is_empty() {
            "Update vault from Glyphary".into()
        } else {
            message.trim().into()
        },
        tree: tree.sha,
        parents: vec![current_commit],
    };
    let commit_response = github_request(
        client,
        reqwest::Method::POST,
        github_api_url(repository, ["git", "commits"])?,
        token,
    )
    .json(&commit_body)
    .send()
    .await
    .map_err(|err| format!("GitHub commit upload failed: {err}"))?;
    let new_commit: GithubObject = github_json(commit_response, "commit upload").await?;

    let ref_response = github_request(
        client,
        reqwest::Method::PATCH,
        github_api_url(
            repository,
            ["git", "refs", "heads", repository.branch.as_str()],
        )?,
        token,
    )
    .json(&GithubRefUpdate {
        sha: new_commit.sha.clone(),
        force: false,
    })
    .send()
    .await
    .map_err(|err| format!("GitHub branch update failed: {err}"))?;
    let _: GithubRef = github_json(ref_response, "branch update").await?;

    let next_metadata = GithubVaultMetadata {
        owner: repository.owner.clone(),
        repo: repository.name.clone(),
        branch: repository.branch.clone(),
        commit_sha: new_commit.sha,
        files: next_files,
    };
    write_metadata(root, &next_metadata)?;

    emit_sync_progress(
        app,
        "push",
        "complete",
        change_count,
        change_count,
        "Pushed vault changes to GitHub",
    );

    Ok(GithubVaultResult {
        root: root.to_string_lossy().into_owned(),
        message: "Pushed vault changes to GitHub".into(),
    })
}

#[tauri::command]
pub(crate) async fn github_clone_vault(
    app: AppHandle,
    request: GithubCloneRequest,
) -> Result<GithubVaultResult, String> {
    let client = github_client()?;
    let repository = parse_github_repository(&request.repo_url, &request.branch)?;
    emit_sync_progress(&app, "clone", "scanning", 0, 0, "Reading repository");
    let commit_sha = branch_commit(&client, &repository, &request.token).await?;
    let remote_files =
        repository_contents(&client, &repository, &request.token, &app, "clone").await?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not locate Glyphary app storage: {err}"))?
        .join("github-vaults")
        .join(&repository.owner)
        .join(&repository.name);

    if root.exists() {
        if let Ok(metadata) = read_metadata(&root) {
            if metadata.owner == repository.owner
                && metadata.repo == repository.name
                && metadata.branch == repository.branch
            {
                return Ok(GithubVaultResult {
                    root: root.to_string_lossy().into_owned(),
                    message: "This GitHub vault is already downloaded. Opening it.".into(),
                });
            }
        }

        if fs::read_dir(&root)
            .map_err(|err| format!("Could not inspect existing GitHub vault: {err}"))?
            .next()
            .is_some()
        {
            return Err("This GitHub vault is already downloaded.".into());
        }
    }

    fs::create_dir_all(&root).map_err(|err| format!("Could not create GitHub vault: {err}"))?;
    let files_to_download = remote_files
        .iter()
        .filter(|(path, _)| !is_local_only_path(path))
        .count();
    emit_sync_progress(
        &app,
        "clone",
        "downloading",
        0,
        files_to_download,
        format!("Downloading {files_to_download} file(s)"),
    );
    let mut downloaded = 0;
    for (path, file) in &remote_files {
        if is_local_only_path(path) {
            continue;
        }
        let content = download_file(&client, &repository, path, file, &request.token).await?;
        write_remote_file(&root, path, &content)?;
        downloaded += 1;
        emit_sync_progress(
            &app,
            "clone",
            "downloading",
            downloaded,
            files_to_download,
            format!("Downloaded {downloaded} of {files_to_download} files"),
        );
    }

    let metadata = metadata_from_remote_files(&root, commit_sha, &repository, &remote_files)?;
    write_metadata(&root, &metadata)?;
    emit_sync_progress(
        &app,
        "clone",
        "complete",
        files_to_download,
        files_to_download,
        format!("Downloaded {}/{}", repository.owner, repository.name),
    );

    Ok(GithubVaultResult {
        root: root.to_string_lossy().into_owned(),
        message: format!(
            "Downloaded {}/{} from GitHub",
            repository.owner, repository.name
        ),
    })
}

#[tauri::command]
pub(crate) async fn github_pull_vault(
    app: AppHandle,
    root: String,
    token: String,
) -> Result<GithubVaultResult, String> {
    let root_path = vault_root(&root)?;
    let metadata = read_metadata(&root_path)?;
    if has_local_changes(&root_path, &metadata)? {
        return Err("Save or push local vault changes before pulling from GitHub.".into());
    }

    let repository = repository_from_metadata(&metadata)?;
    let client = github_client()?;
    emit_sync_progress(
        &app,
        "pull",
        "scanning",
        0,
        0,
        "Checking GitHub for changes",
    );
    let commit_sha = branch_commit(&client, &repository, &token).await?;
    if commit_sha == metadata.commit_sha {
        emit_sync_progress(
            &app,
            "pull",
            "complete",
            0,
            0,
            "GitHub is already up to date",
        );
        return Ok(GithubVaultResult {
            root,
            message: "GitHub is already up to date".into(),
        });
    }

    let remote_files = repository_contents(&client, &repository, &token, &app, "pull").await?;
    let changed_files = remote_files
        .iter()
        .filter(|(path, file)| {
            !is_local_only_path(path)
                && metadata
                    .files
                    .get(*path)
                    .map(|state| state.remote_sha != file.sha)
                    .unwrap_or(true)
        })
        .count();
    emit_sync_progress(
        &app,
        "pull",
        "applying",
        0,
        changed_files,
        format!("Applying {changed_files} remote change(s)"),
    );
    let mut applied = 0;
    for (path, file) in &remote_files {
        if is_local_only_path(path) {
            continue;
        }
        let unchanged = metadata
            .files
            .get(path)
            .map(|state| state.remote_sha == file.sha)
            .unwrap_or(false);
        if !unchanged {
            let content = download_file(&client, &repository, path, file, &token).await?;
            write_remote_file(&root_path, path, &content)?;
            applied += 1;
            emit_sync_progress(
                &app,
                "pull",
                "applying",
                applied,
                changed_files,
                format!("Applied {applied} of {changed_files} changes"),
            );
        }
    }

    for path in metadata.files.keys() {
        if !remote_files.contains_key(path) {
            remove_remote_file(&root_path, path)?;
        }
    }

    let next_metadata =
        metadata_from_remote_files(&root_path, commit_sha, &repository, &remote_files)?;
    write_metadata(&root_path, &next_metadata)?;
    emit_sync_progress(
        &app,
        "pull",
        "complete",
        changed_files,
        changed_files,
        "Pulled vault changes from GitHub",
    );

    Ok(GithubVaultResult {
        root,
        message: "Pulled vault changes from GitHub".into(),
    })
}

#[tauri::command]
pub(crate) async fn github_push_vault(
    app: AppHandle,
    root: String,
    token: String,
    message: String,
) -> Result<GithubVaultResult, String> {
    let root_path = vault_root(&root)?;
    let metadata = read_metadata(&root_path)?;
    let repository = repository_from_metadata(&metadata)?;
    let client = github_client()?;
    push_repository(
        &client,
        &repository,
        &root_path,
        &metadata,
        &token,
        &message,
        &app,
    )
    .await
}

#[tauri::command]
pub(crate) fn github_get_token(repo_url: String) -> Result<String, String> {
    let repository = parse_github_repository(&repo_url, "main")?;
    read_saved_github_token(&repository)
}

#[tauri::command]
pub(crate) fn github_get_vault_token(root: String) -> Result<String, String> {
    let root_path = vault_root(&root)?;
    let metadata = read_metadata(&root_path)?;
    let repository = repository_from_metadata(&metadata)?;
    read_saved_github_token(&repository)
}

#[tauri::command]
pub(crate) fn github_save_token(repo_url: String, token: String) -> Result<(), String> {
    let repository = parse_github_repository(&repo_url, "main")?;
    save_github_token(&repository, &token)
}

#[tauri::command]
pub(crate) fn github_save_vault_token(root: String, token: String) -> Result<(), String> {
    let root_path = vault_root(&root)?;
    let metadata = read_metadata(&root_path)?;
    let repository = repository_from_metadata(&metadata)?;
    save_github_token(&repository, &token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_github_urls_and_short_names() {
        let url = parse_github_repository("https://github.com/glyphary/demo.git", "main")
            .expect("GitHub URL should parse");
        assert_eq!(url.owner, "glyphary");
        assert_eq!(url.name, "demo");
        assert_eq!(url.branch, "main");

        let short = parse_github_repository("glyphary/demo", "develop")
            .expect("short GitHub name should parse");
        assert_eq!(short.branch, "develop");

        let url = github_api_url(&short, ["contents", "00 Start Here"]).expect("URL should build");
        assert_eq!(
            url.as_str(),
            "https://api.github.com/repos/glyphary/demo/contents/00%20Start%20Here"
        );
    }

    #[test]
    fn hashes_local_bytes_stably() {
        assert_eq!(
            local_sha256(b"Glyphary"),
            "215c4621e60a5603ac4a86873d668b776f4764f3ed542fae4029e50cadd0d4d3"
        );
    }

    #[test]
    fn scopes_saved_tokens_to_the_repository() {
        let repository = parse_github_repository("https://github.com/glyphary/demo.git", "main")
            .expect("GitHub URL should parse");
        assert_eq!(
            format!("{}/{}", repository.owner, repository.name),
            "glyphary/demo"
        );
    }

    #[test]
    fn accepts_frontend_clone_request_shape() {
        let request: GithubCloneRequest =
            serde_json::from_str(r#"{"repoUrl":"glyphary/demo","branch":"main","token":"secret"}"#)
                .expect("frontend clone payload should deserialize");

        assert_eq!(request.repo_url, "glyphary/demo");
        assert_eq!(request.branch, "main");
        assert_eq!(request.token, "secret");
    }
}
