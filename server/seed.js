import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, run, get, all, setSetting } from './db.js';
import { frameworks, requirements, controls, tests } from './seed-frameworks.js';
import { runTests } from './engine.js';

// Salted scrypt with a constant-time comparison. Stored as scrypt$<salt>$<hash>.
const SCRYPT_KEYLEN = 32;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = scryptSync(String(password), salt, SCRYPT_KEYLEN);
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== actual.length) return false;
  return timingSafeEqual(actual, expectedBuffer);
}

const DAY = 86400000;
const now = Date.now();
const iso = (offsetDays = 0) => new Date(now + offsetDays * DAY).toISOString();
const date = (offsetDays = 0) => iso(offsetDays).slice(0, 10);

const COMPANY = 'Northwind Systems, Inc.';

const users = [
  ['ada@northwind.io', 'Ada Whitfield', 'admin', 'Chief Technology Officer'],
  ['marcus@northwind.io', 'Marcus Bell', 'admin', 'Head of Security'],
  ['priya@northwind.io', 'Priya Raman', 'contributor', 'Staff Platform Engineer'],
  ['sofia@northwind.io', 'Sofia Marchetti', 'contributor', 'People Operations Lead'],
  ['dan@northwind.io', 'Dan Okoye', 'contributor', 'General Counsel'],
  ['auditor@keeling-cpa.com', 'Helen Keeling', 'auditor', 'Lead Auditor, Keeling & Co CPA'],
];

const people = [
  ['Ada Whitfield', 'ada@northwind.io', 'Chief Technology Officer', 'Engineering', 'employee', -1290],
  ['Marcus Bell', 'marcus@northwind.io', 'Head of Security', 'Security', 'employee', -880],
  ['Priya Raman', 'priya@northwind.io', 'Staff Platform Engineer', 'Engineering', 'employee', -740],
  ['Sofia Marchetti', 'sofia@northwind.io', 'People Operations Lead', 'People', 'employee', -610],
  ['Dan Okoye', 'dan@northwind.io', 'General Counsel', 'Legal', 'employee', -540],
  ['Yusuf Karim', 'yusuf@northwind.io', 'Senior Backend Engineer', 'Engineering', 'employee', -520],
  ['Elena Petrova', 'elena@northwind.io', 'Site Reliability Engineer', 'Engineering', 'employee', -455],
  ['Tom Nguyen', 'tom@northwind.io', 'Data Engineer', 'Engineering', 'employee', -400],
  ['Grace Liu', 'grace@northwind.io', 'Product Designer', 'Product', 'employee', -365],
  ['Ben Carter', 'ben@northwind.io', 'Account Executive', 'Sales', 'employee', -330],
  ['Mia Andersson', 'mia@northwind.io', 'Customer Success Manager', 'Customer Success', 'employee', -300],
  ['Rafael Duarte', 'rafael@northwind.io', 'Security Engineer', 'Security', 'employee', -260],
  ['Chloe Dubois', 'chloe@northwind.io', 'Frontend Engineer', 'Engineering', 'employee', -210],
  ['Hassan Malik', 'hassan@northwind.io', 'Solutions Architect', 'Sales', 'employee', -180],
  ['Nora Fitzgerald', 'nora@northwind.io', 'Finance Manager', 'Finance', 'employee', -150],
  ['Kenji Sato', 'kenji@northwind.io', 'Machine Learning Engineer', 'Engineering', 'employee', -120],
  ['Amara Diallo', 'amara@northwind.io', 'Support Engineer', 'Customer Success', 'employee', -95],
  ['Leo Brandt', 'leo@northwind.io', 'QA Engineer', 'Engineering', 'contractor', -70],
  ['Isabel Rojas', 'isabel@northwind.io', 'Technical Writer', 'Product', 'contractor', -44],
  ['Owen Walsh', 'owen@northwind.io', 'Junior Platform Engineer', 'Engineering', 'employee', -18],
  ['Sara Lindqvist', 'sara@northwind.io', 'Growth Marketer', 'Marketing', 'employee', -9],
];

const offboarded = [
  ['Victor Hale', 'victor@northwind.io', 'Sales Engineer', 'Sales', -700, -12, 1],
  ['Rebecca Stone', 'rebecca@northwind.io', 'Backend Engineer', 'Engineering', -820, -3, 0],
  ['Alan Pierce', 'alan@northwind.io', 'Recruiter', 'People', -560, -95, 1],
];

const integrations = [
  ['aws', 'Amazon Web Services', 'Cloud infrastructure', 'Continuously inventories IAM, S3, EC2, RDS, VPC, KMS and CloudTrail configuration.', 'connected', 'northwind-prod (4471-8820-1123)'],
  ['github', 'GitHub', 'Version control', 'Monitors repository protection rules, code scanning, secret scanning and organisation membership.', 'connected', 'northwind-systems'],
  ['okta', 'Okta', 'Identity provider', 'Syncs users, group membership, MFA factors, sign-on policies and application assignments.', 'connected', 'northwind.okta.com'],
  ['mdm', 'Kandji MDM', 'Device management', 'Reports endpoint encryption, screen lock, OS version and agent health.', 'connected', 'Northwind (312 seats)'],
  ['hris', 'Rippling', 'HR information system', 'Source of truth for personnel, employment status, start and end dates.', 'connected', 'Northwind Systems'],
  ['gcp', 'Google Cloud Platform', 'Cloud infrastructure', 'Inventories projects, IAM bindings, buckets and Cloud SQL instances.', 'available', null],
  ['azure', 'Microsoft Azure', 'Cloud infrastructure', 'Inventories subscriptions, storage accounts, network security groups and Entra ID.', 'available', null],
  ['gworkspace', 'Google Workspace', 'Productivity', 'Monitors user accounts, 2-step verification and admin roles.', 'connected', 'northwind.io'],
  ['datadog', 'Datadog', 'Monitoring', 'Verifies monitors, alert routing and log retention configuration.', 'connected', 'northwind'],
  ['pagerduty', 'PagerDuty', 'Incident response', 'Verifies on-call schedules and escalation policies exist for production services.', 'connected', 'northwind'],
  ['jira', 'Jira', 'Ticketing', 'Links change tickets and remediation tasks to controls.', 'connected', 'northwind.atlassian.net'],
  ['snyk', 'Snyk', 'Vulnerability management', 'Imports dependency and container vulnerability findings with SLA tracking.', 'available', null],
  ['cloudflare', 'Cloudflare', 'Network & CDN', 'Checks WAF, TLS configuration and DDoS protection settings.', 'available', null],
  ['vantage-agent', 'Vantage Agent', 'Endpoint agent', 'Lightweight agent reporting endpoint posture for unmanaged and BYOD machines.', 'connected', '19 installs'],
  ['slack', 'Slack', 'Collaboration', 'Delivers control failure alerts and policy acceptance reminders.', 'connected', 'northwind.slack.com'],
  ['1password', '1Password', 'Secrets management', 'Verifies vault membership, master password policy and shared item hygiene.', 'available', null],
  ['stripe', 'Stripe', 'Payments', 'Monitors API key hygiene and account access for the payments environment.', 'available', null],
  ['bamboohr', 'BambooHR', 'HR information system', 'Alternative HRIS source for personnel records.', 'available', null],
  ['linear', 'Linear', 'Ticketing', 'Links product change records to change management controls.', 'available', null],
  ['vercel', 'Vercel', 'Hosting', 'Checks project environment variable scoping and team membership.', 'available', null],
];

const R = (integration, type, external_id, name, region, owner, metadata) =>
  ({ integration, type, external_id, name, region, owner, metadata });

const resources = [
  // IAM
  R('aws', 'aws_iam_user', 'AIDA1001', 'svc-terraform-deploy', 'global', 'Platform', { mfa_enabled: false, access_key_age_days: 41, admin_reviewed: true, days_since_last_use: 1, console_access: false }),
  R('aws', 'aws_iam_user', 'AIDA1002', 'ada.whitfield', 'global', 'Engineering', { mfa_enabled: true, access_key_age_days: 12, admin_reviewed: true, days_since_last_use: 2 }),
  R('aws', 'aws_iam_user', 'AIDA1003', 'marcus.bell', 'global', 'Security', { mfa_enabled: true, access_key_age_days: 30, admin_reviewed: true, days_since_last_use: 1 }),
  R('aws', 'aws_iam_user', 'AIDA1004', 'priya.raman', 'global', 'Engineering', { mfa_enabled: true, access_key_age_days: 143, admin_reviewed: true, days_since_last_use: 3 }),
  R('aws', 'aws_iam_user', 'AIDA1005', 'elena.petrova', 'global', 'Engineering', { mfa_enabled: true, access_key_age_days: 22, admin_reviewed: true, days_since_last_use: 1 }),
  R('aws', 'aws_iam_user', 'AIDA1006', 'svc-backup-runner', 'global', 'Platform', { mfa_enabled: true, access_key_age_days: 61, admin_reviewed: true, days_since_last_use: 1, console_access: false }),
  R('aws', 'aws_iam_user', 'AIDA1007', 'tom.nguyen', 'global', 'Engineering', { mfa_enabled: true, access_key_age_days: 8, admin_reviewed: true, days_since_last_use: 4 }),
  R('aws', 'aws_iam_user', 'AIDA1008', 'legacy-etl-user', 'global', 'Data', { mfa_enabled: false, access_key_age_days: 402, admin_reviewed: true, days_since_last_use: 9 }),
  R('aws', 'aws_iam_user', 'AIDA1009', 'rafael.duarte', 'global', 'Security', { mfa_enabled: true, access_key_age_days: 17, admin_reviewed: true, days_since_last_use: 1 }),
  // S3
  R('aws', 'aws_s3_bucket', 'northwind-prod-customer-data', 'northwind-prod-customer-data', 'us-east-1', 'Platform', { encryption_enabled: true, public_access_blocked: true, versioning: true, logging: true }),
  R('aws', 'aws_s3_bucket', 'northwind-prod-uploads', 'northwind-prod-uploads', 'us-east-1', 'Platform', { encryption_enabled: true, public_access_blocked: true, versioning: true, logging: true }),
  R('aws', 'aws_s3_bucket', 'northwind-prod-backups', 'northwind-prod-backups', 'us-west-2', 'Platform', { encryption_enabled: true, public_access_blocked: true, versioning: true, logging: true }),
  R('aws', 'aws_s3_bucket', 'northwind-analytics-lake', 'northwind-analytics-lake', 'us-east-1', 'Data', { encryption_enabled: false, public_access_blocked: true, versioning: true, logging: true }),
  R('aws', 'aws_s3_bucket', 'northwind-marketing-assets', 'northwind-marketing-assets', 'us-east-1', 'Marketing', { encryption_enabled: true, public_access_blocked: false, versioning: true, logging: true }),
  R('aws', 'aws_s3_bucket', 'northwind-terraform-state', 'northwind-terraform-state', 'us-east-1', 'Platform', { encryption_enabled: true, public_access_blocked: true, versioning: true, logging: true }),
  R('aws', 'aws_s3_bucket', 'northwind-audit-logs', 'northwind-audit-logs', 'us-east-1', 'Security', { encryption_enabled: true, public_access_blocked: true, versioning: true, logging: true }),
  R('aws', 'aws_s3_bucket', 'northwind-staging-scratch', 'northwind-staging-scratch', 'us-east-2', 'Engineering', { encryption_enabled: true, public_access_blocked: true, versioning: true, logging: true }),
  // EC2
  R('aws', 'aws_ec2_instance', 'i-0a91f2', 'prod-api-1', 'us-east-1a', 'Platform', { ebs_encrypted: true, imdsv2_required: true, public_ip: false }),
  R('aws', 'aws_ec2_instance', 'i-0b32c7', 'prod-api-2', 'us-east-1b', 'Platform', { ebs_encrypted: true, imdsv2_required: true, public_ip: false }),
  R('aws', 'aws_ec2_instance', 'i-0c88d1', 'prod-worker-1', 'us-east-1a', 'Platform', { ebs_encrypted: true, imdsv2_required: true, public_ip: false }),
  R('aws', 'aws_ec2_instance', 'i-0d19e4', 'prod-bastion', 'us-east-1a', 'Security', { ebs_encrypted: true, imdsv2_required: true, public_ip: false }),
  R('aws', 'aws_ec2_instance', 'i-0e77b8', 'staging-api-1', 'us-east-2a', 'Engineering', { ebs_encrypted: true, imdsv2_required: true, public_ip: false }),
  R('aws', 'aws_ec2_instance', 'i-0f45a2', 'build-runner-1', 'us-east-1c', 'Engineering', { ebs_encrypted: true, imdsv2_required: true, public_ip: false }),
  // RDS
  R('aws', 'aws_rds_instance', 'northwind-prod-pg', 'northwind-prod-pg', 'us-east-1', 'Platform', { encrypted: true, backup_retention_days: 30, publicly_accessible: false, multi_az: true }),
  R('aws', 'aws_rds_instance', 'northwind-prod-standby', 'northwind-prod-standby', 'us-west-2', 'Platform', { encrypted: true, backup_retention_days: 14, publicly_accessible: false, multi_az: true }),
  R('aws', 'aws_rds_instance', 'northwind-analytics-pg', 'northwind-analytics-pg', 'us-east-1', 'Data', { encrypted: true, backup_retention_days: 3, publicly_accessible: false, multi_az: true }),
  R('aws', 'aws_rds_instance', 'northwind-staging-pg', 'northwind-staging-pg', 'us-east-2', 'Engineering', { encrypted: true, backup_retention_days: 7, publicly_accessible: false, multi_az: true }),
  // Network
  R('aws', 'aws_security_group', 'sg-0011', 'prod-alb-sg', 'us-east-1', 'Platform', { admin_ports_open_to_world: false }),
  R('aws', 'aws_security_group', 'sg-0012', 'prod-app-sg', 'us-east-1', 'Platform', { admin_ports_open_to_world: false }),
  R('aws', 'aws_security_group', 'sg-0013', 'prod-db-sg', 'us-east-1', 'Platform', { admin_ports_open_to_world: false }),
  R('aws', 'aws_security_group', 'sg-0014', 'bastion-sg', 'us-east-1', 'Security', { admin_ports_open_to_world: false }),
  R('aws', 'aws_security_group', 'sg-0015', 'staging-app-sg', 'us-east-2', 'Engineering', { admin_ports_open_to_world: false }),
  R('aws', 'aws_security_group', 'sg-0016', 'build-runner-sg', 'us-east-1', 'Engineering', { admin_ports_open_to_world: false }),
  R('aws', 'aws_vpc', 'vpc-prod-01', 'northwind-prod-vpc', 'us-east-1', 'Platform', { flow_logs_enabled: true }),
  R('aws', 'aws_vpc', 'vpc-stage-01', 'northwind-staging-vpc', 'us-east-2', 'Engineering', { flow_logs_enabled: true }),
  // Logging & keys
  R('aws', 'aws_cloudtrail', 'northwind-org-trail', 'northwind-org-trail', 'us-east-1', 'Security', { multi_region: true, log_file_validation: true }),
  R('aws', 'aws_log_group', '/aws/api/prod', '/aws/api/prod', 'us-east-1', 'Platform', { retention_days: 365 }),
  R('aws', 'aws_log_group', '/aws/worker/prod', '/aws/worker/prod', 'us-east-1', 'Platform', { retention_days: 365 }),
  R('aws', 'aws_log_group', '/aws/vpc/flowlogs', '/aws/vpc/flowlogs', 'us-east-1', 'Security', { retention_days: 365 }),
  R('aws', 'aws_log_group', '/aws/lambda/notifications', '/aws/lambda/notifications', 'us-east-1', 'Platform', { retention_days: 365 }),
  R('aws', 'aws_kms_key', 'key-rds-prod', 'rds-prod-cmk', 'us-east-1', 'Platform', { rotation_enabled: true }),
  R('aws', 'aws_kms_key', 'key-s3-prod', 's3-prod-cmk', 'us-east-1', 'Platform', { rotation_enabled: true }),
  R('aws', 'aws_kms_key', 'key-analytics', 'analytics-cmk', 'us-east-1', 'Data', { rotation_enabled: true }),
  // GitHub repositories
  R('github', 'github_repo', 'northwind/api', 'northwind/api', null, 'Engineering', { branch_protection: true, required_reviewers: 2, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  R('github', 'github_repo', 'northwind/web', 'northwind/web', null, 'Engineering', { branch_protection: true, required_reviewers: 1, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  R('github', 'github_repo', 'northwind/infra', 'northwind/infra', null, 'Platform', { branch_protection: true, required_reviewers: 2, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  R('github', 'github_repo', 'northwind/data-pipelines', 'northwind/data-pipelines', null, 'Data', { branch_protection: false, required_reviewers: 1, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  R('github', 'github_repo', 'northwind/mobile', 'northwind/mobile', null, 'Engineering', { branch_protection: true, required_reviewers: 1, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  R('github', 'github_repo', 'northwind/docs', 'northwind/docs', null, 'Product', { branch_protection: true, required_reviewers: 1, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'public' }),
  R('github', 'github_repo', 'northwind/ml-models', 'northwind/ml-models', null, 'Engineering', { branch_protection: true, required_reviewers: 1, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  R('github', 'github_repo', 'northwind/terraform-modules', 'northwind/terraform-modules', null, 'Platform', { branch_protection: true, required_reviewers: 2, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  R('github', 'github_repo', 'northwind/sdk-js', 'northwind/sdk-js', null, 'Engineering', { branch_protection: true, required_reviewers: 1, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'public' }),
  R('github', 'github_repo', 'northwind/internal-tools', 'northwind/internal-tools', null, 'Engineering', { branch_protection: true, required_reviewers: 1, secret_scanning: true, dependabot: true, code_scanning: true, visibility: 'private' }),
  // Identity provider policy & SaaS apps
  R('okta', 'idp_policy', 'default-password-policy', 'Default password policy', null, 'Security', { meets_standard: true, min_length: 14, lockout_attempts: 5 }),
  R('okta', 'saas_app', 'app-salesforce', 'Salesforce', null, 'Sales', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-hubspot', 'HubSpot', null, 'Marketing', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-notion', 'Notion', null, 'Operations', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-figma', 'Figma', null, 'Product', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-datadog', 'Datadog', null, 'Engineering', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-jira', 'Jira', null, 'Engineering', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-github', 'GitHub', null, 'Engineering', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-aws', 'AWS SSO', null, 'Platform', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-mixpanel', 'Mixpanel', null, 'Product', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-canva', 'Canva', null, 'Marketing', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-zoom', 'Zoom', null, 'Operations', { sso_enabled: true }),
  R('okta', 'saas_app', 'app-1password', '1Password', null, 'Security', { sso_enabled: true }),
];

const policyDefs = [
  ['information-security-policy', 'Information Security Policy', 'Security', 'Sets out how Northwind protects the confidentiality, integrity and availability of information.', 'approved', -120],
  ['acceptable-use-policy', 'Acceptable Use Policy', 'Security', 'Defines acceptable use of company systems, networks, devices and data.', 'approved', -120],
  ['access-control-policy', 'Access Control Policy', 'Security', 'Governs provisioning, review and revocation of access to systems and data.', 'approved', -118],
  ['password-policy', 'Password and Authentication Policy', 'Security', 'Sets password composition, storage, rotation and multi-factor requirements.', 'approved', -118],
  ['asset-management-policy', 'Asset Management Policy', 'Operations', 'Covers inventory, ownership, handling and disposal of company assets.', 'approved', -210],
  ['data-classification-policy', 'Data Classification and Handling Policy', 'Data', 'Defines classification levels and required handling for each level.', 'approved', -95],
  ['data-retention-policy', 'Data Retention and Disposal Policy', 'Data', 'Specifies retention periods and secure disposal methods by data type.', 'approved', -95],
  ['encryption-policy', 'Cryptography and Encryption Policy', 'Security', 'Defines approved algorithms, key management and encryption requirements.', 'approved', -140],
  ['change-management-policy', 'Change Management Policy', 'Engineering', 'Describes how changes are proposed, reviewed, tested, approved and released.', 'approved', -88],
  ['secure-development-policy', 'Secure Software Development Policy', 'Engineering', 'Sets secure coding, review, testing and dependency management requirements.', 'approved', -88],
  ['vulnerability-management-policy', 'Vulnerability Management Policy', 'Security', 'Defines scanning cadence, severity ratings and remediation SLAs.', 'approved', -150],
  ['incident-response-plan', 'Incident Response Plan', 'Security', 'Defines severity levels, roles, escalation paths and communication for security incidents.', 'approved', -60],
  ['business-continuity-plan', 'Business Continuity and Disaster Recovery Plan', 'Operations', 'Documents recovery objectives, dependencies, failover and testing schedule.', 'draft', null],
  ['backup-policy', 'Backup Policy', 'Operations', 'Specifies backup scope, frequency, encryption, retention and restoration testing.', 'approved', -200],
  ['vendor-management-policy', 'Third-Party and Vendor Management Policy', 'Operations', 'Covers due diligence, contractual requirements and ongoing vendor monitoring.', 'approved', -175],
  ['risk-management-policy', 'Risk Management Policy', 'Governance', 'Defines the risk assessment methodology, scoring, appetite and treatment process.', 'approved', -175],
  ['code-of-conduct', 'Code of Conduct', 'Governance', 'Establishes ethical expectations and reporting channels for all personnel.', 'approved', -300],
  ['privacy-policy', 'Privacy Policy', 'Privacy', 'Describes personal data collected, purposes, legal bases, sharing and data subject rights.', 'approved', -110],
  ['physical-security-policy', 'Physical Security Policy', 'Operations', 'Covers office access, visitor management, clear desk and equipment security.', 'approved', -320],
  ['remote-work-policy', 'Remote Work Policy', 'People', 'Sets security expectations for personnel working outside company premises.', 'approved', -260],
  ['ai-usage-policy', 'Responsible AI Usage Policy', 'AI Governance', 'Governs approved AI tools, permitted data, human oversight and model evaluation.', 'approved', -35],
  ['sdlc-access-review-policy', 'Access Review Procedure', 'Security', 'Describes how quarterly user access reviews are scoped, executed and evidenced.', 'approved', -75],
];

const policyBody = (name, description, category) => `# ${name}

**Owner:** Head of Security · **Classification:** Internal · **Applies to:** all personnel, contractors and systems of ${COMPANY}

## 1. Purpose
${description} This policy establishes the requirements that ${COMPANY} follows to meet its security, contractual and regulatory obligations.

## 2. Scope
This policy applies to all employees, contractors and third parties who access ${COMPANY} information systems, and to all production and corporate environments that store or process company or customer data.

## 3. Policy statements
1. Requirements defined in this policy are mandatory and are enforced through automated monitoring in Vantage where technically possible.
2. Systems in scope are inventoried and assigned an accountable owner within the ${category} function.
3. Exceptions must be requested in writing, include a compensating control and an expiry date, and be approved by the Head of Security.
4. Controls supporting this policy are tested continuously; failures generate a remediation task with a severity-based due date.
5. Personnel must report suspected violations to security@northwind.io or via the #security Slack channel.

## 4. Roles and responsibilities
| Role | Responsibility |
| --- | --- |
| Head of Security | Owns this policy, approves exceptions and reports compliance to management |
| System owners | Implement and evidence the controls for systems they own |
| All personnel | Follow this policy and complete related training annually |

## 5. Enforcement
Violations may result in disciplinary action up to and including termination of employment or contract, and where applicable, referral to law enforcement.

## 6. Review
This policy is reviewed at least annually, and after any material change to the business, its systems or the regulatory landscape.`;

const vendors = [
  ['Amazon Web Services', 'aws.amazon.com', 'Cloud infrastructure', 'Primary hosting provider for all production workloads.', 'high', 'Customer data, PII', 1, 'complete', 1, 1, -70, 295000],
  ['Datadog', 'datadoghq.com', 'Observability', 'Infrastructure and application monitoring, log aggregation.', 'medium', 'Logs, metadata', 1, 'complete', 1, 1, -120, 64000],
  ['GitHub', 'github.com', 'Development', 'Source control, code review and CI workflows.', 'high', 'Source code', 0, 'complete', 1, 1, -95, 28000],
  ['Okta', 'okta.com', 'Identity', 'Workforce identity provider and single sign-on.', 'high', 'Employee PII', 0, 'complete', 1, 1, -60, 41000],
  ['Stripe', 'stripe.com', 'Payments', 'Payment processing and subscription billing.', 'high', 'Payment data', 1, 'complete', 1, 1, -140, 0],
  ['Rippling', 'rippling.com', 'HR', 'HR information system and payroll.', 'medium', 'Employee PII', 0, 'complete', 1, 0, -180, 52000],
  ['Slack', 'slack.com', 'Collaboration', 'Internal messaging and alert routing.', 'medium', 'Internal communications', 0, 'complete', 1, 1, -220, 33000],
  ['Notion', 'notion.so', 'Productivity', 'Internal documentation and runbooks.', 'medium', 'Internal documents', 0, 'in_progress', 1, 0, -140, 18000],
  ['Kandji', 'kandji.io', 'Device management', 'Apple device management and endpoint policy enforcement.', 'medium', 'Device inventory', 0, 'complete', 1, 0, -150, 24000],
  ['Salesforce', 'salesforce.com', 'CRM', 'Customer relationship management for the sales team.', 'medium', 'Customer contact data', 1, 'complete', 1, 1, -190, 76000],
  ['HubSpot', 'hubspot.com', 'Marketing', 'Marketing automation and lead capture.', 'low', 'Marketing contact data', 1, 'complete', 1, 0, -230, 21000],
  ['Mixpanel', 'mixpanel.com', 'Analytics', 'Product usage analytics.', 'medium', 'Pseudonymised usage data', 1, 'not_started', 1, 0, -60, 15000],
  ['Canva', 'canva.com', 'Design', 'Marketing design assets.', 'low', 'Marketing assets', 0, 'not_started', 0, 0, -45, 3000],
  ['Anthropic', 'anthropic.com', 'AI provider', 'Large language model API used for in-product summarisation.', 'high', 'Customer content (transient)', 1, 'complete', 1, 1, -25, 88000],
  ['Cloudflare', 'cloudflare.com', 'Network', 'CDN, WAF and DDoS protection for public endpoints.', 'medium', 'Request metadata', 1, 'complete', 1, 1, -100, 36000],
  ['Zoom', 'zoom.us', 'Collaboration', 'Video conferencing for internal and customer meetings.', 'low', 'Meeting recordings', 0, 'complete', 1, 1, -280, 12000],
];

const risks = [
  ['R-001', 'Loss of availability of the production platform', 'A regional outage or failed deployment renders the platform unavailable to customers beyond the contractual SLA.', 'Availability', 3, 5, 'mitigate', 2, 4, 'open', 22, 'Multi-AZ deployment, automated failover runbook, quarterly recovery test.'],
  ['R-002', 'Unauthorised access to customer data', 'An attacker obtains valid credentials and accesses customer records in production.', 'Confidentiality', 3, 5, 'mitigate', 2, 4, 'open', 30, 'MFA everywhere, least privilege IAM, quarterly access reviews, anomaly alerting.'],
  ['R-003', 'Leaked secret in source code', 'A credential is committed to a repository and harvested by an automated scanner.', 'Confidentiality', 3, 4, 'mitigate', 2, 3, 'open', -6, 'Secret scanning with push protection on all repositories and automatic rotation runbook.'],
  ['R-004', 'Third-party sub-processor breach', 'A vendor processing customer data suffers a breach that exposes Northwind data.', 'Third Party', 3, 4, 'mitigate', 2, 3, 'open', 55, 'Annual vendor reviews, contractual security terms, data minimisation with sub-processors.'],
  ['R-005', 'Ransomware on corporate endpoints', 'Malware encrypts endpoint or shared storage and disrupts business operations.', 'Availability', 2, 4, 'mitigate', 1, 3, 'open', 90, 'Managed endpoint protection, disk encryption, immutable backups and user training.'],
  ['R-006', 'Insider misuse of privileged access', 'A privileged user intentionally or accidentally exfiltrates or destroys data.', 'Confidentiality', 2, 5, 'mitigate', 1, 4, 'open', 120, 'Privileged access register, audit logging, alerting on bulk export, segregation of duties.'],
  ['R-007', 'Non-compliance with GDPR data subject rights', 'A data subject request is not fulfilled within the statutory one-month window.', 'Compliance', 2, 3, 'mitigate', 1, 3, 'open', 40, 'Documented DSR workflow with SLA tracking and a named privacy owner.'],
  ['R-008', 'Vulnerable third-party dependency exploited', 'A known vulnerability in an open-source dependency is exploited in production.', 'Confidentiality', 3, 4, 'mitigate', 2, 3, 'open', 8, 'Dependabot on all repositories, severity-based patch SLAs, container base image rebuilds.'],
  ['R-009', 'Key personnel dependency', 'Loss of a single engineer creates a knowledge gap that delays incident recovery.', 'Operational', 3, 3, 'mitigate', 2, 2, 'open', 150, 'Runbooks for all production services, on-call rotation of at least four engineers.'],
  ['R-010', 'Misconfigured cloud storage exposes data', 'A storage bucket is made publicly readable through a configuration error.', 'Confidentiality', 3, 5, 'mitigate', 1, 4, 'open', 10, 'Block public access enforced at the account level and continuous configuration monitoring.'],
  ['R-011', 'AI feature produces harmful or inaccurate output', 'The in-product AI summariser produces inaccurate output that a customer relies on.', 'AI', 3, 3, 'mitigate', 2, 2, 'open', 75, 'Evaluation suite before release, human review path, published limitations in the product.'],
  ['R-012', 'Payment fraud via compromised finance workflow', 'A business email compromise leads to a fraudulent payment.', 'Fraud', 2, 4, 'mitigate', 1, 3, 'open', 60, 'Dual authorisation for payments above threshold, verified callback for bank detail changes.'],
  ['R-013', 'Legacy ETL credentials remain active', 'Dormant long-lived credentials in the data pipeline remain valid and unmonitored.', 'Confidentiality', 4, 3, 'mitigate', 2, 2, 'open', -14, 'Remove the legacy user and migrate the pipeline to a scoped IAM role.'],
  ['R-014', 'Inadequate capacity during seasonal peak', 'Traffic exceeds provisioned capacity during peak season and degrades service.', 'Availability', 2, 3, 'accept', 2, 3, 'closed', null, 'Autoscaling groups with headroom, load test before each peak season.'],
];

const trustDocuments = [
  ['SOC 2 Type II Report', 'report', 'Independent audit report covering security, availability and confidentiality for the current period.', 1],
  ['ISO 27001 Certificate', 'certificate', 'Certificate of registration for the Information Security Management System.', 0],
  ['Penetration Test Summary', 'report', 'Executive summary of the most recent third-party penetration test.', 1],
  ['Security Whitepaper', 'document', 'Overview of the Northwind security architecture, encryption and operational practices.', 0],
  ['Sub-processor List', 'document', 'Current list of sub-processors, their location and the data they process.', 0],
  ['Data Processing Addendum', 'document', 'Standard DPA including EU standard contractual clauses.', 0],
  ['Business Continuity Summary', 'document', 'Recovery objectives and continuity testing summary.', 1],
  ['Vulnerability Disclosure Policy', 'document', 'How to report a suspected vulnerability and what to expect in response.', 0],
];

const questionnaireData = [
  ['Enterprise vendor assessment', 'Halcyon Health Group', 'in_progress', 9, [
    ['Do you encrypt customer data at rest?', 'Yes. All customer data is encrypted at rest using AES-256. Managed databases and object storage use AWS KMS customer-managed keys with automatic annual rotation.', 98, 'Cryptography and Encryption Policy'],
    ['Do you enforce multi-factor authentication for employee access?', 'Yes. MFA is enforced for the identity provider, cloud consoles, source control and VPN. Continuous monitoring flags any account without an enrolled factor.', 97, 'Access Control Policy'],
    ['How often do you perform access reviews?', 'User access reviews are performed quarterly by system owners. Entitlements that are no longer required are revoked within five business days and evidence is retained.', 94, 'Access Review Procedure'],
    ['Do you have a documented incident response plan?', 'Yes. Our incident response plan defines severity levels, roles, escalation and customer communication. It is reviewed annually and exercised through tabletop tests.', 96, 'Incident Response Plan'],
    ['What is your RTO and RPO?', 'Our recovery time objective is 4 hours and recovery point objective is 15 minutes for the production platform, supported by multi-AZ deployment and continuous backups.', 89, 'Business Continuity and Disaster Recovery Plan'],
    ['Do you conduct background checks on employees?', 'Yes. Background checks are performed for all employees prior to or shortly after start date, where permitted by local law.', 93, 'Information Security Policy'],
    ['Is penetration testing performed by an independent third party?', 'Yes. An independent firm performs an annual penetration test of the production platform. A summary report is available in our Trust Center under NDA.', 91, 'Vulnerability Management Policy'],
    ['Do you maintain a SOC 2 Type II report?', 'Yes. We maintain a SOC 2 Type II report covering the security, availability and confidentiality trust services criteria. The report is available under NDA.', 99, 'Trust Center'],
    ['How do you manage third-party sub-processors?', 'Sub-processors are reviewed before onboarding, bound by data protection terms, listed publicly in our Trust Center and reviewed at least annually.', 92, 'Third-Party and Vendor Management Policy'],
  ]],
  ['CAIQ Lite v4', 'Vertex Financial', 'complete', 5, [
    ['Are information security policies formally approved by management?', 'Yes. The policy set is approved by the Head of Security and reviewed at least annually, with acceptance tracked for all personnel.', 97, 'Information Security Policy'],
    ['Is data segregated between customers in multi-tenant environments?', 'Yes. Tenant isolation is enforced at the application layer with row-level scoping, and validated by automated tests on every release.', 88, 'Secure Software Development Policy'],
    ['Are audit logs retained and protected from tampering?', 'Audit logs are centralised, retained for at least 12 months and protected with log file validation and restricted write access.', 95, 'Information Security Policy'],
    ['Do you support single sign-on for customer administrators?', 'Yes. SAML 2.0 and OIDC single sign-on are available on all enterprise plans, including SCIM provisioning.', 96, 'Access Control Policy'],
    ['Do you have a vulnerability disclosure process?', 'Yes. Suspected vulnerabilities can be reported to security@northwind.io. We acknowledge within one business day and provide status updates until resolution.', 94, 'Vulnerability Disclosure Policy'],
  ]],
  ['Security review — renewal', 'Orion Logistics', 'not_started', 14, []],
];

export function seed({ force = false } = {}) {
  const existing = get('SELECT COUNT(*) AS n FROM frameworks');
  if (existing.n > 0 && !force) return { skipped: true };
  // Reseeding wipes 25 tables and refills them. On the public deployment it
  // runs on a timer while requests are in flight, so it has to be atomic: a
  // crash or a concurrent read must never observe a half-wiped tenant.
  db.exec('BEGIN IMMEDIATE');
  try {
    // PRAGMA foreign_keys is a no-op inside a transaction; defer_foreign_keys
    // is the transaction-scoped equivalent, so the wipe can delete parents
    // before children while constraints are still enforced at COMMIT.
    db.exec('PRAGMA defer_foreign_keys = ON');
    const result = seedTables();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* the transaction is already gone */ }
    throw err;
  }
}

function seedTables() {
  const wipe = ['test_entities', 'tests', 'control_requirements', 'controls', 'requirements', 'frameworks',
    'resources', 'integrations', 'policy_acceptances', 'policies', 'devices', 'personnel', 'vendors', 'risks',
    'audit_requests', 'audits', 'evidence', 'trust_documents', 'trust_requests', 'questionnaire_items',
    'questionnaires', 'activity', 'sessions', 'users', 'settings'];
  for (const table of wipe) db.exec(`DELETE FROM ${table}`);

  // Users
  for (const [email, name, role, title] of users) {
    run('INSERT INTO users (email, name, password_hash, role, title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      email, name, hashPassword('vantage123'), role, title, iso(-400));
  }
  const userId = (email) => get('SELECT id FROM users WHERE email = ?', email).id;
  const security = userId('marcus@northwind.io');
  const cto = userId('ada@northwind.io');
  const peopleOps = userId('sofia@northwind.io');
  const counsel = userId('dan@northwind.io');

  // Frameworks + requirements
  for (const f of frameworks) {
    run('INSERT INTO frameworks (slug, name, short_name, category, description, color, enabled, target_date, audit_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      f.slug, f.name, f.short_name, f.category, f.description, f.color,
      ['pcidss', 'iso42001'].includes(f.slug) ? 0 : 1, f.target_date, f.audit_status);
  }

  // Controls
  const ownerFor = (category) => {
    if (['HR & Training', 'Governance'].includes(category)) return peopleOps;
    if (['Privacy', 'Vendor Management'].includes(category)) return counsel;
    if (['Change Management', 'Business Continuity', 'AI Governance'].includes(category)) return cto;
    return security;
  };
  for (const c of controls) {
    run('INSERT INTO controls (code, name, description, category, owner_id) VALUES (?, ?, ?, ?, ?)',
      c.code, c.name, c.description, c.category, ownerFor(c.category));
  }
  const controlId = (code) => get('SELECT id FROM controls WHERE code = ?', code)?.id;

  for (const [slug, reqs] of Object.entries(requirements)) {
    const fw = get('SELECT id FROM frameworks WHERE slug = ?', slug);
    for (const r of reqs) {
      run('INSERT INTO requirements (framework_id, code, title, description, section) VALUES (?, ?, ?, ?, ?)',
        fw.id, r.code, r.title, r.description, r.section);
      const reqId = get('SELECT id FROM requirements WHERE framework_id = ? AND code = ?', fw.id, r.code).id;
      for (const code of r.controls) {
        const cid = controlId(code);
        if (cid) run('INSERT OR IGNORE INTO control_requirements (control_id, requirement_id) VALUES (?, ?)', cid, reqId);
      }
    }
  }

  // Tests
  for (const test of tests) {
    run('INSERT INTO tests (slug, control_id, name, description, remediation, severity, integration, rule) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      test.slug, controlId(test.control), test.name, test.description, test.remediation, test.severity, test.integration, JSON.stringify(test.rule));
  }

  // Integrations & resources
  for (const [slug, name, category, description, status, account] of integrations) {
    run('INSERT INTO integrations (slug, name, category, description, status, account, connected_at, last_sync) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      slug, name, category, description, status, account,
      status === 'connected' ? iso(-Math.floor(Math.random() * 300) - 30) : null,
      status === 'connected' ? iso(-0.02) : null);
  }
  for (const r of resources) {
    run('INSERT INTO resources (integration, type, external_id, name, region, owner, metadata, discovered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      r.integration, r.type, r.external_id, r.name, r.region, r.owner, JSON.stringify(r.metadata), iso(-90));
  }

  // Personnel
  const trainingLapsed = new Set(['tom@northwind.io', 'ben@northwind.io', 'hassan@northwind.io']);
  const trainingPending = new Set(['owen@northwind.io', 'sara@northwind.io', 'isabel@northwind.io']);
  const bgPending = new Set([]);
  for (const [name, email, title, department, employment_type, startOffset] of people) {
    const training = trainingLapsed.has(email) ? 'expired' : trainingPending.has(email) ? 'not_started' : 'complete';
    const bg = bgPending.has(email) ? 'in_progress' : employment_type === 'contractor' ? 'not_applicable' : 'complete';
    run(`INSERT INTO personnel (name, email, title, department, employment_type, status, start_date, background_check, security_training, training_due)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      name, email, title, department, employment_type, date(startOffset), bg, training,
      training === 'complete' ? date(200) : date(training === 'expired' ? -30 : 14));
  }
  for (const [name, email, title, department, startOffset, endOffset, removed] of offboarded) {
    run(`INSERT INTO personnel (name, email, title, department, employment_type, status, start_date, end_date, background_check, security_training, offboarded_access_removed)
         VALUES (?, ?, ?, ?, 'employee', 'offboarded', ?, ?, 'complete', 'complete', ?)`,
      name, email, title, department, date(startOffset), date(endOffset), removed);
  }

  // GitHub organisation members
  const ghMembers = [
    ['ada-whitfield', 'Ada Whitfield', 3], ['marcus-bell', 'Marcus Bell', 1], ['priya-raman', 'Priya Raman', 1],
    ['yusuf-karim', 'Yusuf Karim', 2], ['elena-petrova', 'Elena Petrova', 1], ['tom-nguyen', 'Tom Nguyen', 4],
    ['chloe-dubois', 'Chloé Dubois', 2], ['kenji-sato', 'Kenji Sato', 1], ['leo-brandt', 'Leo Brandt', 6],
    ['owen-walsh', 'Owen Walsh', 1], ['rafael-duarte', 'Rafael Duarte', 3], ['northwind-ci-bot', 'northwind-ci-bot', 1],
  ];
  for (const [handle, name, idleDays] of ghMembers) {
    run('INSERT INTO resources (integration, type, external_id, name, region, owner, metadata, discovered_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)',
      'github', 'github_user', handle, `${name} (@${handle})`, 'Engineering',
      JSON.stringify({ mfa_enabled: true, days_since_active: idleDays, role: handle === 'northwind-ci-bot' ? 'bot' : 'member' }), iso(-120));
  }

  // Identity provider accounts mirror the personnel roster
  const roster = all("SELECT * FROM personnel WHERE status = 'active'");
  const noMfa = new Set(['sara@northwind.io']);
  const approvedAdmins = new Set(['ada@northwind.io', 'marcus@northwind.io', 'priya@northwind.io']);
  for (const p of roster) {
    run('INSERT INTO resources (integration, type, external_id, name, region, owner, metadata, discovered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'okta', 'idp_user', `okta-${p.email}`, `${p.name} <${p.email}>`, null, p.department,
      JSON.stringify({
        mfa_enabled: !noMfa.has(p.email),
        admin_approved: p.department === 'Engineering' && !approvedAdmins.has(p.email) ? true : true,
        status: 'active',
      }), iso(-60));
  }
  run(`INSERT INTO resources (integration, type, external_id, name, region, owner, metadata, discovered_at)
       VALUES ('okta', 'idp_user', 'okta-svc-integrations', 'svc-integrations <svc@northwind.io>', NULL, 'Platform', ?, ?)`,
    JSON.stringify({ mfa_enabled: true, admin_approved: true, status: 'active' }), iso(-60));

  // Devices
  const osOptions = [['macOS', '15.6.1', 'Kandji'], ['macOS', '15.5', 'Kandji'], ['Windows', '11 23H2', 'Intune'], ['macOS', '14.7.2', 'Kandji']];
  const activePeople = all("SELECT * FROM personnel WHERE status = 'active'");
  activePeople.forEach((p, i) => {
    const [os, version, mdm] = osOptions[i % 3];
    const noEncryption = p.email === 'hassan@northwind.io';
    const stale = false;
    run(`INSERT INTO devices (personnel_id, name, os, os_version, serial, mdm, encrypted, screen_lock, antivirus, os_up_to_date, last_checkin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id, `${p.name.split(' ')[0]}-${os === 'macOS' ? 'MBP' : 'TP'}`, os, version,
      `C02${randomUUID().slice(0, 8).toUpperCase()}`, mdm,
      noEncryption ? 0 : 1, 1, 1, 1,
      iso(stale ? -47 : -Math.random() * 2));
  });
  // A second device for a few senior staff
  for (const email of ['ada@northwind.io', 'marcus@northwind.io', 'priya@northwind.io']) {
    const p = get('SELECT * FROM personnel WHERE email = ?', email);
    run(`INSERT INTO devices (personnel_id, name, os, os_version, serial, mdm, encrypted, screen_lock, antivirus, os_up_to_date, last_checkin)
         VALUES (?, ?, 'macOS', '15.6.1', ?, 'Kandji', 1, 1, 1, 1, ?)`,
      p.id, `${p.name.split(' ')[0]}-Mini`, `C02${randomUUID().slice(0, 8).toUpperCase()}`, iso(-0.5));
  }

  // Policies
  for (const [slug, name, category, description, status, approvedOffset] of policyDefs) {
    run(`INSERT INTO policies (slug, name, category, description, body, version, status, owner_id, approved_at, renewal_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slug, name, category, description, policyBody(name, description, category),
      status === 'approved' ? '2.1' : '0.9', status, ownerFor(category === 'Security' ? 'Access Control' : category),
      approvedOffset === null ? null : iso(approvedOffset),
      approvedOffset === null ? null : date(approvedOffset + 365));
  }

  // Policy acceptances — most people accepted everything, a few have gaps
  const allPolicies = all("SELECT id FROM policies WHERE status = 'approved'");
  const laggards = new Set(['owen@northwind.io', 'sara@northwind.io', 'leo@northwind.io', 'isabel@northwind.io']);
  for (const p of activePeople) {
    const skipFrom = laggards.has(p.email) ? Math.floor(allPolicies.length / 2) : allPolicies.length;
    allPolicies.slice(0, skipFrom).forEach((pol) => {
      run('INSERT OR IGNORE INTO policy_acceptances (policy_id, personnel_id, accepted_at) VALUES (?, ?, ?)', pol.id, p.id, iso(-Math.random() * 120));
    });
  }

  // Vendors
  for (const [name, website, category, description, risk, data, sub, review, soc2, iso27001, reviewedOffset, cost] of vendors) {
    run(`INSERT INTO vendors (name, website, category, description, risk_level, status, data_processed, subprocessor, owner_id, security_review_status, soc2, iso27001, last_reviewed, next_review, annual_cost)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      name, website, category, description, risk, data, sub, risk === 'high' ? security : counsel,
      review, soc2, iso27001,
      reviewedOffset === null ? null : iso(reviewedOffset),
      reviewedOffset === null ? date(30) : date(reviewedOffset + 365), cost);
  }

  // Risks
  for (const [code, title, description, category, likelihood, impact, treatment, rl, ri, status, dueOffset, mitigation] of risks) {
    run(`INSERT INTO risks (code, title, description, category, likelihood, impact, treatment, residual_likelihood, residual_impact, status, owner_id, due_date, mitigation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, title, description, category, likelihood, impact, treatment, rl, ri, status,
      category === 'AI' ? cto : security, dueOffset === null ? null : date(dueOffset), mitigation);
  }

  // Audits
  const soc2Fw = get("SELECT id FROM frameworks WHERE slug = 'soc2'");
  const isoFw = get("SELECT id FROM frameworks WHERE slug = 'iso27001'");
  run(`INSERT INTO audits (framework_id, name, auditor_firm, auditor_name, auditor_email, type, period_start, period_end, status)
       VALUES (?, 'SOC 2 Type II — FY26', 'Keeling & Co CPA', 'Helen Keeling', 'auditor@keeling-cpa.com', 'Type II', ?, ?, 'fieldwork')`,
    soc2Fw.id, date(-180), date(15));
  run(`INSERT INTO audits (framework_id, name, auditor_firm, auditor_name, auditor_email, type, period_start, period_end, status)
       VALUES (?, 'ISO 27001 Stage 1', 'Brightline Certification', 'Omar Haddad', 'omar@brightlinecert.com', 'Stage 1', ?, ?, 'scheduled')`,
    isoFw.id, date(60), date(75));
  const soc2Audit = get("SELECT id FROM audits WHERE name LIKE 'SOC 2%'");
  const auditRequests = [
    ['PBC-01', 'Population of employees hired during the period', 'Provide a complete listing of new hires with start dates.', 'accepted', -20, 3],
    ['PBC-02', 'Evidence of security awareness training completion', 'Training completion records for a sample of 12 employees.', 'submitted', -8, 12],
    ['PBC-03', 'Quarterly user access review evidence', 'Signed access review results for Q1 and Q2 of the period.', 'submitted', -5, 4],
    ['PBC-04', 'Change management sample', 'Pull request evidence for a sample of 25 production changes.', 'open', 6, 0],
    ['PBC-05', 'Backup restoration test results', 'Evidence of the most recent restoration test with results.', 'open', 9, 0],
    ['PBC-06', 'Incident log for the period', 'Listing of all security incidents with severity and resolution.', 'accepted', -14, 1],
    ['PBC-07', 'Vendor risk assessments', 'Completed security reviews for critical vendors.', 'open', 12, 0],
    ['PBC-08', 'Penetration test report', 'Most recent third-party penetration test report and remediation status.', 'accepted', -30, 1],
    ['PBC-09', 'Termination population and access removal evidence', 'Listing of terminations with evidence of timely access revocation.', 'open', 4, 0],
    ['PBC-10', 'Board meeting minutes evidencing security oversight', 'Minutes from quarterly management review meetings.', 'submitted', -2, 2],
  ];
  for (const [ref, name, description, status, dueOffset, evidenceCount] of auditRequests) {
    run('INSERT INTO audit_requests (audit_id, ref, name, description, status, due_date, evidence_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
      soc2Audit.id, ref, name, description, status, date(dueOffset), evidenceCount);
  }

  // Evidence
  const evidenceItems = [
    ['Q2 user access review — AWS', 'access_review', 'Vantage', 'AC-05', -35, 55],
    ['Q2 user access review — GitHub', 'access_review', 'Vantage', 'AC-05', -35, 55],
    ['Annual penetration test report', 'report', 'Ravenbyte Security', 'IS-06', -70, 295],
    ['Backup restoration test — production PostgreSQL', 'test_result', 'Platform team', 'DP-03', -55, 310],
    ['Tabletop incident response exercise', 'meeting_notes', 'Security team', 'IR-02', -110, 255],
    ['Management security review — Q2', 'meeting_notes', 'Executive team', 'GV-03', -25, 65],
    ['Risk assessment workbook FY26', 'document', 'Security team', 'RM-01', -140, 225],
    ['Disaster recovery failover drill', 'test_result', 'Platform team', 'BC-01', -95, 270],
    ['Security awareness training completion export', 'export', 'Rippling', 'HR-02', -12, 353],
    ['Vendor review — Anthropic', 'questionnaire', 'Security team', 'VM-01', -25, 340],
  ];
  for (const [name, type, source, controlCode, collected, renewal] of evidenceItems) {
    run('INSERT INTO evidence (control_id, name, type, source, collected_at, renewal_date) VALUES (?, ?, ?, ?, ?, ?)',
      controlId(controlCode), name, type, source, iso(collected), date(renewal));
  }

  // Trust center
  for (const [name, type, description, gated] of trustDocuments) {
    run('INSERT INTO trust_documents (name, type, description, gated, updated_at) VALUES (?, ?, ?, ?, ?)',
      name, type, description, gated, iso(-Math.floor(Math.random() * 120)));
  }
  run("INSERT INTO trust_requests (name, email, company, document, status, created_at) VALUES ('Jordan Pike', 'jordan.pike@halcyonhealth.com', 'Halcyon Health Group', 'SOC 2 Type II Report', 'pending', ?)", iso(-1));
  run("INSERT INTO trust_requests (name, email, company, document, status, created_at) VALUES ('Amelia Frost', 'a.frost@vertexfin.com', 'Vertex Financial', 'Penetration Test Summary', 'approved', ?)", iso(-9));

  setSetting('company', {
    name: COMPANY,
    domain: 'northwind.io',
    description: 'Northwind Systems builds the operations data platform used by logistics teams to plan, track and reconcile freight in real time.',
    subdomain: 'trust.northwind.io',
    contact: 'security@northwind.io',
  });
  setSetting('trust_center', {
    published: true,
    headline: 'Security at Northwind',
    subhead: 'We treat our customers’ data as if it were our own. This page is generated from live monitoring — every control below is tested continuously.',
    primary_color: '#6558f5',
  });

  // Questionnaires
  for (const [name, company, status, dueOffset, items] of questionnaireData) {
    run('INSERT INTO questionnaires (name, company, status, due_date, created_at) VALUES (?, ?, ?, ?, ?)',
      name, company, status, date(dueOffset), iso(dueOffset - 20));
    const qid = get('SELECT id FROM questionnaires WHERE name = ? AND company = ?', name, company).id;
    for (const [question, answer, confidence, source] of items) {
      run('INSERT INTO questionnaire_items (questionnaire_id, question, answer, confidence, source, status) VALUES (?, ?, ?, ?, ?, ?)',
        qid, question, answer, confidence, source, 'answered');
    }
  }
  const orion = get("SELECT id FROM questionnaires WHERE company = 'Orion Logistics'");
  for (const q of [
    'Describe your approach to encryption of data at rest and in transit.',
    'How do you manage privileged access to production systems?',
    'What logging and monitoring is in place for production infrastructure?',
    'Describe your secure software development lifecycle.',
    'How do you assess the security of your sub-processors?',
    'What is your process for notifying customers of a security incident?',
    'Do you perform annual disaster recovery testing?',
    'How is employee access removed upon termination?',
  ]) {
    run("INSERT INTO questionnaire_items (questionnaire_id, question, status) VALUES (?, ?, 'unanswered')", orion.id, q);
  }

  // Activity feed
  const activity = [
    ['integration_sync', 'Vantage Agent', 'Synced 62 resources from Amazon Web Services', -0.02],
    ['policy_accepted', 'Amara Diallo', 'Accepted "Responsible AI Usage Policy" v2.1', -0.4],
    ['personnel', 'Rippling', 'Sara Lindqvist added as an active employee', -9],
    ['vendor', 'Marcus Bell', 'Completed the security review for Anthropic', -25],
    ['audit', 'Helen Keeling', 'Accepted evidence for PBC-08 Penetration test report', -30],
    ['control', 'Ada Whitfield', 'Assigned control CM-03 Automated testing in the pipeline to Priya Raman', -12],
    ['risk', 'Marcus Bell', 'Raised risk R-013 Legacy ETL credentials remain active', -14],
    ['framework', 'Marcus Bell', 'Enabled the ISO/IEC 27001:2022 framework', -60],
    ['trust_center', 'Dan Okoye', 'Approved document access for Vertex Financial', -9],
  ];
  for (const [type, actor, message, offset] of activity) {
    run('INSERT INTO activity (type, actor, message, created_at) VALUES (?, ?, ?, ?)', type, actor, message, iso(offset));
  }

  const result = runTests({ actor: 'Vantage Agent' });
  return { seeded: true, ...result };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const res = seed({ force: process.argv.includes('--force') });
  console.log('Seed complete:', res);
}
