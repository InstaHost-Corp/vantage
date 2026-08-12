# Vantage

## Continuous Compliance Baselining and Readiness

Vantage is an open-source compliance readiness and baselining platform that
helps organisations understand their current security posture, map controls to
common compliance frameworks, identify gaps, and prepare for enterprise
governance solutions such as Microsoft Purview.

> **Independent personal project.**
>
> Vantage is created and maintained by Patrick Hamid. Vantage is not endorsed
> by, sponsored by, affiliated with, or supported by Microsoft. Nothing in this
> project constitutes Microsoft support, a warranty, or a commitment. See the
> [Project Notice](PROJECT_NOTICE.md).

## Purpose

Most organisations know they need compliance frameworks such as ISO 27001,
SOC 2, NIST CSF, PCI DSS or HIPAA, but determining their current state is often
difficult.

Vantage exists to help organisations:

- Establish a compliance baseline
- Understand control requirements
- Identify implementation gaps
- Collect supporting evidence
- Model remediation activities
- Prepare for audits and assurance engagements
- Prepare for adoption of enterprise governance and compliance platforms

The platform evaluates configuration records supplied to it and translates
those findings into framework-aligned readiness indicators. The current
repository uses a fictional, seeded SQLite dataset and simulated connector
records. It does not connect to Microsoft 365, Microsoft Purview, Azure, AWS or
other live customer environments.

The intent is not to replace formal governance, compliance, risk management,
auditing, certification or assurance platforms. Instead, Vantage helps teams
ask:

> Where are we today, and what do we need to improve before formal compliance
> activities begin?

## Relationship to Microsoft Purview

Vantage is not a replacement for Microsoft Purview.

Microsoft Purview provides enterprise capabilities including:

- Data governance
- Information protection
- Data classification
- Data Loss Prevention
- eDiscovery
- Records management
- Insider risk management
- Compliance management
- Enterprise-scale risk and regulatory controls

Vantage focuses on a narrower problem:

> Readiness, baselining and operational validation.

It helps teams explore whether expected controls are represented, identify
gaps, track example remediation activities, and organise supporting evidence
before evaluating or expanding enterprise governance solutions.

Vantage can be used as:

- A compliance learning environment
- A governance proof-of-concept platform
- A readiness assessment workspace
- A control-mapping reference implementation
- A training environment for security and compliance teams
- A pre-governance readiness accelerator

Vantage is designed to complement governance programmes, not replace them. It
does not import Purview templates, ingest Purview or Microsoft security signals,
implement Microsoft-managed or shared controls, or reproduce Microsoft
Compliance Score.

## What makes Vantage different

Vantage is intentionally focused on continuous operational readiness rather
than certification. It explores questions such as:

- Are controls represented as expected?
- Which frameworks are affected when a control fails?
- What evidence supports a control?
- What remediation activities are outstanding?
- Which requirements are currently at risk?
- Is the model moving closer to audit readiness?

The platform evaluates the configuration data available to it and provides an
operational view of the resulting readiness model.

Readiness indicators are intended for internal improvement activities and
should not be interpreted as:

- Compliance certification
- Audit opinions
- Statements of conformity
- Regulatory attestations
- Independent assurance

Formal compliance assessments should be conducted by appropriately qualified
third parties.

## Compliance digital twin

One way to think about Vantage is as a **compliance digital twin**: a model of
an organisation's controls, evidence, policies, assets and governance
activities.

Teams can use the sandbox to:

- Experiment with compliance frameworks
- Understand control relationships
- Test remediation workflows
- Evaluate governance processes
- Demonstrate readiness improvements
- Develop governance practices before production implementation

This can help teams build maturity before investing in larger governance and
compliance programmes.

## Educational and reference implementation

Vantage is also an educational and engineering project. The repository
demonstrates:

- Framework-to-control mapping
- Control inheritance models
- Continuous control validation
- Compliance evidence management
- Risk tracking concepts
- Trust Centre workflows
- Security questionnaire drafting
- Readiness scoring methodologies

It serves as a practical reference implementation for architects, engineers,
compliance practitioners, students and organisations exploring governance and
compliance automation.

## Scope and limitations

Vantage provides:

- Control baselining
- Gap identification
- Readiness tracking
- Evidence organisation
- Simulated remediation workflows
- Framework mapping
- Compliance learning and education

Vantage does not provide:

- Regulatory certification
- Audit opinions
- Independent assurance
- Legal advice
- Governance programme accreditation
- Enterprise data governance capabilities
- Data classification or labelling services
- Data Loss Prevention
- eDiscovery capabilities
- Insider risk management

Organisations requiring those capabilities should use dedicated governance and
compliance solutions such as Microsoft Purview and related enterprise
platforms.

## Philosophy

Vantage was built around a simple principle:

> Continuous compliance begins with understanding your baseline.

Before an organisation can pursue certification, implement governance tooling
or undergo formal audits, it must first understand:

- Which controls exist
- Which controls are missing
- Which controls are failing
- Why they are failing
- What evidence supports them

Vantage helps explore those questions through continuous assessment and
operational visibility.

## Run locally

```sh
git clone https://github.com/phamid/vantage.git
cd vantage
npm run setup
npm start
```

Open `http://localhost:4173`. Run the test suites with:

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
node scripts/verify-invariants.mjs
```

The server runs on Node 24+ with no runtime package dependencies. The frontend
uses React, React Router, Tailwind CSS and Vite. The SQLite database is created
and seeded automatically on first boot.

The seeded accounts use a published password and protect only fictional local
data. Change the passwords in `server/seed.js` and add appropriate identity
controls before putting an instance on a network or using non-fictional data.

## Capability map

| Area | Capability |
| --- | --- |
| Frameworks | Seven educational framework baselines mapped to a shared control set |
| Controls | Owned controls linked to requirements and validation tests |
| Monitoring | Data-driven tests over resource, device, personnel, policy, vendor and risk records |
| Remediation | Simulated target-state changes and example task deadlines |
| Policies | Versioned policy records with review and acceptance workflows |
| Personnel and devices | Fictional roster, training and endpoint posture records |
| Vendors and risk | Third-party inventory, risk scoring and treatment tracking |
| Engagement preparation | Evidence requests, supporting evidence and assurance-engagement workflows |
| Questionnaires | Draft answers from fictional controls and policies, with human-review flags |
| Trust Centre | A sandbox security profile generated from fictional monitoring data |
| Integrations | Simulated connector records; no external API calls |

## Architecture

```text
server/
  db.js               SQLite schema and helpers
  engine.js           Rule evaluation and readiness calculations
  seed-frameworks.js  Frameworks, requirements, controls and tests
  seed.js             Fictional people, devices, resources, vendors and risks
  index.js            REST API, authentication, actions and static hosting
web/
  src/                React application
  dist/               Committed production build
```

Tests are data-driven. Each test identifies a population and a condition:

```jsonc
{ "kind": "resource", "type": "aws_s3_bucket", "field": "encryption_enabled", "op": "eq", "value": true }
{ "kind": "device", "field": "encrypted", "op": "eq", "value": 1 }
{ "kind": "personnel", "field": "security_training", "op": "eq", "value": "complete" }
```

Results roll up through the model:

```text
entity result -> test status -> control status -> requirement status -> framework readiness
```

The readiness indicator is control-weighted. It is an internal model for
finding and tracking gaps, not a certification result, audit opinion or
statement of conformity.

## Contributing and provenance

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. All
contributions must have a clear, authorised origin and must not contain
Microsoft, employer, customer or other third-party confidential information.

See [PROVENANCE.md](PROVENANCE.md) for the public source boundaries. Detailed
employment, ownership and resource-separation evidence is retained privately.

## Security

Report vulnerabilities through the private channels in
[SECURITY.md](SECURITY.md). Do not submit confidential information, customer
data, credentials or tenant identifiers in public issues.

## Licence

MIT - see [LICENSE](LICENSE).
