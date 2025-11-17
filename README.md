# Turnitin Backend Automation

Automated document analysis service that processes essay uploads through Turnitin and sends notifications via Telegram.

## Features

- 🤖 Automated Cloudflare Turnstile captcha solving
- 📄 Document upload and analysis automation
- 💾 Supabase integration for data persistence
- 📱 Telegram notifications for processing status
- 🔄 Queue-based essay processing
- 📊 Comprehensive analytics tracking

## Architecture

The project follows a modular architecture with separation of concerns:

```
├── config/               # Configuration and environment variables
│   └── index.js
├── services/            # Business logic modules
│   ├── analytic.service.js    # Analytics data operations
│   ├── browser.service.js     # Browser automation
│   ├── captcha.service.js     # Captcha solving
│   ├── essay.service.js       # Essay operations
│   ├── supabase.service.js    # Supabase client
│   ├── telegram.service.js    # Telegram notifications
│   └── user.service.js        # User operations
├── utils/               # Utility functions
│   └── helpers.js
├── index.js            # Main entry point
└── inject.js           # Browser injection script
```

## Database Schema

### Users Table

```sql
CREATE TABLE public.users (
  id BIGSERIAL NOT NULL,
  telegram_id BIGINT NOT NULL,
  username VARCHAR(255) NULL,
  first_name VARCHAR(255) NULL,
  last_name VARCHAR(255) NULL,
  language_code VARCHAR(10) NULL,
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_telegram_id_key UNIQUE (telegram_id)
);

CREATE INDEX idx_users_telegram_id ON public.users USING BTREE (telegram_id);
```

### Essay Uploads Table

```sql
CREATE TABLE public.essay_uploads (
  id BIGSERIAL NOT NULL,
  user_id BIGINT NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(100) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'not_paid',
  payment_session_id VARCHAR(255) NULL,
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
  submission_id UUID NULL,
  note TEXT NULL,
  CONSTRAINT essay_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT essay_uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_essay_uploads_user_id ON public.essay_uploads USING BTREE (user_id);
CREATE INDEX idx_essay_uploads_created_at ON public.essay_uploads USING BTREE (created_at DESC);
```

## Setup

### Prerequisites

- Node.js 18+ 
- A Supabase project with the above tables created
- 2Captcha API key
- Telegram Bot Token (from @BotFather)
- Turnitin account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd turnitine-backend-automation
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
APIKEY=your_2captcha_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
TURNITIN_EMAIL=your_email@example.com
TURNITIN_PASSWORD=your_password
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

4. Set up Supabase:
   - Create the `users` and `essay_uploads` tables using the SQL above
   - Create a storage bucket named `essays`
   - Set appropriate permissions

### Running

Start the service:
```bash
npm start
```

The service will:
1. Launch a browser and navigate to Turnitin
2. Solve captchas automatically
3. Log in to your account
4. Poll for queued essays in the database
5. Process each essay and send Telegram notifications

## Service Modules

### Config Module (`config/index.js`)
Centralized configuration management for all environment variables and constants.

### Supabase Service (`services/supabase.service.js`)
Manages Supabase client initialization and provides singleton access.

### User Service (`services/user.service.js`)
Handles user-related database operations:
- `getUserById(userId)` - Fetch user by ID
- `getUserByTelegramId(telegramId)` - Fetch user by Telegram ID
- `upsertUser(userData)` - Create or update user

### Essay Service (`services/essay.service.js`)
Manages essay-related operations:
- `pollForQueuedEssay()` - Continuously poll for queued essays
- `downloadFileFromSupabase(essay)` - Download essay file from storage
- `updateEssayStatus(essayId, status, additionalData)` - Update essay status
- `getEssayWithUser(essayId)` - Fetch essay with user information

### Analytic Service (`services/analytic.service.js`)
Handles analytics data operations:
- `upsertAnalyticResults(statusResponse)` - Store/update analysis results
- `getAnalyticResults(submissionId)` - Fetch analysis results

### Telegram Service (`services/telegram.service.js`)
Manages Telegram notifications:
- `sendProcessingNotification(telegramId, essayData)` - Notify when processing starts
- `sendCompletionNotification(telegramId, essayData, analyticData)` - Send results
- `sendFailureNotification(telegramId, essayData, errorMessage)` - Notify on failure

### Captcha Service (`services/captcha.service.js`)
Handles captcha solving:
- `solveTurnstileCaptcha(params)` - Solve Cloudflare Turnstile captcha

### Browser Service (`services/browser.service.js`)
Browser automation and Puppeteer management:
- `initBrowser()` - Initialize browser with proper configuration
- `setupInterceptors(page)` - Setup API request/response interceptors
- `handleLoginProcess(page)` - Handle login flow
- `handleUploadProcess(page, essay, localFilePath)` - Handle upload flow
- `completeFileUpload(page, essay, localFilePath)` - Complete file upload
- `setupCaptchaListener(page, browser, onEssayReceived)` - Listen for captcha challenges

## Workflow

1. **Initialization**: Browser launches and navigates to Turnitin login page
2. **Captcha Challenge**: Initial Cloudflare challenge is detected and solved
3. **Login**: Credentials are filled and form is submitted
4. **Authentication**: Login captcha is solved and authentication completes
5. **Polling**: Service polls Supabase for essays with `status='queued'`
6. **Download**: Essay file is downloaded from Supabase storage
7. **Upload Modal**: Upload button is clicked, triggering upload modal
8. **Modal Captcha**: Upload modal captcha is detected and solved
9. **File Upload**: File is selected and upload is initiated
10. **Processing**: Service monitors upload and analysis status
11. **Notification**: Telegram notification is sent when complete/failed
12. **Analytics**: All analysis data is stored in the database

## Status Flow

Essay statuses progress through these stages:

1. `queued` - Waiting to be processed
2. `processing` - Being processed by automation
3. `uploading` - File is being uploaded
4. `uploaded` - Upload complete, awaiting analysis
5. `completed` - Analysis complete
6. `failed` - Processing failed

## Telegram Notifications

Users receive notifications at key stages:

- **Processing Started**: When essay enters processing
- **Analysis Complete**: With full analytics (AI detection %, similarity %, word count, etc.)
- **Processing Failed**: With error details

## Error Handling

The service includes comprehensive error handling:
- Automatic retry on login failures (up to 3 attempts)
- Graceful handling of missing files
- Proper status updates on failures
- Detailed error logging
- Telegram notifications for failures

## Development

### Adding New Features

1. Create service modules in `services/` directory
2. Update configuration in `config/index.js`
3. Import and use in main `index.js`

### Testing

The service runs with `headless: false` by default for debugging. Set to `true` for production use.

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
