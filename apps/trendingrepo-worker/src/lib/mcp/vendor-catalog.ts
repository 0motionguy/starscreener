import type { VendorEntry, VendorCategory } from './types.js';

// Hand-curated vendor catalog for the "what product?!" feature.
// Each entry maps an MCP server to its real-world product (Stripe, Notion, etc.)
// so we can show the product logo on the trending leaderboard.
//
// simple_icons_slug values are verified against simple-icons.org slugs.
// brand_color is the official brand hex without the leading '#'.
// github_org_aliases gates is_official_vendor=true (only orgs the vendor controls).

interface CatalogSeed {
  vendor_slug: string;
  display_name: string;
  official_url: string;
  simple_icons_slug: string | null;
  brand_color: string;
  category: VendorCategory;
  github_org_aliases?: readonly string[];
  /** Extra package-name fragments beyond the standard `<slug>` shape. */
  extra_package_tokens?: readonly string[];
  /** Extra keyword patterns beyond display_name + vendor_slug. */
  extra_keywords?: readonly string[];
  fallback_logo_url?: string;
}

const SEEDS: readonly CatalogSeed[] = [
  // --- Payments -------------------------------------------------------------
  { vendor_slug: 'stripe', display_name: 'Stripe', official_url: 'https://stripe.com', simple_icons_slug: 'stripe', brand_color: '635BFF', category: 'payments', github_org_aliases: ['stripe', 'stripe-archive'] },
  { vendor_slug: 'paypal', display_name: 'PayPal', official_url: 'https://www.paypal.com', simple_icons_slug: 'paypal', brand_color: '003087', category: 'payments', github_org_aliases: ['paypal'] },
  { vendor_slug: 'square', display_name: 'Square', official_url: 'https://squareup.com', simple_icons_slug: 'square', brand_color: '3E4348', category: 'payments', github_org_aliases: ['square'] },
  { vendor_slug: 'plaid', display_name: 'Plaid', official_url: 'https://plaid.com', simple_icons_slug: 'plaid', brand_color: '111111', category: 'payments', github_org_aliases: ['plaid'] },
  { vendor_slug: 'adyen', display_name: 'Adyen', official_url: 'https://www.adyen.com', simple_icons_slug: 'adyen', brand_color: '0ABF53', category: 'payments', github_org_aliases: ['adyen'] },
  { vendor_slug: 'wise', display_name: 'Wise', official_url: 'https://wise.com', simple_icons_slug: 'wise', brand_color: '9FE870', category: 'payments', github_org_aliases: ['transferwise'] },

  // --- Productivity ---------------------------------------------------------
  { vendor_slug: 'notion', display_name: 'Notion', official_url: 'https://www.notion.so', simple_icons_slug: 'notion', brand_color: '000000', category: 'productivity', github_org_aliases: ['makenotion'] },
  { vendor_slug: 'linear', display_name: 'Linear', official_url: 'https://linear.app', simple_icons_slug: 'linear', brand_color: '5E6AD2', category: 'productivity', github_org_aliases: ['linear'] },
  { vendor_slug: 'asana', display_name: 'Asana', official_url: 'https://asana.com', simple_icons_slug: 'asana', brand_color: 'F06A6A', category: 'productivity', github_org_aliases: ['asana'] },
  { vendor_slug: 'jira', display_name: 'Jira', official_url: 'https://www.atlassian.com/software/jira', simple_icons_slug: 'jira', brand_color: '0052CC', category: 'productivity', github_org_aliases: ['atlassian'], extra_keywords: ['atlassian'] },
  { vendor_slug: 'confluence', display_name: 'Confluence', official_url: 'https://www.atlassian.com/software/confluence', simple_icons_slug: 'confluence', brand_color: '172B4D', category: 'productivity', github_org_aliases: ['atlassian'] },
  { vendor_slug: 'trello', display_name: 'Trello', official_url: 'https://trello.com', simple_icons_slug: 'trello', brand_color: '0079BF', category: 'productivity', github_org_aliases: ['trello', 'atlassian'] },
  { vendor_slug: 'monday', display_name: 'Monday.com', official_url: 'https://monday.com', simple_icons_slug: 'mondaydotcom', brand_color: 'FF3D57', category: 'productivity', github_org_aliases: ['mondaycom'], extra_keywords: ['monday\\.com'] },
  { vendor_slug: 'clickup', display_name: 'ClickUp', official_url: 'https://clickup.com', simple_icons_slug: 'clickup', brand_color: '7B68EE', category: 'productivity', github_org_aliases: ['clickup'] },
  { vendor_slug: 'airtable', display_name: 'Airtable', official_url: 'https://airtable.com', simple_icons_slug: 'airtable', brand_color: '18BFFF', category: 'productivity', github_org_aliases: ['airtable', 'airtable-ext'] },
  { vendor_slug: 'coda', display_name: 'Coda', official_url: 'https://coda.io', simple_icons_slug: 'coda', brand_color: 'F46A54', category: 'productivity', github_org_aliases: ['coda'] },
  { vendor_slug: 'obsidian', display_name: 'Obsidian', official_url: 'https://obsidian.md', simple_icons_slug: 'obsidian', brand_color: '7C3AED', category: 'productivity', github_org_aliases: ['obsidianmd'] },
  { vendor_slug: 'evernote', display_name: 'Evernote', official_url: 'https://evernote.com', simple_icons_slug: 'evernote', brand_color: '00A82D', category: 'productivity', github_org_aliases: ['evernote'] },

  // --- Comms ----------------------------------------------------------------
  { vendor_slug: 'slack', display_name: 'Slack', official_url: 'https://slack.com', simple_icons_slug: 'slack', brand_color: '4A154B', category: 'comms', github_org_aliases: ['slackapi', 'slackhq'] },
  { vendor_slug: 'discord', display_name: 'Discord', official_url: 'https://discord.com', simple_icons_slug: 'discord', brand_color: '5865F2', category: 'comms', github_org_aliases: ['discord', 'discordjs'] },
  { vendor_slug: 'telegram', display_name: 'Telegram', official_url: 'https://telegram.org', simple_icons_slug: 'telegram', brand_color: '26A5E4', category: 'comms', github_org_aliases: ['telegrammessenger', 'tdlib'] },
  { vendor_slug: 'whatsapp', display_name: 'WhatsApp', official_url: 'https://www.whatsapp.com', simple_icons_slug: 'whatsapp', brand_color: '25D366', category: 'comms', github_org_aliases: ['whatsapp'] },
  { vendor_slug: 'zoom', display_name: 'Zoom', official_url: 'https://zoom.us', simple_icons_slug: 'zoom', brand_color: '2D8CFF', category: 'comms', github_org_aliases: ['zoom'] },
  { vendor_slug: 'microsoft-teams', display_name: 'Microsoft Teams', official_url: 'https://teams.microsoft.com', simple_icons_slug: 'microsoftteams', brand_color: '6264A7', category: 'comms', github_org_aliases: ['microsoft', 'microsoftgraph'], extra_package_tokens: ['msteams', 'teams'] },
  { vendor_slug: 'intercom', display_name: 'Intercom', official_url: 'https://www.intercom.com', simple_icons_slug: 'intercom', brand_color: '1F8DED', category: 'comms', github_org_aliases: ['intercom'] },

  // --- Code ------------------------------------------------------------------
  { vendor_slug: 'github', display_name: 'GitHub', official_url: 'https://github.com', simple_icons_slug: 'github', brand_color: '181717', category: 'code', github_org_aliases: ['github', 'octokit'] },
  { vendor_slug: 'gitlab', display_name: 'GitLab', official_url: 'https://gitlab.com', simple_icons_slug: 'gitlab', brand_color: 'FC6D26', category: 'code', github_org_aliases: ['gitlab-org', 'gitlabhq'] },
  { vendor_slug: 'bitbucket', display_name: 'Bitbucket', official_url: 'https://bitbucket.org', simple_icons_slug: 'bitbucket', brand_color: '2684FF', category: 'code', github_org_aliases: ['atlassian'] },

  // --- Observability / Analytics --------------------------------------------
  { vendor_slug: 'sentry', display_name: 'Sentry', official_url: 'https://sentry.io', simple_icons_slug: 'sentry', brand_color: '362D59', category: 'observability', github_org_aliases: ['getsentry'] },
  { vendor_slug: 'datadog', display_name: 'Datadog', official_url: 'https://www.datadoghq.com', simple_icons_slug: 'datadog', brand_color: '632CA6', category: 'observability', github_org_aliases: ['datadog'] },
  { vendor_slug: 'posthog', display_name: 'PostHog', official_url: 'https://posthog.com', simple_icons_slug: 'posthog', brand_color: '1D4AFF', category: 'analytics', github_org_aliases: ['posthog'] },
  { vendor_slug: 'mixpanel', display_name: 'Mixpanel', official_url: 'https://mixpanel.com', simple_icons_slug: 'mixpanel', brand_color: '7856FF', category: 'analytics', github_org_aliases: ['mixpanel'] },
  { vendor_slug: 'amplitude', display_name: 'Amplitude', official_url: 'https://amplitude.com', simple_icons_slug: 'amplitude', brand_color: '1E61F0', category: 'analytics', github_org_aliases: ['amplitude'] },

  // --- Cloud / Infra --------------------------------------------------------
  { vendor_slug: 'aws', display_name: 'AWS', official_url: 'https://aws.amazon.com', simple_icons_slug: 'amazonwebservices', brand_color: 'FF9900', category: 'cloud', github_org_aliases: ['aws', 'awslabs', 'aws-samples'], extra_package_tokens: ['amazon-web-services'] },
  { vendor_slug: 'azure', display_name: 'Azure', official_url: 'https://azure.microsoft.com', simple_icons_slug: 'microsoftazure', brand_color: '0078D4', category: 'cloud', github_org_aliases: ['azure', 'microsoft'] },
  { vendor_slug: 'gcp', display_name: 'Google Cloud', official_url: 'https://cloud.google.com', simple_icons_slug: 'googlecloud', brand_color: '4285F4', category: 'cloud', github_org_aliases: ['googleapis', 'googlecloudplatform'], extra_keywords: ['google\\s*cloud', 'gcp'] },
  { vendor_slug: 'cloudflare', display_name: 'Cloudflare', official_url: 'https://www.cloudflare.com', simple_icons_slug: 'cloudflare', brand_color: 'F38020', category: 'cloud', github_org_aliases: ['cloudflare'] },
  { vendor_slug: 'vercel', display_name: 'Vercel', official_url: 'https://vercel.com', simple_icons_slug: 'vercel', brand_color: '000000', category: 'cloud', github_org_aliases: ['vercel'] },
  { vendor_slug: 'netlify', display_name: 'Netlify', official_url: 'https://www.netlify.com', simple_icons_slug: 'netlify', brand_color: '00C7B7', category: 'cloud', github_org_aliases: ['netlify'] },
  { vendor_slug: 'railway', display_name: 'Railway', official_url: 'https://railway.app', simple_icons_slug: 'railway', brand_color: '0B0D0E', category: 'cloud', github_org_aliases: ['railwayapp'] },
  { vendor_slug: 'fly', display_name: 'Fly.io', official_url: 'https://fly.io', simple_icons_slug: 'flydotio', brand_color: '24175B', category: 'cloud', github_org_aliases: ['superfly'], extra_keywords: ['fly\\.io'] },
  { vendor_slug: 'heroku', display_name: 'Heroku', official_url: 'https://www.heroku.com', simple_icons_slug: 'heroku', brand_color: '430098', category: 'cloud', github_org_aliases: ['heroku'] },
  { vendor_slug: 'digitalocean', display_name: 'DigitalOcean', official_url: 'https://www.digitalocean.com', simple_icons_slug: 'digitalocean', brand_color: '0080FF', category: 'cloud', github_org_aliases: ['digitalocean'] },

  // --- BaaS / DBs -----------------------------------------------------------
  { vendor_slug: 'supabase', display_name: 'Supabase', official_url: 'https://supabase.com', simple_icons_slug: 'supabase', brand_color: '3FCF8E', category: 'baas', github_org_aliases: ['supabase'] },
  { vendor_slug: 'firebase', display_name: 'Firebase', official_url: 'https://firebase.google.com', simple_icons_slug: 'firebase', brand_color: 'FFCA28', category: 'baas', github_org_aliases: ['firebase'] },
  { vendor_slug: 'postgres', display_name: 'PostgreSQL', official_url: 'https://www.postgresql.org', simple_icons_slug: 'postgresql', brand_color: '4169E1', category: 'database', github_org_aliases: ['postgres', 'postgresql'], extra_package_tokens: ['postgresql'], extra_keywords: ['postgresql', 'pg\\b'] },
  { vendor_slug: 'mysql', display_name: 'MySQL', official_url: 'https://www.mysql.com', simple_icons_slug: 'mysql', brand_color: '4479A1', category: 'database', github_org_aliases: ['mysql'] },
  { vendor_slug: 'mongodb', display_name: 'MongoDB', official_url: 'https://www.mongodb.com', simple_icons_slug: 'mongodb', brand_color: '47A248', category: 'database', github_org_aliases: ['mongodb'] },
  { vendor_slug: 'redis', display_name: 'Redis', official_url: 'https://redis.io', simple_icons_slug: 'redis', brand_color: 'FF4438', category: 'database', github_org_aliases: ['redis', 'redis-labs'] },
  { vendor_slug: 'sqlite', display_name: 'SQLite', official_url: 'https://www.sqlite.org', simple_icons_slug: 'sqlite', brand_color: '003B57', category: 'database', github_org_aliases: ['sqlite'] },
  { vendor_slug: 'clickhouse', display_name: 'ClickHouse', official_url: 'https://clickhouse.com', simple_icons_slug: 'clickhouse', brand_color: 'FFCC01', category: 'database', github_org_aliases: ['clickhouse'] },
  { vendor_slug: 'snowflake', display_name: 'Snowflake', official_url: 'https://www.snowflake.com', simple_icons_slug: 'snowflake', brand_color: '29B5E8', category: 'database', github_org_aliases: ['snowflakedb'] },
  { vendor_slug: 'bigquery', display_name: 'BigQuery', official_url: 'https://cloud.google.com/bigquery', simple_icons_slug: 'googlebigquery', brand_color: '669DF6', category: 'database', github_org_aliases: ['googleapis', 'googlecloudplatform'] },
  { vendor_slug: 'databricks', display_name: 'Databricks', official_url: 'https://www.databricks.com', simple_icons_slug: 'databricks', brand_color: 'FF3621', category: 'database', github_org_aliases: ['databricks'] },
  { vendor_slug: 'neon', display_name: 'Neon', official_url: 'https://neon.tech', simple_icons_slug: 'neon', brand_color: '00E599', category: 'database', github_org_aliases: ['neondatabase'] },
  { vendor_slug: 'planetscale', display_name: 'PlanetScale', official_url: 'https://planetscale.com', simple_icons_slug: 'planetscale', brand_color: '000000', category: 'database', github_org_aliases: ['planetscale'] },
  { vendor_slug: 'duckdb', display_name: 'DuckDB', official_url: 'https://duckdb.org', simple_icons_slug: 'duckdb', brand_color: 'FFF000', category: 'database', github_org_aliases: ['duckdb'] },

  // --- Vector DBs -----------------------------------------------------------
  { vendor_slug: 'pinecone', display_name: 'Pinecone', official_url: 'https://www.pinecone.io', simple_icons_slug: 'pinecone', brand_color: '1A1A1A', category: 'vector_db', github_org_aliases: ['pinecone-io'] },
  { vendor_slug: 'chroma', display_name: 'Chroma', official_url: 'https://www.trychroma.com', simple_icons_slug: null, brand_color: '4F46E5', category: 'vector_db', github_org_aliases: ['chroma-core'], extra_keywords: ['chromadb'], fallback_logo_url: 'https://www.trychroma.com/favicon.ico' },
  { vendor_slug: 'weaviate', display_name: 'Weaviate', official_url: 'https://weaviate.io', simple_icons_slug: null, brand_color: '17A2B8', category: 'vector_db', github_org_aliases: ['weaviate'], fallback_logo_url: 'https://weaviate.io/img/site/weaviate-logo-light.png' },
  { vendor_slug: 'qdrant', display_name: 'Qdrant', official_url: 'https://qdrant.tech', simple_icons_slug: 'qdrant', brand_color: 'DC244C', category: 'vector_db', github_org_aliases: ['qdrant'] },
  { vendor_slug: 'milvus', display_name: 'Milvus', official_url: 'https://milvus.io', simple_icons_slug: 'milvus', brand_color: '00A1EA', category: 'vector_db', github_org_aliases: ['milvus-io'] },
  { vendor_slug: 'lancedb', display_name: 'LanceDB', official_url: 'https://lancedb.com', simple_icons_slug: null, brand_color: '6B46C1', category: 'vector_db', github_org_aliases: ['lancedb'], fallback_logo_url: 'https://lancedb.com/favicon.ico' },

  // --- Google ---------------------------------------------------------------
  { vendor_slug: 'google-drive', display_name: 'Google Drive', official_url: 'https://drive.google.com', simple_icons_slug: 'googledrive', brand_color: '4285F4', category: 'google', github_org_aliases: ['googleapis'], extra_package_tokens: ['gdrive', 'googledrive'] },
  { vendor_slug: 'gmail', display_name: 'Gmail', official_url: 'https://mail.google.com', simple_icons_slug: 'gmail', brand_color: 'EA4335', category: 'google', github_org_aliases: ['googleapis'] },
  { vendor_slug: 'google-calendar', display_name: 'Google Calendar', official_url: 'https://calendar.google.com', simple_icons_slug: 'googlecalendar', brand_color: '4285F4', category: 'google', github_org_aliases: ['googleapis'], extra_package_tokens: ['gcal', 'googlecalendar'] },
  { vendor_slug: 'google-maps', display_name: 'Google Maps', official_url: 'https://maps.google.com', simple_icons_slug: 'googlemaps', brand_color: '4285F4', category: 'google', github_org_aliases: ['googlemaps', 'googleapis'], extra_package_tokens: ['googlemaps'] },
  { vendor_slug: 'google-sheets', display_name: 'Google Sheets', official_url: 'https://sheets.google.com', simple_icons_slug: 'googlesheets', brand_color: '34A853', category: 'google', github_org_aliases: ['googleapis'], extra_package_tokens: ['googlesheets'] },
  { vendor_slug: 'google-docs', display_name: 'Google Docs', official_url: 'https://docs.google.com', simple_icons_slug: 'googledocs', brand_color: '4285F4', category: 'google', github_org_aliases: ['googleapis'], extra_package_tokens: ['googledocs'] },
  { vendor_slug: 'google-analytics', display_name: 'Google Analytics', official_url: 'https://analytics.google.com', simple_icons_slug: 'googleanalytics', brand_color: 'E37400', category: 'google', github_org_aliases: ['googleapis', 'googleanalytics'] },
  { vendor_slug: 'youtube', display_name: 'YouTube', official_url: 'https://www.youtube.com', simple_icons_slug: 'youtube', brand_color: 'FF0000', category: 'google', github_org_aliases: ['youtube'] },
  { vendor_slug: 'google-search-console', display_name: 'Search Console', official_url: 'https://search.google.com/search-console', simple_icons_slug: 'googlesearchconsole', brand_color: '458CF5', category: 'google', github_org_aliases: ['googleapis'] },

  // --- Microsoft ------------------------------------------------------------
  { vendor_slug: 'outlook', display_name: 'Outlook', official_url: 'https://outlook.com', simple_icons_slug: 'microsoftoutlook', brand_color: '0078D4', category: 'microsoft', github_org_aliases: ['microsoft', 'microsoftgraph'] },
  { vendor_slug: 'sharepoint', display_name: 'SharePoint', official_url: 'https://www.microsoft.com/microsoft-365/sharepoint', simple_icons_slug: 'microsoftsharepoint', brand_color: '0078D4', category: 'microsoft', github_org_aliases: ['microsoft', 'microsoftgraph'] },
  { vendor_slug: 'm365', display_name: 'Microsoft 365', official_url: 'https://www.microsoft.com/microsoft-365', simple_icons_slug: 'microsoftoffice', brand_color: 'D83B01', category: 'microsoft', github_org_aliases: ['microsoft', 'microsoftgraph'], extra_package_tokens: ['office365', 'microsoft-365'] },
  { vendor_slug: 'dynamics', display_name: 'Dynamics 365', official_url: 'https://dynamics.microsoft.com', simple_icons_slug: null, brand_color: '002050', category: 'microsoft', github_org_aliases: ['microsoft'], extra_keywords: ['dynamics\\s*365'], fallback_logo_url: 'https://www.microsoft.com/favicon.ico' },

  // --- AI -------------------------------------------------------------------
  { vendor_slug: 'openai', display_name: 'OpenAI', official_url: 'https://openai.com', simple_icons_slug: 'openai', brand_color: '412991', category: 'ai', github_org_aliases: ['openai'] },
  { vendor_slug: 'anthropic', display_name: 'Anthropic', official_url: 'https://www.anthropic.com', simple_icons_slug: 'anthropic', brand_color: 'D97706', category: 'ai', github_org_aliases: ['anthropics', 'anthropic'] },
  { vendor_slug: 'huggingface', display_name: 'Hugging Face', official_url: 'https://huggingface.co', simple_icons_slug: 'huggingface', brand_color: 'FFD21E', category: 'ai', github_org_aliases: ['huggingface'], extra_package_tokens: ['hugging-face', 'hf'] },
  { vendor_slug: 'replicate', display_name: 'Replicate', official_url: 'https://replicate.com', simple_icons_slug: null, brand_color: '000000', category: 'ai', github_org_aliases: ['replicate'], fallback_logo_url: 'https://replicate.com/favicon.ico' },
  { vendor_slug: 'elevenlabs', display_name: 'ElevenLabs', official_url: 'https://elevenlabs.io', simple_icons_slug: 'elevenlabs', brand_color: '000000', category: 'ai', github_org_aliases: ['elevenlabs'] },
  { vendor_slug: 'stability-ai', display_name: 'Stability AI', official_url: 'https://stability.ai', simple_icons_slug: null, brand_color: 'D92D8E', category: 'ai', github_org_aliases: ['stability-ai'], extra_keywords: ['stable\\s*diffusion'], fallback_logo_url: 'https://stability.ai/favicon.ico' },
  { vendor_slug: 'runway', display_name: 'Runway', official_url: 'https://runwayml.com', simple_icons_slug: null, brand_color: '000000', category: 'ai', github_org_aliases: ['runwayml'], extra_keywords: ['runwayml'], fallback_logo_url: 'https://runwayml.com/favicon.ico' },
  { vendor_slug: 'cohere', display_name: 'Cohere', official_url: 'https://cohere.com', simple_icons_slug: null, brand_color: '39594D', category: 'ai', github_org_aliases: ['cohere-ai'], fallback_logo_url: 'https://cohere.com/favicon.ico' },
  { vendor_slug: 'mistral', display_name: 'Mistral AI', official_url: 'https://mistral.ai', simple_icons_slug: null, brand_color: 'FA520F', category: 'ai', github_org_aliases: ['mistralai'], extra_keywords: ['mistral\\s*ai'], fallback_logo_url: 'https://mistral.ai/favicon.ico' },
  { vendor_slug: 'perplexity', display_name: 'Perplexity', official_url: 'https://www.perplexity.ai', simple_icons_slug: 'perplexity', brand_color: '20808D', category: 'ai', github_org_aliases: ['perplexity', 'perplexityai'] },
  { vendor_slug: 'langchain', display_name: 'LangChain', official_url: 'https://www.langchain.com', simple_icons_slug: 'langchain', brand_color: '1C3C3C', category: 'ai', github_org_aliases: ['langchain-ai'] },
  { vendor_slug: 'firecrawl', display_name: 'Firecrawl', official_url: 'https://www.firecrawl.dev', simple_icons_slug: null, brand_color: 'FF6B35', category: 'ai', github_org_aliases: ['mendableai'], fallback_logo_url: 'https://www.firecrawl.dev/favicon.ico' },

  // --- Design ---------------------------------------------------------------
  { vendor_slug: 'figma', display_name: 'Figma', official_url: 'https://www.figma.com', simple_icons_slug: 'figma', brand_color: 'F24E1E', category: 'design', github_org_aliases: ['figma'] },
  { vendor_slug: 'sketch', display_name: 'Sketch', official_url: 'https://www.sketch.com', simple_icons_slug: 'sketch', brand_color: 'F7B500', category: 'design', github_org_aliases: ['sketch-hq'] },
  { vendor_slug: 'adobe', display_name: 'Adobe Creative Cloud', official_url: 'https://www.adobe.com/creativecloud.html', simple_icons_slug: 'adobecreativecloud', brand_color: 'DA1F26', category: 'design', github_org_aliases: ['adobe'], extra_package_tokens: ['creative-cloud'] },
  { vendor_slug: 'framer', display_name: 'Framer', official_url: 'https://www.framer.com', simple_icons_slug: 'framer', brand_color: '0055FF', category: 'design', github_org_aliases: ['framer'] },
  { vendor_slug: 'canva', display_name: 'Canva', official_url: 'https://www.canva.com', simple_icons_slug: 'canva', brand_color: '00C4CC', category: 'design', github_org_aliases: ['canva'] },

  // --- CRM / Sales ----------------------------------------------------------
  { vendor_slug: 'salesforce', display_name: 'Salesforce', official_url: 'https://www.salesforce.com', simple_icons_slug: 'salesforce', brand_color: '00A1E0', category: 'crm', github_org_aliases: ['salesforce'] },
  { vendor_slug: 'hubspot', display_name: 'HubSpot', official_url: 'https://www.hubspot.com', simple_icons_slug: 'hubspot', brand_color: 'FF7A59', category: 'crm', github_org_aliases: ['hubspot'] },
  { vendor_slug: 'pipedrive', display_name: 'Pipedrive', official_url: 'https://www.pipedrive.com', simple_icons_slug: 'pipedrive', brand_color: '1A1A1A', category: 'crm', github_org_aliases: ['pipedrive'] },
  { vendor_slug: 'attio', display_name: 'Attio', official_url: 'https://attio.com', simple_icons_slug: null, brand_color: '000000', category: 'crm', github_org_aliases: ['attio'], fallback_logo_url: 'https://attio.com/favicon.ico' },
  { vendor_slug: 'zendesk', display_name: 'Zendesk', official_url: 'https://www.zendesk.com', simple_icons_slug: 'zendesk', brand_color: '03363D', category: 'crm', github_org_aliases: ['zendesk'] },
  { vendor_slug: 'freshdesk', display_name: 'Freshdesk', official_url: 'https://www.freshworks.com/freshdesk', simple_icons_slug: 'freshworks', brand_color: '15B886', category: 'crm', github_org_aliases: ['freshworks', 'freshdesk'] },

  // --- Commerce -------------------------------------------------------------
  { vendor_slug: 'shopify', display_name: 'Shopify', official_url: 'https://www.shopify.com', simple_icons_slug: 'shopify', brand_color: '7AB55C', category: 'commerce', github_org_aliases: ['shopify'] },
  { vendor_slug: 'woocommerce', display_name: 'WooCommerce', official_url: 'https://woocommerce.com', simple_icons_slug: 'woocommerce', brand_color: '96588A', category: 'commerce', github_org_aliases: ['woocommerce'] },
  { vendor_slug: 'magento', display_name: 'Magento', official_url: 'https://magento.com', simple_icons_slug: 'magento', brand_color: 'EE672F', category: 'commerce', github_org_aliases: ['magento'] },
  { vendor_slug: 'bigcommerce', display_name: 'BigCommerce', official_url: 'https://www.bigcommerce.com', simple_icons_slug: 'bigcommerce', brand_color: '34313F', category: 'commerce', github_org_aliases: ['bigcommerce'] },

  // --- Social ---------------------------------------------------------------
  { vendor_slug: 'x', display_name: 'X (Twitter)', official_url: 'https://x.com', simple_icons_slug: 'x', brand_color: '000000', category: 'social', github_org_aliases: ['twitter', 'x'], extra_package_tokens: ['twitter'] },
  { vendor_slug: 'reddit', display_name: 'Reddit', official_url: 'https://www.reddit.com', simple_icons_slug: 'reddit', brand_color: 'FF4500', category: 'social', github_org_aliases: ['reddit'] },
  { vendor_slug: 'linkedin', display_name: 'LinkedIn', official_url: 'https://www.linkedin.com', simple_icons_slug: 'linkedin', brand_color: '0A66C2', category: 'social', github_org_aliases: ['linkedin'] },
  { vendor_slug: 'instagram', display_name: 'Instagram', official_url: 'https://www.instagram.com', simple_icons_slug: 'instagram', brand_color: 'E4405F', category: 'social', github_org_aliases: ['instagram'] },
  { vendor_slug: 'tiktok', display_name: 'TikTok', official_url: 'https://www.tiktok.com', simple_icons_slug: 'tiktok', brand_color: '000000', category: 'social', github_org_aliases: ['tiktok', 'bytedance'] },
  { vendor_slug: 'facebook', display_name: 'Facebook', official_url: 'https://www.facebook.com', simple_icons_slug: 'facebook', brand_color: '1877F2', category: 'social', github_org_aliases: ['facebook'] },
  { vendor_slug: 'bluesky', display_name: 'Bluesky', official_url: 'https://bsky.app', simple_icons_slug: 'bluesky', brand_color: '0085FF', category: 'social', github_org_aliases: ['bluesky-social'], extra_package_tokens: ['bsky'] },

  // --- Crypto / Web3 --------------------------------------------------------
  { vendor_slug: 'solana', display_name: 'Solana', official_url: 'https://solana.com', simple_icons_slug: 'solana', brand_color: '9945FF', category: 'crypto', github_org_aliases: ['solana-labs'] },
  { vendor_slug: 'ethereum', display_name: 'Ethereum', official_url: 'https://ethereum.org', simple_icons_slug: 'ethereum', brand_color: '3C3C3D', category: 'crypto', github_org_aliases: ['ethereum'] },
  { vendor_slug: 'bitcoin', display_name: 'Bitcoin', official_url: 'https://bitcoin.org', simple_icons_slug: 'bitcoin', brand_color: 'F7931A', category: 'crypto', github_org_aliases: ['bitcoin'] },
  { vendor_slug: 'polygon', display_name: 'Polygon', official_url: 'https://polygon.technology', simple_icons_slug: 'polygon', brand_color: '7B3FE4', category: 'crypto', github_org_aliases: ['maticnetwork', '0xpolygon'] },
  { vendor_slug: 'arbitrum', display_name: 'Arbitrum', official_url: 'https://arbitrum.io', simple_icons_slug: null, brand_color: '28A0F0', category: 'crypto', github_org_aliases: ['offchainlabs'], fallback_logo_url: 'https://arbitrum.io/favicon.ico' },
  { vendor_slug: 'base', display_name: 'Base', official_url: 'https://base.org', simple_icons_slug: null, brand_color: '0052FF', category: 'crypto', github_org_aliases: ['base-org'], fallback_logo_url: 'https://base.org/favicon.ico' },
  { vendor_slug: 'coinbase', display_name: 'Coinbase', official_url: 'https://www.coinbase.com', simple_icons_slug: 'coinbase', brand_color: '0052FF', category: 'crypto', github_org_aliases: ['coinbase'] },
  { vendor_slug: 'binance', display_name: 'Binance', official_url: 'https://www.binance.com', simple_icons_slug: 'binance', brand_color: 'F0B90B', category: 'crypto', github_org_aliases: ['binance', 'bnb-chain'] },
  { vendor_slug: 'polymarket', display_name: 'Polymarket', official_url: 'https://polymarket.com', simple_icons_slug: null, brand_color: '2D9CDB', category: 'crypto', github_org_aliases: ['polymarket'], fallback_logo_url: 'https://polymarket.com/favicon.ico' },
  { vendor_slug: 'chainlink', display_name: 'Chainlink', official_url: 'https://chain.link', simple_icons_slug: 'chainlink', brand_color: '375BD2', category: 'crypto', github_org_aliases: ['smartcontractkit'] },
  { vendor_slug: 'uniswap', display_name: 'Uniswap', official_url: 'https://uniswap.org', simple_icons_slug: 'uniswap', brand_color: 'FF007A', category: 'crypto', github_org_aliases: ['uniswap'] },

  // --- Knowledge ------------------------------------------------------------
  { vendor_slug: 'arxiv', display_name: 'arXiv', official_url: 'https://arxiv.org', simple_icons_slug: 'arxiv', brand_color: 'B31B1B', category: 'knowledge', github_org_aliases: ['arxiv'] },
  { vendor_slug: 'pubmed', display_name: 'PubMed', official_url: 'https://pubmed.ncbi.nlm.nih.gov', simple_icons_slug: null, brand_color: '326295', category: 'knowledge', github_org_aliases: ['ncbi'], fallback_logo_url: 'https://pubmed.ncbi.nlm.nih.gov/favicon.ico' },
  { vendor_slug: 'wikipedia', display_name: 'Wikipedia', official_url: 'https://www.wikipedia.org', simple_icons_slug: 'wikipedia', brand_color: '000000', category: 'knowledge', github_org_aliases: ['wikimedia'] },
  { vendor_slug: 'semantic-scholar', display_name: 'Semantic Scholar', official_url: 'https://www.semanticscholar.org', simple_icons_slug: null, brand_color: '1857B6', category: 'knowledge', github_org_aliases: ['allenai'], extra_keywords: ['semantic-scholar', 'semanticscholar'], fallback_logo_url: 'https://www.semanticscholar.org/favicon.ico' },

  // --- Storage --------------------------------------------------------------
  { vendor_slug: 's3', display_name: 'Amazon S3', official_url: 'https://aws.amazon.com/s3', simple_icons_slug: 'amazons3', brand_color: '569A31', category: 'storage', github_org_aliases: ['aws', 'awslabs'] },
  { vendor_slug: 'r2', display_name: 'Cloudflare R2', official_url: 'https://www.cloudflare.com/products/r2', simple_icons_slug: null, brand_color: 'F38020', category: 'storage', github_org_aliases: ['cloudflare'], fallback_logo_url: 'https://www.cloudflare.com/favicon.ico' },
  { vendor_slug: 'gcs', display_name: 'Google Cloud Storage', official_url: 'https://cloud.google.com/storage', simple_icons_slug: 'googlecloudstorage', brand_color: '4285F4', category: 'storage', github_org_aliases: ['googleapis'] },
  { vendor_slug: 'dropbox', display_name: 'Dropbox', official_url: 'https://www.dropbox.com', simple_icons_slug: 'dropbox', brand_color: '0061FF', category: 'storage', github_org_aliases: ['dropbox'] },
  { vendor_slug: 'box', display_name: 'Box', official_url: 'https://www.box.com', simple_icons_slug: 'box', brand_color: '0061D5', category: 'storage', github_org_aliases: ['box'] },

  // --- Auth -----------------------------------------------------------------
  { vendor_slug: 'auth0', display_name: 'Auth0', official_url: 'https://auth0.com', simple_icons_slug: 'auth0', brand_color: 'EB5424', category: 'auth', github_org_aliases: ['auth0'] },
  { vendor_slug: 'clerk', display_name: 'Clerk', official_url: 'https://clerk.com', simple_icons_slug: 'clerk', brand_color: '6C47FF', category: 'auth', github_org_aliases: ['clerk', 'clerkinc'] },
  { vendor_slug: 'workos', display_name: 'WorkOS', official_url: 'https://workos.com', simple_icons_slug: null, brand_color: '6363F1', category: 'auth', github_org_aliases: ['workos'], fallback_logo_url: 'https://workos.com/favicon.ico' },
  { vendor_slug: 'okta', display_name: 'Okta', official_url: 'https://www.okta.com', simple_icons_slug: 'okta', brand_color: '007DC1', category: 'auth', github_org_aliases: ['okta'] },

  // --- Misc / fallback that we still want to show as "reference" -------------
  { vendor_slug: 'puppeteer', display_name: 'Puppeteer', official_url: 'https://pptr.dev', simple_icons_slug: 'puppeteer', brand_color: '40B5A4', category: 'other', github_org_aliases: ['puppeteer'] },
  { vendor_slug: 'docker', display_name: 'Docker', official_url: 'https://www.docker.com', simple_icons_slug: 'docker', brand_color: '2496ED', category: 'other', github_org_aliases: ['docker'] },
];

// Manual overrides keyed by qualified_name. Used by detectVendor() BEFORE
// any pattern matching. Insert ambiguous cases here as they surface.
export const MANUAL_OVERRIDES: Record<string, { vendor_slug: string; is_official_vendor: boolean }> = {
  // Reference servers in modelcontextprotocol's repo: vendor by topic, NOT
  // official-vendor (anthropic team maintains them, not the vendor itself).
  // The package_patterns also catch these; this is the explicit truth.
  // Add per-MCP overrides here when detection misclassifies, e.g.:
  // 'someorg/postgres-mcp-clone': { vendor_slug: 'postgres', is_official_vendor: false },
};

function buildPackagePatterns(seed: CatalogSeed): RegExp[] {
  const tokens = [seed.vendor_slug, ...(seed.extra_package_tokens ?? [])];
  const patterns: RegExp[] = [];
  for (const token of tokens) {
    const t = escapeRegex(token);
    // @<token>/* — scoped npm under vendor org
    patterns.push(new RegExp(`^@${t}\\b`, 'i'));
    // <token>-mcp[-server][-...]
    patterns.push(new RegExp(`(^|[-/])${t}-mcp(-server)?($|[-/])`, 'i'));
    // mcp[-server]-<token>[-...]
    patterns.push(new RegExp(`(^|[-/])mcp-(server-)?${t}($|[-/])`, 'i'));
    // server-<token>[-...]
    patterns.push(new RegExp(`(^|[-/])server-${t}($|[-/])`, 'i'));
    // <token>_mcp / <token>.mcp (python idioms)
    patterns.push(new RegExp(`(^|[._-])${t}[._-]mcp($|[._-])`, 'i'));
  }
  return patterns;
}

function buildKeywordPatterns(seed: CatalogSeed): RegExp[] {
  const tokens = [
    escapeRegex(seed.display_name),
    escapeRegex(seed.vendor_slug),
    ...(seed.extra_keywords ?? []),
  ];
  return tokens.map((t) => new RegExp(`(^|\\W)${t}(\\W|$)`, 'i'));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const VENDOR_CATALOG: readonly VendorEntry[] = SEEDS.map((seed) => ({
  vendor_slug: seed.vendor_slug,
  display_name: seed.display_name,
  official_url: seed.official_url,
  simple_icons_slug: seed.simple_icons_slug,
  brand_color: seed.brand_color,
  category: seed.category,
  github_org_aliases: seed.github_org_aliases ?? [],
  package_patterns: buildPackagePatterns(seed),
  keyword_patterns: buildKeywordPatterns(seed),
  ...(seed.fallback_logo_url ? { fallback_logo_url: seed.fallback_logo_url } : {}),
}));

const BY_SLUG = new Map(VENDOR_CATALOG.map((v) => [v.vendor_slug, v]));
const BY_GITHUB_ORG: Map<string, VendorEntry> = new Map();
for (const entry of VENDOR_CATALOG) {
  for (const org of entry.github_org_aliases) {
    BY_GITHUB_ORG.set(org.toLowerCase(), entry);
  }
}

export function getVendor(slug: string): VendorEntry | undefined {
  return BY_SLUG.get(slug);
}

export function getVendorByGithubOrg(owner: string): VendorEntry | undefined {
  return BY_GITHUB_ORG.get(owner.toLowerCase());
}

export const VENDOR_COUNT = VENDOR_CATALOG.length;
