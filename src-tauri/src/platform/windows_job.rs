//! Windows job objects: a process and everything it starts, stoppable together
//! even after the process itself has exited (see `ProcessHost::track_group`).

use std::os::windows::io::AsRawHandle;
use std::process::Child;

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, TerminateJobObject,
};

/// An anonymous job object, closed on drop. Closing doesn't end its processes
/// (no kill-on-close limit): only [`Job::terminate`] does.
pub struct Job(isize);

// SAFETY: a job handle is a kernel object handle, usable from any thread.
unsafe impl Send for Job {}

impl Job {
    /// End every process in the job.
    pub fn terminate(&self) {
        unsafe {
            TerminateJobObject(self.0 as HANDLE, 1);
        }
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0 as HANDLE);
        }
    }
}

/// A new job holding `child` (and, from now on, whatever it starts). `None` if
/// the job couldn't be made or the child couldn't join it.
pub fn assign(child: &Child) -> Option<Job> {
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
            return None;
        }
        let job = Job(handle as isize);
        let joined = AssignProcessToJobObject(handle, child.as_raw_handle() as HANDLE) != 0;
        joined.then_some(job)
    }
}
