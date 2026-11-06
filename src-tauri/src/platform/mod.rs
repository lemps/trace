//! Ports and adapters for the operating system: the only home for OS-specific code.
//!
//! `ports` says what trace needs, and exactly one adapter implements it for [`Os`] in
//! any build. macOS and Linux share `unix`, overriding only what really differs.
//! `paths` is pure logic rather than a port, so its Windows rules are tested everywhere.

pub mod paths;
pub mod ports;
pub mod process;

/// The operating system this build runs on. Every port is implemented for it.
pub struct Os;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;
