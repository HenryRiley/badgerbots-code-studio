#[cfg(windows)]
pub(crate) fn set_active_camp_power(active: bool) -> bool {
    use windows_sys::Win32::System::Power::{
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED, SetThreadExecutionState,
    };
    let flags = if active {
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    unsafe { SetThreadExecutionState(flags) != 0 }
}

#[cfg(not(windows))]
pub(crate) fn set_active_camp_power(_active: bool) -> bool {
    true
}
