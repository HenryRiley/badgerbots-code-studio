#[cfg(any(windows, test))]
const RULE_NAME: &str = "BadgerBots Code Studio Minecraft";

pub fn approve_private_minecraft_port(server_port: u16) -> Result<(), String> {
    if server_port < 1024 {
        return Err("The configured Minecraft port is not eligible for approval.".to_string());
    }
    approve_private_minecraft_port_platform(server_port)
}

#[cfg(any(windows, test))]
fn firewall_parameters(server_port: u16) -> String {
    format!(
        "advfirewall firewall add rule name=\"{RULE_NAME}\" dir=in action=allow protocol=TCP localport={server_port} profile=private enable=yes"
    )
}

#[cfg(windows)]
fn approve_private_minecraft_port_platform(server_port: u16) -> Result<(), String> {
    use std::{mem, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        System::Threading::{GetExitCodeProcess, INFINITE, WaitForSingleObject},
        UI::{
            Shell::{SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW},
            WindowsAndMessaging::SW_HIDE,
        },
    };

    fn wide(value: &str) -> Vec<u16> {
        std::ffi::OsStr::new(value)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let verb = wide("runas");
    let executable = wide("netsh.exe");
    let parameters = wide(&firewall_parameters(server_port));
    let mut execution = SHELLEXECUTEINFOW {
        cbSize: mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        hwnd: ptr::null_mut(),
        lpVerb: verb.as_ptr(),
        lpFile: executable.as_ptr(),
        lpParameters: parameters.as_ptr(),
        lpDirectory: ptr::null(),
        nShow: SW_HIDE,
        hInstApp: ptr::null_mut(),
        lpIDList: ptr::null_mut(),
        lpClass: ptr::null(),
        hkeyClass: ptr::null_mut(),
        dwHotKey: 0,
        Anonymous: unsafe { mem::zeroed() },
        hProcess: ptr::null_mut(),
    };
    if unsafe { ShellExecuteExW(&mut execution) } == 0 {
        return Err(
            "Windows firewall approval was cancelled or could not start. Approve the Windows prompt and try again."
                .to_string(),
        );
    }
    if execution.hProcess.is_null() {
        return Err("Windows did not return firewall approval status.".to_string());
    }
    let wait_result = unsafe { WaitForSingleObject(execution.hProcess, INFINITE) };
    let mut exit_code = 1u32;
    let read_exit = unsafe { GetExitCodeProcess(execution.hProcess, &mut exit_code) };
    unsafe {
        CloseHandle(execution.hProcess);
    }
    if wait_result != WAIT_OBJECT_0 || read_exit == 0 || exit_code != 0 {
        return Err(
            "Windows did not approve the private-network Minecraft rule. Confirm the UAC prompt and that this network is marked Private."
                .to_string(),
        );
    }
    Ok(())
}

#[cfg(not(windows))]
fn approve_private_minecraft_port_platform(_server_port: u16) -> Result<(), String> {
    Err("Firewall approval is available only in the installed Windows Host.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scopes_the_rule_to_tcp_and_private_networks() {
        let parameters = firewall_parameters(25565);
        assert!(parameters.contains("dir=in"));
        assert!(parameters.contains("protocol=TCP"));
        assert!(parameters.contains("localport=25565"));
        assert!(parameters.contains("profile=private"));
        assert!(!parameters.contains("profile=any"));
    }

    #[test]
    fn rejects_privileged_ports_before_platform_execution() {
        assert!(approve_private_minecraft_port(80).is_err());
    }
}
