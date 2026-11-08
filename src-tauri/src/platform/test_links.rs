//! Making symlinks in tests (path-containment tests need them). Windows only allows
//! them with Developer Mode or elevation, so each says whether it worked and a test
//! without one skips that case.

use std::path::Path;

/// A link at `link` to the file `target`. False if this machine won't make one.
pub fn file(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    let made = std::os::unix::fs::symlink(target, link);
    #[cfg(windows)]
    let made = std::os::windows::fs::symlink_file(target, link);
    made.is_ok()
}

/// A link at `link` to the directory `target`. False if this machine won't make one.
pub fn dir(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    let made = std::os::unix::fs::symlink(target, link);
    #[cfg(windows)]
    let made = std::os::windows::fs::symlink_dir(target, link).or_else(|_| junction(target, link));
    made.is_ok()
}

/// Without symlink rights, Windows still lets anyone make a directory junction,
/// which resolves the same way.
#[cfg(windows)]
fn junction(target: &Path, link: &Path) -> std::io::Result<()> {
    let plain = |p: &Path| super::paths::plain(&p.to_string_lossy());
    let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J", &plain(link), &plain(target)])
        .stdout(std::process::Stdio::null())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other("mklink /J failed"))
    }
}
