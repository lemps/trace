//! The Windows config folder's ACL: what makes it the equivalent of `0600`. Split from
//! `windows` to keep that file small; it's part of the same adapter.

use std::fs;
use std::path::Path;

use super::process;

/// `S-1-5-21-...`, the current user's security identifier. Safer in an ACL than a
/// name, which depends on locale and domain.
fn current_user_sid() -> Option<String> {
    let out = process::command("whoami")
        .args(["/user", "/fo", "csv", "/nh"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    parse_sid(&text)
}

pub(super) fn parse_sid(whoami_csv: &str) -> Option<String> {
    let sid = whoami_csv
        .trim()
        .rsplit(',')
        .next()?
        .trim()
        .trim_matches('"');
    sid.starts_with("S-1-").then(|| sid.to_string())
}

/// Everyone, Authenticated Users and Users: who a folder can inherit access from.
const ORDINARY_USERS: [&str; 3] = ["*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"];
/// SYSTEM and Administrators keep access: like root on Unix, which `0600` doesn't stop,
/// they can take any file anyway, and backup and security tools run as them.
const ADMINS: [&str; 2] = ["*S-1-5-18", "*S-1-5-32-544"];

pub(super) fn icacls(path: &Path, args: &[String]) -> Result<(), String> {
    let out = process::command("icacls")
        .arg(path)
        .args(args)
        .output()
        .map_err(|e| format!("couldn't run icacls: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    Err(format!(
        "icacls: {} {}",
        String::from_utf8_lossy(&out.stdout).trim(),
        String::from_utf8_lossy(&out.stderr).trim()
    ))
}

/// The equivalent of `0600` for a folder and everything in it: no other ordinary user can
/// read it. New files inherit this, so each write needs nothing extra.
///
/// This runs on every launch, and its last pass walks everything under the config dir:
/// scratch sessions and whatever agents put in them. So a folder that's already
/// restricted is left alone, rather than having every ACL in it rewritten each time.
pub(super) fn restrict_acl(path: &Path) -> Result<(), String> {
    if is_restricted(path) {
        return Ok(());
    }
    let sid = current_user_sid().ok_or("couldn't read the current user's SID")?;
    let mut grant = vec!["/grant:r".to_string(), format!("*{sid}:(OI)(CI)F")];
    grant.extend(ADMINS.iter().map(|admin| format!("{admin}:(OI)(CI)F")));
    grant.extend([
        "/inheritance:r".to_string(),
        "/C".to_string(),
        "/Q".to_string(),
    ]);
    icacls(path, &grant)?;
    // Removing inheritance can leave what was inherited behind as explicit entries.
    let mut remove = vec!["/remove:g".to_string()];
    remove.extend(ORDINARY_USERS.iter().map(ToString::to_string));
    remove.extend(["/T".to_string(), "/C".to_string(), "/Q".to_string()]);
    icacls(path, &remove)
}

/// Whether `restrict_acl` has already run on this folder. Reads just the folder's own
/// ACL, with no `/T`. Any failure counts as "not yet", so the full pass runs.
pub(super) fn is_restricted(path: &Path) -> bool {
    let saved = std::env::temp_dir().join(format!("trace-acl-{}.txt", uuid::Uuid::new_v4()));
    let ok = icacls(
        path,
        &["/save".to_string(), saved.to_string_lossy().into_owned()],
    )
    .is_ok();
    // `/save` writes UTF-16: the folder's name on one line, its SDDL on the next.
    let sddl = fs::read(&saved).ok().map(|bytes| {
        let units: Vec<u16> = bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| u16::from_le_bytes(*pair))
            .collect();
        String::from_utf16_lossy(&units)
    });
    let _ = fs::remove_file(&saved);
    ok && sddl.is_some_and(|text| crate::platform::acl::shuts_out_ordinary_users(&text))
}
