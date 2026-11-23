# NVIDIA SkillSpector scan inventory

Scan date: **2026-11-23**  
Scanner: NVIDIA SkillSpector source commit `f9bb13dd1667eb4e7ac97b8ebace3160041ed571`  
Mode: static analysis (`--no-llm`); no author-supplied baseline or suppression was applied.

Raw JSON reports were generated for every row and reviewed to produce this inventory. They are intentionally ignored because machine output is reproducible, verbose, and would create oversized commits; CI should publish it as a retained artifact. Results are not endorsements: static matches can be false positives, and incomplete coverage can miss risks.

| Skill | Score / rating | Findings | Coverage | Project disposition |
|---|---|---:|---:|---|
| accessibility | 0 / LOW | 0 | 100% | Approved |
| architecture-decision-records | 0 / LOW | 0 | 100% | Approved |
| backend-patterns | 0 / LOW | 0 | 100% | Approved |
| postgres-patterns | 0 / LOW | 0 | 100% | Approved |
| deployment-patterns | 14 / LOW | 2 medium | 100% | Review required |
| e2e-testing | 12 / LOW | 4 medium | 100% | Review required |
| react-patterns | 8 / LOW | 1 medium | 100% | Review required |
| react-testing | 8 / LOW | 1 medium | 100% | Review required |
| api-design | 0 / LOW | 0 | 0% partial | Incomplete—manual review required |
| frontend-patterns | 0 / LOW | 0 | 0% partial | Incomplete—manual review required |
| docker-patterns | 34 / MEDIUM | 5 high, 1 medium | 100% | Blocked pending finding review |
| security-review | 16 / LOW | 1 high | 100% | Blocked pending finding review |
| archify | 100 / CRITICAL | 32 high, 7 medium, 9 low | 40.6% partial | Blocked for future use pending finding review |

## Interpretation

- The Archify scan inspected a large executable skill bundle and flagged analysis-evasion, prompt-injection, YARA, privilege-escalation, memory-poisoning, MCP, and supply-chain patterns. Coverage was partial. The user explicitly requested Archify for the diagrams in this change, but the skill is not approved for further project use until those findings are reviewed.
- Docker examples often contain privileged/system commands; this may explain some matches but does not waive review.
- A `LOW` aggregate score can still contain an individual `HIGH` match. Project policy blocks on individual high findings, not only the aggregate label.
- Zero-percent partial results for `api-design` and `frontend-patterns` are not clean bills of health.

## Re-scan command

```bash
uv run --python 3.13 \
  --with 'git+https://github.com/NVIDIA/skillspector.git@f9bb13dd1667eb4e7ac97b8ebace3160041ed571' \
  python -c 'from skillspector.cli_entry import app; app()' \
  scan /absolute/path/to/skill --no-llm --format json --output report.json
```

Review scanner updates before changing the pinned commit. Do not downgrade or suppress findings merely to make a gate green.
