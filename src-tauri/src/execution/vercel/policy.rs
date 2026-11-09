//! A sandbox's [`Egress`] as Vercel's network policy: the firewall's `allow`
//! map, one entry per domain with its header `transform`, and `*` so the rest
//! of the internet stays open as it is by default. Read from `@vercel/sandbox`
//! (3.9.1, `utils/network-policy.ts`): the SDK sends this object as is, to
//! both a session (`POST …/sessions/{id}/network-policy`, now) and the sandbox
//! (`PATCH /v2/sandboxes/{name}`, every later session). Vercel never gives the
//! values back: a read shows only `injectionRules[].headerNames`.

use serde_json::{json, Map, Value};

use crate::execution::sandbox::egress::Egress;

pub fn to_json(egress: &Egress) -> Value {
    let mut allow = Map::new();
    for injection in &egress.injections {
        let headers: Map<String, Value> = injection
            .headers
            .iter()
            .map(|(name, value)| (name.clone(), Value::String(value.clone())))
            .collect();
        let mut rule = json!({ "transform": [{ "headers": headers }] });
        if let Some(path) = &injection.path {
            rule["match"] = json!({ "path": { "exact": path } });
        } else if let Some(prefix) = &injection.path_prefix {
            rule["match"] = json!({ "path": { "startsWith": prefix } });
        }
        if !injection.methods.is_empty() {
            rule["match"]["method"] = json!(injection.methods);
        }
        match allow.get_mut(&injection.domain) {
            Some(Value::Array(rules)) => rules.push(rule),
            _ => {
                allow.insert(injection.domain.clone(), json!([rule]));
            }
        }
    }
    allow.insert("*".to_string(), json!([]));
    json!({ "allow": allow })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::sandbox::egress::Injection;

    #[test]
    fn each_domain_gets_its_headers_and_the_rest_stays_open() {
        let egress = Egress {
            injections: vec![
                Injection {
                    domain: "api.github.com".into(),
                    headers: vec![("Authorization".into(), "Bearer t".into())],
                    ..Injection::default()
                },
                Injection {
                    domain: "api.github.com".into(),
                    headers: vec![("X-Other".into(), "o".into())],
                    path: Some("/v1/x".into()),
                    methods: vec!["POST".into()],
                    ..Injection::default()
                },
            ],
        };
        assert_eq!(
            to_json(&egress),
            json!({ "allow": {
                "api.github.com": [
                    { "transform": [{ "headers": { "Authorization": "Bearer t" } }] },
                    { "transform": [{ "headers": { "X-Other": "o" } }],
                      "match": { "path": { "exact": "/v1/x" }, "method": ["POST"] } },
                ],
                "*": [],
            }})
        );
    }

    #[test]
    fn an_mcp_servers_token_goes_to_its_path_and_below() {
        let egress = Egress {
            injections: vec![Injection {
                domain: "terminal.obsidianos.com".into(),
                headers: vec![("Authorization".into(), "Bearer m".into())],
                path_prefix: Some("/api/v1/hq/mcp".into()),
                ..Injection::default()
            }],
        };
        let v = to_json(&egress);
        assert_eq!(
            v["allow"]["terminal.obsidianos.com"][0]["match"],
            json!({ "path": { "startsWith": "/api/v1/hq/mcp" } })
        );
    }

    #[test]
    fn no_injections_is_open_internet() {
        assert_eq!(to_json(&Egress::default()), json!({ "allow": { "*": [] } }));
    }
}
