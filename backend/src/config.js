const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'AUTH0_DOMAIN',
  'AUTH0_AUDIENCE',
  'FGA_API_URL',
  'FGA_STORE_ID',
];

function validateConfig() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error('\nMissing required environment variables:');
    for (const name of missing) console.error(`  - ${name}`);
    console.error('\nRefusing to start. Set these and try again.\n');
    process.exit(1);
  }
}

module.exports = { validateConfig, REQUIRED_ENV_VARS };
