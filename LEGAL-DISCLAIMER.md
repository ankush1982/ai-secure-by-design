# Legal Disclaimer

This plugin and the code it generates are provided **as-is, without warranty of any kind**, under the Apache-2.0 license.

## Not legal advice

Nothing produced by this plugin — including but not limited to scaffolded code, the `privacy-security-manifest.yaml`, regime catalog YAML files, AI assistant outputs, or any documentation in this repository — constitutes **legal advice, compliance certification, or assurance of regulatory conformity**.

## Not certification

Use of this plugin does **not** make your product:

- Compliant with the **India Digital Personal Data Protection Act, 2023** or any rules made thereunder.
- Certified to **ISO/IEC 27001:2022** or any ISO/IEC management-system standard.
- Aligned with the **NIST Secure Software Development Framework (SP 800-218)** as attested by any third party.
- Compliant with **HIPAA**, **GDPR**, **EU AI Act**, **ISO/IEC 42001**, or any other regime not explicitly named above.
- Compliant with the **Telemedicine Practice Guidelines, 2020** (India) or any other sector-specific regulation.

Compliance and certification require independent legal review, organizational policies, operational controls, vendor management, audits, and many other elements that are out of scope for any developer tool.

## Scaffolds are starting points

All generated code is an **opinionated starting point**. You must:

1. Review every generated file for fit with your specific business logic, data flows, and risk profile.
2. Adapt the code to your actual data model, authentication system, deployment topology, and regulatory obligations.
3. Have your scaffolded controls (consent flows, DSR endpoints, retention policies, AI decision logs, etc.) reviewed by **qualified legal counsel** before relying on them in production for regulated data.
4. Conduct independent **security testing** (SAST, DAST, penetration testing) before any production deployment.

## Regime interpretations are the author's

The regime catalog YAML files (`regimes/*.yaml`) reflect the author's good-faith interpretation of public standards and statutes as of the version date. They are **not** authoritative interpretations.

Standards and laws change. The DPDP Act 2023 rules are still being finalized at time of v0.1. NIST SSDF has revision cycles. ISO 27001:2022 may be superseded. You are responsible for verifying current applicability.

## Healthcare and AI use

This plugin includes a `healthcare-ai` skill and PHI-redaction scaffold intended for AI products that touch clinical data. Such products may be subject to additional regulation (in India: Telemedicine Practice Guidelines 2020, CDSCO medical-device rules, draft DISHA, and others). The plugin does **not** address those regimes. Engage a healthcare-regulatory specialist before deploying any AI product that influences clinical decisions.

## No liability

In no event shall the authors or contributors be liable for any claim, damages, or other liability arising from use of this plugin or the code it generates. See LICENSE for the full disclaimer.

## Contact

For licensing questions: open an issue at the project repository.
