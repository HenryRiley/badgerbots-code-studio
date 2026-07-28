use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

const ONBOARDING_CLIENT: &str = "host-onboarding-v1";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingConfig {
    pub schema_version: u8,
    pub service_url: String,
    pub publishable_key: String,
    pub instructor_email: Option<String>,
    pub organization_id: Option<String>,
    pub organization_name: Option<String>,
    pub location_id: Option<String>,
    pub location_name: Option<String>,
    pub host_id: Option<String>,
    pub host_display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingView {
    pub service_configured: bool,
    pub signed_in: bool,
    pub paired: bool,
    pub service_url: Option<String>,
    pub instructor_email: Option<String>,
    pub organization_name: Option<String>,
    pub location_name: Option<String>,
    pub host_id: Option<String>,
    pub host_display_name: Option<String>,
    pub credential_protection: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Membership {
    #[serde(alias = "organization_id")]
    pub organization_id: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub id: String,
    #[serde(alias = "organization_id")]
    pub organization_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstructorProfile {
    pub memberships: Vec<Membership>,
    pub organizations: Vec<Organization>,
    pub locations: Vec<Location>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInResult {
    pub onboarding: OnboardingView,
    pub profile: InstructorProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AuthResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

#[derive(Debug, Clone)]
struct AuthSession {
    access_token: String,
    #[allow(dead_code)]
    refresh_token: String,
    #[allow(dead_code)]
    expires_in: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairResponse {
    host_id: String,
    pairing_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProtectedHostCredential {
    schema_version: u8,
    host_id: String,
    pairing_token: String,
}

#[derive(Debug, Deserialize)]
struct ApiError {
    error: Option<String>,
}

pub struct OnboardingStore {
    config_path: PathBuf,
    credential_path: PathBuf,
    config: Mutex<OnboardingConfig>,
    auth: Mutex<Option<AuthSession>>,
    client: Client,
}

impl OnboardingStore {
    pub fn load(directory: &Path) -> Result<Self, String> {
        fs::create_dir_all(directory)
            .map_err(|_| "Host application data could not be prepared.".to_string())?;
        let config_path = directory.join("host-onboarding.json");
        let credential_path = directory.join("host-credential.bin");
        let config = fs::read_to_string(&config_path)
            .ok()
            .and_then(|contents| serde_json::from_str::<OnboardingConfig>(&contents).ok())
            .filter(|value| value.schema_version == 1)
            .unwrap_or_default();
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(20))
            .https_only(true)
            .build()
            .map_err(|_| "Secure classroom networking could not be initialized.".to_string())?;
        Ok(Self {
            config_path,
            credential_path,
            config: Mutex::new(config),
            auth: Mutex::new(None),
            client,
        })
    }

    pub fn view(&self) -> Result<OnboardingView, String> {
        let config = self
            .config
            .lock()
            .map_err(|_| "Host onboarding state is temporarily unavailable.".to_string())?;
        let signed_in = self
            .auth
            .lock()
            .map_err(|_| "Host authentication state is temporarily unavailable.".to_string())?
            .is_some();
        Ok(OnboardingView {
            service_configured: !config.service_url.is_empty()
                && !config.publishable_key.is_empty(),
            signed_in,
            paired: config.host_id.is_some() && self.host_credential().is_ok(),
            service_url: (!config.service_url.is_empty()).then(|| config.service_url.clone()),
            instructor_email: config.instructor_email.clone(),
            organization_name: config.organization_name.clone(),
            location_name: config.location_name.clone(),
            host_id: config.host_id.clone(),
            host_display_name: config.host_display_name.clone(),
            credential_protection: credential_protection_label(),
        })
    }

    pub fn configure(
        &self,
        service_url: String,
        publishable_key: String,
    ) -> Result<OnboardingView, String> {
        let service_url = validate_service_url(&service_url)?;
        validate_publishable_key(&publishable_key)?;
        let mut config = self
            .config
            .lock()
            .map_err(|_| "Host onboarding state is temporarily unavailable.".to_string())?;
        let service_changed =
            config.service_url != service_url || config.publishable_key != publishable_key;
        if service_changed && config.host_id.is_some() {
            return Err(
                "Unpair this Host before changing its classroom service configuration.".to_string(),
            );
        }
        config.schema_version = 1;
        config.service_url = service_url;
        config.publishable_key = publishable_key;
        persist_json_atomic(&self.config_path, &*config)?;
        drop(config);
        self.view()
    }

    pub async fn sign_in(&self, email: String, password: String) -> Result<SignInResult, String> {
        let email = normalize_email(&email)?;
        if password.is_empty() || password.len() > 256 {
            return Err("Enter the instructor password created during secure setup.".to_string());
        }
        let (service_url, publishable_key) = self.service_config()?;
        let auth_url = format!("{service_url}/auth/v1/token?grant_type=password");
        let response = self
            .client
            .post(auth_url)
            .header("apikey", &publishable_key)
            .json(&json!({ "email": email, "password": password }))
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    "Instructor sign-in timed out. Check the internet connection and try again."
                        .to_string()
                } else {
                    "The Host could not reach the classroom service. Check the internet connection and try again."
                        .to_string()
                }
            })?;
        let status = response.status();
        if !status.is_success() {
            let body = response.bytes().await.unwrap_or_default();
            return Err(auth_failure_message(status, &body));
        }
        let auth_response = response
            .json::<AuthResponse>()
            .await
            .map_err(|_| "The classroom sign-in response was invalid.".to_string())?;
        let session = AuthSession {
            access_token: auth_response.access_token,
            refresh_token: auth_response.refresh_token,
            expires_in: auth_response.expires_in,
        };
        let profile = self
            .edge_request::<InstructorProfile>(
                &service_url,
                &publishable_key,
                &session.access_token,
                json!({ "action": "profile" }),
            )
            .await?;
        if profile.organizations.is_empty() || profile.locations.is_empty() {
            return Err("This instructor has no available BadgerBots location.".to_string());
        }
        {
            let mut config = self
                .config
                .lock()
                .map_err(|_| "Host onboarding state is temporarily unavailable.".to_string())?;
            config.instructor_email = Some(email);
            persist_json_atomic(&self.config_path, &*config)?;
        }
        *self
            .auth
            .lock()
            .map_err(|_| "Host authentication state is temporarily unavailable.".to_string())? =
            Some(session);
        Ok(SignInResult {
            onboarding: self.view()?,
            profile,
        })
    }

    pub fn clear_service_configuration(&self) -> Result<OnboardingView, String> {
        let mut config = self
            .config
            .lock()
            .map_err(|_| "Host onboarding state is temporarily unavailable.".to_string())?;
        if config.host_id.is_some() {
            return Err(
                "This Host is already paired. Unpair it before changing the classroom service."
                    .to_string(),
            );
        }
        config.service_url.clear();
        config.publishable_key.clear();
        config.instructor_email = None;
        persist_json_atomic(&self.config_path, &*config)?;
        drop(config);
        *self
            .auth
            .lock()
            .map_err(|_| "Host authentication state is temporarily unavailable.".to_string())? =
            None;
        self.view()
    }

    pub async fn pair(
        &self,
        organization_id: String,
        location_id: String,
        display_name: String,
    ) -> Result<OnboardingView, String> {
        validate_opaque_id(&organization_id, "organization")?;
        validate_opaque_id(&location_id, "location")?;
        let display_name = display_name.trim();
        if display_name.len() < 3 || display_name.len() > 80 {
            return Err("Host name must contain 3 to 80 characters.".to_string());
        }
        let (service_url, publishable_key) = self.service_config()?;
        let access_token = self
            .auth
            .lock()
            .map_err(|_| "Host authentication state is temporarily unavailable.".to_string())?
            .as_ref()
            .map(|session| session.access_token.clone())
            .ok_or_else(|| "Sign in before pairing this Host.".to_string())?;
        let profile = self
            .edge_request::<InstructorProfile>(
                &service_url,
                &publishable_key,
                &access_token,
                json!({ "action": "profile" }),
            )
            .await?;
        let organization = profile
            .organizations
            .iter()
            .find(|item| item.id == organization_id)
            .ok_or_else(|| "The selected organization is unavailable.".to_string())?;
        let location = profile
            .locations
            .iter()
            .find(|item| item.id == location_id && item.organization_id == organization_id)
            .ok_or_else(|| "The selected location is unavailable.".to_string())?;
        let paired = self
            .edge_request::<PairResponse>(
                &service_url,
                &publishable_key,
                &access_token,
                json!({
                    "action": "pair_host",
                    "organizationId": organization_id,
                    "locationId": location_id,
                    "displayName": display_name,
                }),
            )
            .await?;
        validate_opaque_id(&paired.host_id, "Host")?;
        if paired.pairing_token.len() < 32 {
            return Err("The classroom service returned an invalid Host credential.".to_string());
        }
        let protected = ProtectedHostCredential {
            schema_version: 1,
            host_id: paired.host_id.clone(),
            pairing_token: paired.pairing_token,
        };
        persist_protected_credential(&self.credential_path, &protected)?;
        {
            let mut config = self
                .config
                .lock()
                .map_err(|_| "Host onboarding state is temporarily unavailable.".to_string())?;
            config.organization_id = Some(organization.id.clone());
            config.organization_name = Some(organization.name.clone());
            config.location_id = Some(location.id.clone());
            config.location_name = Some(location.name.clone());
            config.host_id = Some(paired.host_id);
            config.host_display_name = Some(display_name.to_string());
            persist_json_atomic(&self.config_path, &*config)?;
        }
        self.view()
    }

    pub fn sign_out(&self) -> Result<OnboardingView, String> {
        *self
            .auth
            .lock()
            .map_err(|_| "Host authentication state is temporarily unavailable.".to_string())? =
            None;
        self.view()
    }

    pub fn host_credential(&self) -> Result<(String, String), String> {
        let protected = fs::read(&self.credential_path)
            .map_err(|_| "This Host has not been paired yet.".to_string())?;
        let plaintext = unprotect_for_current_user(&protected)?;
        let credential = serde_json::from_slice::<ProtectedHostCredential>(&plaintext)
            .map_err(|_| "The protected Host credential is invalid.".to_string())?;
        if credential.schema_version != 1 {
            return Err("The protected Host credential version is unsupported.".to_string());
        }
        Ok((credential.host_id, credential.pairing_token))
    }

    fn service_config(&self) -> Result<(String, String), String> {
        let config = self
            .config
            .lock()
            .map_err(|_| "Host onboarding state is temporarily unavailable.".to_string())?;
        if config.service_url.is_empty() || config.publishable_key.is_empty() {
            return Err("Configure the BadgerBots classroom service first.".to_string());
        }
        Ok((config.service_url.clone(), config.publishable_key.clone()))
    }

    async fn edge_request<T: for<'de> Deserialize<'de>>(
        &self,
        service_url: &str,
        publishable_key: &str,
        access_token: &str,
        body: Value,
    ) -> Result<T, String> {
        let response = self
            .client
            .post(format!("{service_url}/functions/v1/classroom-api"))
            .header("apikey", publishable_key)
            .header("authorization", format!("Bearer {access_token}"))
            .header("x-badgerbots-client", ONBOARDING_CLIENT)
            .json(&body)
            .send()
            .await
            .map_err(|_| "The Host could not reach the classroom service.".to_string())?;
        if !response.status().is_success() {
            let message = response
                .json::<ApiError>()
                .await
                .ok()
                .and_then(|value| value.error)
                .unwrap_or_else(|| "The classroom service rejected this request.".to_string());
            return Err(message);
        }
        response
            .json::<T>()
            .await
            .map_err(|_| "The classroom service response was invalid.".to_string())
    }
}

pub fn validate_service_url(value: &str) -> Result<String, String> {
    let parsed = Url::parse(value.trim())
        .map_err(|_| "Enter a valid HTTPS classroom service URL.".to_string())?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "Enter a valid HTTPS classroom service URL.".to_string())?;
    if parsed.scheme() != "https"
        || !host.ends_with(".supabase.co")
        || parsed.port().is_some()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(
            "Use the HTTPS Supabase Project URL without a path, query, or port.".to_string(),
        );
    }
    Ok(parsed.as_str().trim_end_matches('/').to_string())
}

fn validate_publishable_key(value: &str) -> Result<(), String> {
    if !value.starts_with("sb_publishable_") || value.len() < 24 || value.len() > 512 {
        return Err("Enter the browser-safe Supabase Publishable key.".to_string());
    }
    Ok(())
}

fn validate_email(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.len() > 200
        || trimmed.contains(char::is_whitespace)
        || !trimmed.contains('@')
        || !trimmed
            .rsplit_once('.')
            .is_some_and(|(prefix, suffix)| prefix.contains('@') && suffix.len() >= 2)
    {
        return Err("Enter a valid instructor email address.".to_string());
    }
    Ok(())
}

fn normalize_email(value: &str) -> Result<String, String> {
    validate_email(value)?;
    Ok(value.trim().to_ascii_lowercase())
}

fn auth_failure_message(status: StatusCode, body: &[u8]) -> String {
    let payload = serde_json::from_slice::<Value>(body).unwrap_or(Value::Null);
    let code = ["code", "error_code", "error"]
        .iter()
        .find_map(|field| payload.get(field).and_then(Value::as_str))
        .unwrap_or_default()
        .to_ascii_lowercase();
    let detail = ["msg", "message", "error_description"]
        .iter()
        .find_map(|field| payload.get(field).and_then(Value::as_str))
        .unwrap_or_default()
        .to_ascii_lowercase();

    match code.as_str() {
        "email_not_confirmed" => {
            "This instructor email has not been confirmed. Open its Supabase confirmation email, then try again."
                .to_string()
        }
        "user_banned" => {
            "This instructor account is disabled. Ask the BadgerBots account owner to restore access."
                .to_string()
        }
        "over_request_rate_limit" | "over_email_send_rate_limit" => {
            "Too many sign-in attempts were made. Wait a few minutes, then try again.".to_string()
        }
        "email_provider_disabled" | "provider_disabled" => {
            "Instructor password sign-in is disabled in the classroom service. An administrator must enable email authentication."
                .to_string()
        }
        "invalid_credentials" | "user_not_found" => {
            "The instructor email or password was not accepted. Use the email shown in Supabase Authentication, or reset that account’s password."
                .to_string()
        }
        _ if status == StatusCode::TOO_MANY_REQUESTS => {
            "Too many sign-in attempts were made. Wait a few minutes, then try again.".to_string()
        }
        _ if detail.contains("api key")
            || detail.contains("apikey")
            || code == "bad_jwt"
            || code == "no_authorization" =>
        {
            "The classroom service key was rejected. Select “Change service connection” and enter this Supabase project’s current Project URL and Publishable key."
                .to_string()
        }
        _ if status.is_server_error() => {
            "The classroom authentication service is temporarily unavailable. Try again shortly; if it continues, check the Supabase project status."
                .to_string()
        }
        _ => {
            "Instructor sign-in was rejected by the classroom service. Verify the account in Supabase Authentication and try again."
                .to_string()
        }
    }
}

fn validate_opaque_id(value: &str, label: &str) -> Result<(), String> {
    if value.len() < 8
        || value.len() > 64
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(format!("The selected {label} identifier is invalid."));
    }
    Ok(())
}

fn persist_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let temporary = path.with_extension("json.new");
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| "Host onboarding state could not be serialized.".to_string())?;
    fs::write(&temporary, bytes)
        .map_err(|_| "Host onboarding state could not be staged.".to_string())?;
    replace_file_atomic(&temporary, path)
        .map_err(|_| "Host onboarding state could not be saved atomically.".to_string())
}

fn persist_protected_credential(
    path: &Path,
    credential: &ProtectedHostCredential,
) -> Result<(), String> {
    let plaintext = serde_json::to_vec(credential)
        .map_err(|_| "Host credential could not be serialized.".to_string())?;
    let protected = protect_for_current_user(&plaintext)?;
    let temporary = path.with_extension("bin.new");
    fs::write(&temporary, protected)
        .map_err(|_| "Host credential could not be staged.".to_string())?;
    replace_file_atomic(&temporary, path)
        .map_err(|_| "Host credential could not be saved atomically.".to_string())
}

#[cfg(windows)]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::{io, os::windows::ffi::OsStrExt};
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
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file_atomic(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn protect_for_current_user(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData},
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(plaintext.len())
            .map_err(|_| "Host credential is too large.".to_string())?,
        pbData: plaintext.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let succeeded = unsafe {
        CryptProtectData(
            &input,
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        return Err("Windows could not protect the Host credential.".to_string());
    }
    let protected = unsafe {
        let bytes = slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(protected)
}

#[cfg(not(windows))]
fn protect_for_current_user(_plaintext: &[u8]) -> Result<Vec<u8>, String> {
    Err(
        "Secure Host credential storage is available only in the supported Windows build."
            .to_string(),
    )
}

#[cfg(windows)]
fn unprotect_for_current_user(protected: &[u8]) -> Result<Vec<u8>, String> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(protected.len())
            .map_err(|_| "Protected Host credential is too large.".to_string())?,
        pbData: protected.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    let succeeded = unsafe {
        CryptUnprotectData(
            &input,
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        return Err(
            "Windows could not unlock this Host credential for the current account.".to_string(),
        );
    }
    let plaintext = unsafe {
        let bytes = slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(plaintext)
}

#[cfg(not(windows))]
fn unprotect_for_current_user(_protected: &[u8]) -> Result<Vec<u8>, String> {
    Err(
        "Secure Host credential storage is available only in the supported Windows build."
            .to_string(),
    )
}

fn credential_protection_label() -> &'static str {
    if cfg!(windows) {
        "Windows user-protected storage"
    } else {
        "Unavailable outside the supported Windows build"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_a_bare_supabase_https_project_url() {
        assert_eq!(
            validate_service_url("https://example.supabase.co/").unwrap(),
            "https://example.supabase.co"
        );
        assert!(validate_service_url("http://example.supabase.co").is_err());
        assert!(validate_service_url("https://example.supabase.co/rest/v1").is_err());
        assert!(validate_service_url("https://example.invalid").is_err());
    }

    #[test]
    fn rejects_credentials_in_the_publishable_key_field() {
        assert!(validate_publishable_key("sb_publishable_example-key-long-enough").is_ok());
        assert!(validate_publishable_key("sb_secret_do-not-store-this-here").is_err());
        assert!(validate_publishable_key("service-role-value").is_err());
    }

    #[test]
    fn accepts_the_existing_profile_api_field_names() {
        let profile = serde_json::from_value::<InstructorProfile>(json!({
            "memberships": [{ "organization_id": "organization-1", "role": "owner" }],
            "organizations": [{ "id": "organization-1", "name": "BadgerBots" }],
            "locations": [{
                "id": "location-1",
                "organization_id": "organization-1",
                "name": "Madison"
            }]
        }))
        .unwrap();
        assert_eq!(profile.memberships[0].organization_id, "organization-1");
        assert_eq!(profile.locations[0].organization_id, "organization-1");
    }

    #[test]
    fn normalizes_instructor_email_before_authentication() {
        assert_eq!(
            normalize_email("  Instructor@BadgerBots.ORG  ").unwrap(),
            "instructor@badgerbots.org"
        );
    }

    #[test]
    fn maps_auth_failures_to_actionable_safe_messages() {
        assert!(
            auth_failure_message(
                StatusCode::BAD_REQUEST,
                br#"{"code":"invalid_credentials","msg":"Invalid login credentials"}"#
            )
            .contains("email or password")
        );
        assert!(
            auth_failure_message(
                StatusCode::BAD_REQUEST,
                br#"{"error_code":"email_not_confirmed","msg":"Email not confirmed"}"#
            )
            .contains("has not been confirmed")
        );
        assert!(
            auth_failure_message(
                StatusCode::UNAUTHORIZED,
                br#"{"message":"Invalid API key"}"#
            )
            .contains("Change service connection")
        );
        assert!(
            auth_failure_message(StatusCode::TOO_MANY_REQUESTS, b"not-json").contains("Too many")
        );
        assert!(
            auth_failure_message(StatusCode::SERVICE_UNAVAILABLE, b"")
                .contains("temporarily unavailable")
        );
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_protects_the_host_credential() {
        let plaintext = b"host-secret-that-must-not-remain-plaintext";
        let protected = protect_for_current_user(plaintext).unwrap();
        assert_ne!(protected, plaintext);
        assert!(
            !protected
                .windows(plaintext.len())
                .any(|window| window == plaintext)
        );
        assert_eq!(unprotect_for_current_user(&protected).unwrap(), plaintext);
    }
}
