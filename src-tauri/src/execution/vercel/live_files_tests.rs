//! The Files tab against a real sandbox (ignored by default):
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live_files -- --ignored --nocapture`.

use std::collections::HashMap;
use std::sync::Arc;

use super::live_tests::{token, Cleanup};
use super::{auth, Vercel};
use crate::diff_summary::ChangeKind;
use crate::execution::sandbox::files::RemoteDir;
use crate::execution::sandbox::host::{ready, SandboxTarget, Secrets};
use crate::execution::sandbox::SandboxProvider;
use crate::repo_catalog::model::RemoteRepo;

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_files_reads_the_checkout() {
    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let id = format!("files-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let target = SandboxTarget {
        workspace_id: id.clone(),
        sandbox: format!("trace-{id}"),
        remote: RemoteRepo {
            host: "github.com".into(),
            owner: "octocat".into(),
            name: "Hello-World".into(),
        },
        title: "Live test: files".into(),
        setup: Default::default(),
    };
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: target.sandbox.clone(),
    };
    let r = ready(
        &*provider,
        &target,
        &Secrets::default(),
        &HashMap::new(),
        &|l| println!("  say: {l}"),
    )
    .expect("ready");
    let edit = format!(
        "cd {} && printf 'Hello World!\\nand more\\n' > README && printf 'a\\nb\\nc\\n' > 'new file.md' && printf 'a\\0b\\nc' > blob.bin",
        r.dir
    );
    let argv = vec!["bash".to_string(), "-c".to_string(), edit];
    assert!(provider
        .exec(&r.session_id, &argv, &HashMap::new())
        .expect("edit")
        .ok());

    let remote = RemoteDir {
        provider: &*provider,
        session_id: &r.session_id,
        dir: &r.dir,
    };
    let s = remote.summary().expect("summary");
    println!(
        "base {} files {:?}",
        s.base,
        s.files
            .iter()
            .map(|f| (&f.path, f.add, f.del, f.status))
            .collect::<Vec<_>>()
    );
    assert!(s.base.starts_with("origin/"));
    let readme = s
        .files
        .iter()
        .find(|f| f.path == "README")
        .expect("README changed");
    assert_eq!(readme.status, ChangeKind::Modified);
    let new = s
        .files
        .iter()
        .find(|f| f.path == "new file.md")
        .expect("new file");
    assert_eq!((new.add, new.status), (3, ChangeKind::Untracked));
    let blob = s
        .files
        .iter()
        .find(|f| f.path == "blob.bin")
        .expect("binary");
    assert_eq!(blob.add, 0);

    let d = remote.file_diff("README", None).expect("diff");
    println!(
        "README diff: +{} -{} in {} hunks",
        d.add,
        d.del,
        d.hunks.len()
    );
    assert!(!d.hunks.is_empty());
    let d = remote
        .file_diff("new file.md", None)
        .expect("untracked diff");
    assert!(!d.hunks.is_empty());

    assert_eq!(remote.read("new file.md").expect("read"), "a\nb\nc\n");
    assert!(remote.read("blob.bin").is_err(), "binary refused");
    assert!(remote.read("../etc/passwd").is_err(), "escape refused");

    let list = remote.list().expect("list");
    println!("list: {:?}", list.files);
    assert!(list.files.iter().any(|f| f == "new file.md"));
    assert!(list.files.iter().any(|f| f == "README"));
    assert!(!list.truncated);
}
