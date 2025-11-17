# Migration Guide

## Migrating from Monolithic to Modular Architecture

This document explains the changes made to refactor the codebase into a modular architecture.

## What Changed?

The original `index.js` (712 lines) has been split into multiple focused modules:

### New Structure

```
turnitine-backend-automation/
├── config/
│   └── index.js              # Configuration management
├── services/
│   ├── supabase.service.js   # Supabase client
│   ├── user.service.js       # User operations
│   ├── essay.service.js      # Essay operations
│   ├── analytic.service.js   # Analytics operations
│   ├── telegram.service.js   # Telegram notifications (NEW)
│   ├── captcha.service.js    # Captcha solving
│   └── browser.service.js    # Browser automation
├── utils/
│   └── helpers.js            # Utility functions
├── index.js                  # Main orchestrator (40 lines)
├── inject.js                 # Browser injection (unchanged)
└── normalize-ua.js           # User agent normalization (unchanged)
```

## Key Improvements

### 1. **Separation of Concerns**
Each module has a single, well-defined responsibility:
- Services handle specific domains (users, essays, analytics, etc.)
- Configuration is centralized
- Utilities are reusable

### 2. **Telegram Integration** (NEW FEATURE)
Added notification system that alerts users via Telegram:
- Processing started notifications
- Success notifications with analytics
- Failure notifications with error details

### 3. **Better Maintainability**
- Smaller, focused files are easier to understand and modify
- Clear module boundaries
- Reusable service functions

### 4. **Database Integration**
Each database table now has its own service module with CRUD operations:
- `user.service.js` - Users table operations
- `essay.service.js` - Essay uploads table operations
- `analytic.service.js` - Analytic results table operations

## New Features

### Telegram Notifications

Users now receive real-time Telegram notifications:

**Processing Started:**
```
⏳ Document Processing Started

📄 File: example.pdf

Your document is being analyzed. You'll receive a notification when it's complete.
```

**Analysis Complete:**
```
✅ Document Analysis Complete!

📄 File: example.pdf
🆔 Submission ID: abc-123

📊 Analysis Results:

🤖 AI Detection: 15%
📄 Similarity: 23%
📝 Word Count: 2,450
📑 Page Count: 8
```

**Processing Failed:**
```
❌ Document Analysis Failed

📄 File: example.pdf
⚠️ Error: Upload timeout

Please try uploading your document again or contact support if the issue persists.
```

## Migration Steps

### 1. Update Dependencies

Install the new Telegram bot dependency:

```bash
npm install node-telegram-bot-api
```

### 2. Update Environment Variables

Add the Telegram bot token to your `.env` file:

```env
# Existing variables...
APIKEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
TURNITIN_EMAIL=...
TURNITIN_PASSWORD=...

# NEW: Add Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
```

To get a Telegram bot token:
1. Open Telegram and search for @BotFather
2. Send `/newbot` and follow the instructions
3. Copy the token provided
4. Add it to your `.env` file

### 3. Database Schema

Ensure your Supabase database has the correct schema. The `essay_uploads` table must have a foreign key to the `users` table:

```sql
-- Users table (if not exists)
CREATE TABLE public.users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  language_code VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Essay uploads table
CREATE TABLE public.essay_uploads (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  mime_type VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'not_paid',
  payment_session_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  submission_id UUID,
  note TEXT
);

-- Indexes
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_essay_uploads_user_id ON essay_uploads(user_id);
CREATE INDEX idx_essay_uploads_created_at ON essay_uploads(created_at DESC);
```

### 4. No Code Changes Required

The main entry point (`index.js`) remains the same from a usage perspective:

```bash
npm start
```

All the original functionality is preserved, just better organized!

## Function Mapping

Here's where original functions moved to:

| Original Location | New Location | Module |
|------------------|--------------|---------|
| `sleep()` | `utils/helpers.js` | Utility |
| `clearField()` | `utils/helpers.js` | Utility |
| `pollForQueuedEssay()` | `services/essay.service.js` | Essay Service |
| `downloadFileFromSupabase()` | `services/essay.service.js` | Essay Service |
| `updateEssayStatus()` | `services/essay.service.js` | Essay Service |
| `upsertAnalyticResults()` | `services/analytic.service.js` | Analytic Service |
| `handleLoginProcess()` | `services/browser.service.js` | Browser Service |
| `handleUploadProcess()` | `services/browser.service.js` | Browser Service |
| `completeFileUpload()` | `services/browser.service.js` | Browser Service |
| Captcha solving | `services/captcha.service.js` | Captcha Service |
| **NEW** User operations | `services/user.service.js` | User Service |
| **NEW** Telegram notifications | `services/telegram.service.js` | Telegram Service |

## Benefits

### For Developers

1. **Easier to understand**: Each file has a clear purpose
2. **Easier to test**: Isolated functions can be tested independently
3. **Easier to extend**: Add new features without touching existing code
4. **Better IDE support**: Clear imports and module boundaries

### For Users

1. **Real-time notifications**: Know exactly when your document is ready
2. **Detailed results**: Get analytics right in Telegram
3. **Error visibility**: Immediately know if something went wrong
4. **Better transparency**: Clear status updates throughout the process

## Backward Compatibility

The refactored code is **100% backward compatible** with the original:
- Same database schema (with additions for users table)
- Same external APIs (Turnitin, Supabase, 2Captcha)
- Same workflow and behavior
- Only additions: Telegram notifications (optional if token not provided)

If you don't provide a `TELEGRAM_BOT_TOKEN`, the service will skip notifications and work exactly as before.

## Troubleshooting

### "Telegram bot not initialized" Warning

This is normal if you haven't set up a Telegram bot. The service will continue working without notifications.

**To fix:** Get a bot token from @BotFather and add it to `.env`

### Module Import Errors

Make sure your `package.json` has `"type": "module"` set.

### Missing Dependencies

Run:
```bash
npm install
```

This will install all required dependencies including the new `node-telegram-bot-api`.

## Questions?

See the main [README.md](README.md) for full documentation.

