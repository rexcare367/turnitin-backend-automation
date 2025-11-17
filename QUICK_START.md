# Quick Start Guide

Get up and running in 5 minutes! ⚡

## Prerequisites

- ✅ Node.js 18+
- ✅ Supabase account
- ✅ 2Captcha account
- ✅ Turnitin account
- ✅ Telegram account

## Step-by-Step Setup

### 1. Install Dependencies (30 seconds)

```bash
npm install
```

### 2. Setup Telegram Bot (2 minutes)

1. Open Telegram
2. Search for `@BotFather`
3. Send `/newbot`
4. Choose a name: `My Turnitin Bot`
5. Choose a username: `myturnitin_bot` (must end with `bot`)
6. Copy the token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 3. Configure Environment (1 minute)

```bash
# Copy the example file
cp env.example .env
```

Edit `.env` with your details:

```env
# Get from 2captcha.com
APIKEY=your_2captcha_api_key

# Get from Supabase project settings
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Your Turnitin credentials
TURNITIN_EMAIL=your@email.com
TURNITIN_PASSWORD=yourpassword

# Token from BotFather (Step 2)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 4. Setup Database (1 minute)

Go to Supabase SQL Editor and run:

```sql
-- Create users table
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

-- Create index
CREATE INDEX idx_users_telegram_id ON public.users(telegram_id);

-- Create essay uploads table (if not exists)
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

-- Create indexes
CREATE INDEX idx_essay_uploads_user_id ON essay_uploads(user_id);
CREATE INDEX idx_essay_uploads_created_at ON essay_uploads(created_at DESC);
```

### 5. Create Storage Bucket (30 seconds)

In Supabase:
1. Go to **Storage**
2. Click **New bucket**
3. Name: `essays`
4. Public: ✅ Yes
5. Click **Create bucket**

### 6. Test User & Essay (30 seconds)

Insert a test user and essay in Supabase SQL Editor:

```sql
-- Insert test user
INSERT INTO users (telegram_id, username, first_name)
VALUES (123456789, 'testuser', 'Test User')
RETURNING id;

-- Remember the user ID from above, then insert essay
-- Replace USER_ID_HERE with the actual ID
INSERT INTO essay_uploads (
  user_id, 
  file_name, 
  file_size, 
  file_path, 
  mime_type,
  status
)
VALUES (
  USER_ID_HERE,
  'test.pdf',
  100000,
  'path/to/test.pdf',
  'application/pdf',
  'queued'
);
```

### 7. Run! 🚀

```bash
npm start
```

You should see:

```
=== Starting Turnitin Automation Service ===

=== Starting Process ===
Stage: INITIAL_CHALLENGE
```

The browser will open and start processing!

## What Happens Next?

1. **Browser opens** and navigates to Turnitin
2. **Captcha is solved** automatically
3. **Logs in** with your credentials
4. **Polls database** for queued essays
5. **Downloads file** from Supabase storage
6. **Uploads to Turnitin** and solves captcha
7. **Monitors progress** and stores analytics
8. **Sends Telegram notification** when complete!

## Expected Telegram Messages

### When Processing Starts
You'll receive:
```
⏳ Document Processing Started

📄 File: test.pdf

Your document is being analyzed...
```

### When Complete (2-5 minutes later)
You'll receive:
```
✅ Document Analysis Complete!

📄 File: test.pdf
🆔 Submission ID: abc-123

📊 Analysis Results:
🤖 AI Detection: 15%
📄 Similarity: 23%
📝 Word Count: 2,450
```

## Troubleshooting

### "No queued essays found"
**Problem:** No essays in database with `status='queued'`

**Solution:** Insert a test essay (see Step 6)

---

### "Telegram bot not initialized"
**Problem:** Missing or invalid `TELEGRAM_BOT_TOKEN`

**Solution:** Get token from @BotFather and add to `.env`

---

### "Error querying Supabase"
**Problem:** Invalid Supabase credentials

**Solution:** Check `SUPABASE_URL` and `SUPABASE_KEY` in `.env`

---

### "Login failed"
**Problem:** Invalid Turnitin credentials

**Solution:** Check `TURNITIN_EMAIL` and `TURNITIN_PASSWORD` in `.env`

---

### "Captcha solving failed"
**Problem:** Invalid or insufficient 2Captcha balance

**Solution:** 
1. Check balance at 2captcha.com
2. Verify `APIKEY` in `.env`

---

### "File download failed"
**Problem:** File doesn't exist in Supabase storage

**Solution:** Upload file to `essays` bucket at correct path

---

## Useful Commands

```bash
# Start the service
npm start

# Install dependencies
npm install

# View logs (verbose)
DEBUG=* npm start
```

## File Upload to Supabase

To upload a file manually:

1. Go to Supabase **Storage**
2. Select `essays` bucket
3. Click **Upload file**
4. Choose your PDF
5. Note the path (e.g., `path/to/file.pdf`)
6. Use this path in the `essay_uploads` table

## Getting User's Telegram ID

To get a user's Telegram ID:

1. Send `/start` to @userinfobot in Telegram
2. It will reply with your user ID
3. Use this ID in the `users` table

## Next Steps

- 📖 Read [README.md](README.md) for full documentation
- 🔄 Read [MIGRATION.md](MIGRATION.md) for migration guide
- 📊 Read [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) for architecture details

## Support

- Open an issue on GitHub
- Check logs for detailed error messages
- Verify all environment variables are set

---

**You're all set! Happy automating! 🎉**

