//! Reading a Windows ACL in SDDL form, the text `icacls /save` writes. Pure logic, so
//! it's tested on every OS like `paths`; only `windows` calls it.
//!
//! SDDL isn't localized, unlike `icacls`' own listing ("Everyone" is "Jeder" in German),
//! which is why trace reads this rather than the names.

/// Who `restrict_acl` takes access away from, as SDDL writes them: Everyone,
/// Authenticated Users and Users, by alias and by SID.
const ORDINARY_USERS: [&str; 6] = ["WD", "AU", "BU", "S-1-1-0", "S-1-5-11", "S-1-5-32-545"];

/// True when this SDDL is what `restrict_acl` leaves on a folder: the DACL is protected,
/// so nothing is inherited from the parent, and no entry lets ordinary users in.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn shuts_out_ordinary_users(sddl: &str) -> bool {
    // The DACL runs from "D:" to an audit section ("S:"), if one follows.
    let Some(dacl) = sddl.split_once("D:").map(|(_, rest)| rest) else {
        return false;
    };
    let dacl = dacl.split("S:").next().unwrap_or_default();
    // Flags (P, AI, AR…) come before the first entry; P is "protected".
    let flags = dacl.split('(').next().unwrap_or_default();
    if !flags.contains('P') {
        return false;
    }
    !dacl
        .split('(')
        .skip(1)
        .filter_map(|ace| ace.split(')').next())
        .any(|ace| {
            let fields: Vec<&str> = ace.split(';').collect();
            // type;flags;rights;object;inherited object;trustee
            let allows = fields.first().is_some_and(|t| t.starts_with('A'));
            let trustee = fields.get(5).copied().unwrap_or_default();
            allows && ORDINARY_USERS.contains(&trustee)
        })
}

#[cfg(test)]
mod tests {
    use super::shuts_out_ordinary_users;

    const ME: &str = "S-1-5-21-3715178070-2736913706-1414512290-1001";

    #[test]
    fn a_restricted_folder_is_recognized() {
        let sddl = format!("D:PAI(A;OICI;FA;;;BA)(A;OICI;FA;;;SY)(A;OICI;FA;;;{ME})");
        assert!(shuts_out_ordinary_users(&sddl));
    }

    #[test]
    fn an_inheriting_folder_is_not() {
        let sddl = format!("D:AI(A;OICIID;FA;;;SY)(A;OICIID;FA;;;BA)(A;OICIID;FA;;;{ME})");
        assert!(!shuts_out_ordinary_users(&sddl));
    }

    #[test]
    fn an_ordinary_user_entry_left_behind_is_not() {
        for who in ["WD", "AU", "BU", "S-1-5-32-545"] {
            let sddl = format!("D:PAI(A;OICI;FA;;;{ME})(A;OICI;0x1200a9;;;{who})");
            assert!(!shuts_out_ordinary_users(&sddl), "{who}");
        }
    }

    #[test]
    fn a_deny_entry_for_ordinary_users_is_fine() {
        let sddl = format!("D:PAI(A;OICI;FA;;;{ME})(D;OICI;FA;;;WD)");
        assert!(shuts_out_ordinary_users(&sddl));
    }

    #[test]
    fn an_audit_section_after_the_dacl_is_ignored() {
        let sddl = format!("D:PAI(A;OICI;FA;;;{ME})S:AI(AU;SA;FA;;;WD)");
        assert!(shuts_out_ordinary_users(&sddl));
    }

    #[test]
    fn no_dacl_is_not_restricted() {
        assert!(!shuts_out_ordinary_users(""));
        assert!(!shuts_out_ordinary_users("O:BAG:SY"));
    }
}
