//! How big a new sandbox is (Settings → Integrations → Vercel). Vercel ties
//! memory to vCPUs, 2 GB each, so the setting is a vCPU count. Unset leaves the
//! provider's own default. Applies to sandboxes made after it's saved: one that
//! already exists keeps the size it was made with. Kept in a user-only file.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};

/// Hobby allows 4 vCPUs (8 GB), Pro 8 (16 GB). Higher is for Enterprise, and
/// Vercel's own error says so if the plan doesn't allow what was asked.
pub const VCPU_RANGE: (u8, u8) = (1, 32);

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Size {
    /// `None` means the provider's default.
    #[serde(default)]
    pub vcpus: Option<u8>,
}

impl Size {
    /// Within what Vercel offers.
    pub fn clamped(self) -> Size {
        Size {
            vcpus: self.vcpus.map(|n| n.clamp(VCPU_RANGE.0, VCPU_RANGE.1)),
        }
    }
}

fn path() -> PathBuf {
    crate::helpers::trace_dir().join("sandbox-size.json")
}

/// The saved size, or the provider's default.
pub fn load() -> Size {
    persist::read_or_log::<Option<Size>>(&path())
        .unwrap_or_default()
        .clamped()
}

pub fn save(size: Size) -> Result<Size, String> {
    let size = size.clamped();
    persist::write_json(&path(), Style::Compact, &size)?;
    Ok(size)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stays_within_range_and_unset_stays_unset() {
        assert_eq!(Size { vcpus: Some(0) }.clamped().vcpus, Some(1));
        assert_eq!(Size { vcpus: Some(200) }.clamped().vcpus, Some(32));
        assert_eq!(Size::default().clamped().vcpus, None);
    }

    #[test]
    fn reaches_the_renderer_in_camel_case() {
        let json = serde_json::to_value(Size { vcpus: Some(4) }).unwrap_or_default();
        assert_eq!(json["vcpus"], 4);
    }
}
