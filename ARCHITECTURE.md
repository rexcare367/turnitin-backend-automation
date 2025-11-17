# Architecture Documentation

## System Overview

This document provides a comprehensive overview of the Turnitin Backend Automation system architecture after refactoring.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Layer                              │
│  ┌──────────┐                               ┌─────────────┐    │
│  │ Telegram │◄──────────────────────────────┤  Telegram   │    │
│  │   User   │    Real-time Notifications    │  Service    │    │
│  └──────────┘                               └─────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                                      │
                                                      │
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│                                                                 │
│  ┌─────────────┐        Orchestrates          ┌──────────────┐│
│  │  index.js   │◄──────────────────────────────┤   Config     ││
│  │ (Main Loop) │                               │   Module     ││
│  └──────┬──────┘                               └──────────────┘│
│         │                                                       │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────┐          │
│  │         Browser Service                          │          │
│  │  • initBrowser()                                │          │
│  │  • setupInterceptors()                          │          │
│  │  • handleLoginProcess()                         │          │
│  │  • handleUploadProcess()                        │          │
│  │  • completeFileUpload()                         │          │
│  │  • setupCaptchaListener()                       │          │
│  └───────┬─────────────────────────────────────────┘          │
│          │                                                     │
│          │ Uses                                                │
│          ├─────────────┬──────────────┬────────────┐          │
│          ▼             ▼              ▼            ▼          │
│  ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐│
│  │   Captcha    │ │  Essay   │ │   User   │ │  Analytic   ││
│  │   Service    │ │ Service  │ │ Service  │ │   Service   ││
│  └──────────────┘ └──────────┘ └──────────┘ └─────────────┘│
│                                                                │
└─────────────────────────────────────────────────────────────────┘
                          │         │         │         │
                          │         │         │         │
                          ▼         ▼         ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Data Access Layer                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Supabase Service                             │ │
│  │              (Singleton Client)                           │ │
│  └────────────────────────┬─────────────────────────────────┘ │
│                           │                                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Supabase │  │ Turnitin │  │2Captcha  │  │   Telegram   │  │
│  │    DB    │  │   API    │  │   API    │  │   Bot API    │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Essay Processing Flow

```
┌──────┐      ┌──────────┐      ┌────────┐      ┌──────────┐
│Queue │─────►│Download  │─────►│Upload  │─────►│Monitor   │
│Essay │      │from      │      │to      │      │Analysis  │
│      │      │Supabase  │      │Turnitin│      │Progress  │
└──────┘      └──────────┘      └────────┘      └──────────┘
   │              │                  │               │
   ▼              ▼                  ▼               ▼
┌─────────────────────────────────────────────────────────┐
│                  Telegram Notifications                  │
│  ⏳ Processing    📥 Downloaded   📤 Uploaded  ✅ Done  │
└─────────────────────────────────────────────────────────┘
```

### 2. Service Communication Pattern

```
Browser Service
    │
    ├──► Essay Service ──────► Supabase Service ──► Database
    │        │
    │        └──► User Service ──► Telegram Service ──► User
    │
    ├──► Captcha Service ──────► 2Captcha API
    │
    └──► Analytic Service ──► Supabase Service ──► Database
```

### 3. State Machine

```
┌─────────┐     ┌────────────┐     ┌───────────┐     ┌──────────┐
│ INITIAL │────►│   LOGIN    │────►│ DASHBOARD │────►│  UPLOAD  │
│CHALLENGE│     │    FORM    │     │           │     │  MODAL   │
└─────────┘     └────────────┘     └───────────┘     └──────────┘
     │               │                    │                │
     │ Solve         │ Solve              │ Wait for       │ Solve
     │ Captcha       │ Captcha            │ Essay          │ Captcha
     │               │                    │                │
     ▼               ▼                    ▼                ▼
   Next           Submit               Upload          Complete
   Stage          Form                 Button          Upload

Status: queued ──► processing ──► uploading ──► uploaded ──► completed
                       │                                         │
                       └────────────► failed ◄───────────────────┘
```

## Module Responsibilities

### Core Modules

#### 1. Browser Service (460 lines)
**Responsibility:** Browser automation and workflow orchestration

**Key Functions:**
- `initBrowser()` - Launch Puppeteer with configuration
- `setupInterceptors(page)` - Intercept API calls
- `setupCaptchaListener(page, browser, callback)` - Handle captcha challenges
- `handleLoginProcess(page)` - Automate login
- `handleUploadProcess(page, essay, localFilePath)` - Initiate upload
- `completeFileUpload(page, essay, localFilePath)` - Complete upload

**Dependencies:**
- Essay Service (file operations)
- User Service (user lookup)
- Telegram Service (notifications)
- Analytic Service (store results)
- Captcha Service (solve challenges)

---

#### 2. Essay Service (135 lines)
**Responsibility:** Essay lifecycle management

**Key Functions:**
- `pollForQueuedEssay()` - Continuously poll for queued essays
- `downloadFileFromSupabase(essay)` - Download essay files
- `updateEssayStatus(essayId, status, additionalData)` - Update status
- `getEssayWithUser(essayId)` - Fetch essay with user info

**Database Operations:**
- Query essays with `status='queued'`
- Update essay status
- Join with users table

---

#### 3. User Service (75 lines)
**Responsibility:** User management

**Key Functions:**
- `getUserById(userId)` - Fetch user by ID
- `getUserByTelegramId(telegramId)` - Fetch by Telegram ID
- `upsertUser(userData)` - Create or update user

**Database Operations:**
- Query users table
- Insert/update user records

---

#### 4. Analytic Service (155 lines)
**Responsibility:** Analytics data persistence

**Key Functions:**
- `upsertAnalyticResults(statusResponse)` - Store/update analytics
- `getAnalyticResults(submissionId)` - Retrieve analytics

**Stored Data:**
- AI detection percentage
- Similarity percentage
- Word/page counts
- Hidden text detection
- Confusable characters
- Suspect words
- Report URLs
- Processing status

---

#### 5. Telegram Service (145 lines)
**Responsibility:** User notification management

**Key Functions:**
- `sendProcessingNotification(telegramId, essayData)`
- `sendCompletionNotification(telegramId, essayData, analyticData)`
- `sendFailureNotification(telegramId, essayData, errorMessage)`

**Message Types:**
1. **Processing Started** - When essay enters processing
2. **Analysis Complete** - With full analytics
3. **Processing Failed** - With error details

**Features:**
- Markdown formatting
- Emoji indicators
- Graceful degradation (works without token)

---

#### 6. Captcha Service (25 lines)
**Responsibility:** Captcha solving

**Key Functions:**
- `solveTurnstileCaptcha(params)` - Solve Cloudflare Turnstile

**External Dependency:**
- 2Captcha API

---

#### 7. Supabase Service (15 lines)
**Responsibility:** Database client management

**Key Functions:**
- `getSupabaseClient()` - Singleton client

**Pattern:** Singleton
**Benefits:** Single connection, reusable across all services

---

#### 8. Config Module (30 lines)
**Responsibility:** Configuration management

**Exports:**
- Environment variables
- Application constants
- Timeouts and retry limits

---

#### 9. Helpers (12 lines)
**Responsibility:** Reusable utilities

**Functions:**
- `sleep(ms)` - Async delay
- `clearField(page, selector)` - Clear input

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────┐
│        users            │
├─────────────────────────┤
│ id (PK)                 │
│ telegram_id (UNIQUE)    │
│ username                │
│ first_name              │
│ last_name               │
│ language_code           │
│ created_at              │
│ updated_at              │
└────────┬────────────────┘
         │ 1
         │
         │ has many
         │
         │ N
┌────────┴────────────────┐
│   essay_uploads         │
├─────────────────────────┤
│ id (PK)                 │
│ user_id (FK)            │
│ file_name               │
│ file_size               │
│ file_path               │
│ mime_type               │
│ status                  │
│ payment_status          │
│ payment_session_id      │
│ submission_id           │
│ note                    │
│ created_at              │
│ updated_at              │
└─────────────────────────┘
         │ 1
         │
         │ has one
         │
         │ 1
┌────────┴────────────────┐
│   analytic_results      │
├─────────────────────────┤
│ id (PK = submission_id) │
│ status                  │
│ is_processing           │
│ ai_match_percentage     │
│ overall_match_percentage│
│ word_count              │
│ page_count              │
│ hidden_text_...         │
│ confusable_...          │
│ suspect_words_count     │
│ fetch_attempts_count    │
│ ... (40+ fields)        │
│ updated_at              │
└─────────────────────────┘
```

## API Integration Points

### 1. Turnitin APIs

**Base URL:** `https://production.turnitindetect.org`

#### Validate Token
- **Endpoint:** `/validate-token`
- **Method:** GET
- **Headers:** `x-access-token: <token>`
- **Purpose:** Validate session token
- **Intercepted:** Yes ✓

#### Upload
- **Endpoint:** `/upload`
- **Method:** POST
- **Purpose:** Upload essay file
- **Response:** `{ submission_id: "..." }`
- **Intercepted:** Yes ✓

#### Status
- **Endpoint:** `/status/<submission_id>`
- **Method:** GET
- **Purpose:** Get analysis status and results
- **Intercepted:** Yes ✓
- **Polling:** Every 2 seconds until completed

---

### 2. Supabase APIs

**Database Tables:**
- `users` - User profiles
- `essay_uploads` - Essay queue and status
- `analytic_results` - Analysis results

**Storage:**
- Bucket: `essays`
- Public read access
- File download via REST API

---

### 3. 2Captcha API

**Purpose:** Solve Cloudflare Turnstile captchas

**Usage:**
- Initial challenge page
- Login form captcha
- Upload modal captcha

---

### 4. Telegram Bot API

**Purpose:** Send notifications to users

**Methods Used:**
- `sendMessage(chatId, text, options)`

**Format:**
- Markdown enabled
- Emoji indicators

## Security Considerations

### Environment Variables
- ✅ Never committed to repository
- ✅ Stored in `.env` file
- ✅ `.env` in `.gitignore`
- ✅ Example file provided: `env.example`

### Credentials
- ✅ Turnitin credentials encrypted in memory
- ✅ Supabase keys use service role (limited access)
- ✅ Telegram bot token kept secret
- ✅ 2Captcha API key secured

### Database
- ✅ Row-level security enabled in Supabase
- ✅ Foreign key constraints for data integrity
- ✅ Indexes for performance

### Browser Automation
- ✅ User agent normalization
- ✅ Proper session handling
- ✅ Clean state management

## Performance Considerations

### Polling Strategy
- **Interval:** 10 seconds
- **Approach:** Continuous polling with sleep
- **Impact:** Low (single query every 10s)

### File Handling
- **Download:** Temporary storage in `./temp`
- **Cleanup:** Manual (files remain for debugging)
- **Size limit:** None (handled by Supabase)

### Browser Resources
- **Headless:** Disabled for debugging
- **DevTools:** Enabled for monitoring
- **Memory:** Monitored but not limited

### Database Queries
- **Indexes:** Yes on frequently queried columns
- **Batch operations:** No (single essay at a time)
- **Connection pooling:** Handled by Supabase SDK

## Error Handling Strategy

### Retry Logic
- **Login failures:** Up to 3 attempts
- **Captcha solving:** Single attempt (2Captcha handles retries)
- **Upload timeouts:** 60 seconds max wait
- **Processing timeouts:** 5 minutes max wait

### Failure Notifications
- ✅ Telegram notification on failure
- ✅ Database status updated to `failed`
- ✅ Error message stored in `note` field
- ✅ Detailed console logging

### Graceful Degradation
- ✅ Works without Telegram token (skips notifications)
- ✅ Continues on non-critical errors
- ✅ Proper cleanup on fatal errors

## Monitoring & Logging

### Console Logging
- 📍 Stage transitions
- ✓ Success indicators
- ✗ Error indicators
- ⏳ Progress indicators
- 🔍 Debug information

### Database Logging
- Status updates in `essay_uploads`
- Analytics in `analytic_results`
- Fetch attempt counts
- Timestamps for all operations

## Deployment Considerations

### Environment
- **OS:** Windows (PowerShell)
- **Node:** 18+
- **Browser:** Chromium (via Puppeteer)

### Resources
- **CPU:** Moderate (browser automation)
- **Memory:** ~200-500MB
- **Disk:** Minimal (temporary files)
- **Network:** Continuous (polling + API calls)

### Scaling
- **Current:** Single essay processing
- **Future:** Multi-threading possible
- **Limitation:** 2Captcha rate limits
- **Bottleneck:** Turnitin processing time

## Testing Strategy

### Unit Testing (Not implemented)
- Test individual service functions
- Mock external APIs
- Test error handling

### Integration Testing (Not implemented)
- Test service interactions
- Test database operations
- Test API integrations

### Manual Testing (Current approach)
- Run with real credentials
- Monitor console output
- Verify Telegram notifications
- Check database updates

## Future Improvements

### Architecture
1. **Event-driven design** - Use event emitters for better decoupling
2. **Queue system** - Redis/Bull for better queue management
3. **Worker processes** - Parallel essay processing
4. **API layer** - REST API for external integrations

### Features
5. **Webhook support** - Real-time updates via webhooks
6. **Email notifications** - Alternative to Telegram
7. **Batch processing** - Multiple essays simultaneously
8. **Priority queue** - VIP user priority
9. **Retry mechanism** - Auto-retry failed uploads
10. **Health checks** - Monitoring endpoints

### Operations
11. **Docker container** - Easier deployment
12. **CI/CD pipeline** - Automated testing and deployment
13. **Monitoring dashboard** - Real-time metrics
14. **Log aggregation** - Centralized logging
15. **Error tracking** - Sentry/Rollbar integration

---

**Architecture documentation complete.**

For implementation details, see [README.md](README.md)  
For migration guide, see [MIGRATION.md](MIGRATION.md)  
For quick start, see [QUICK_START.md](QUICK_START.md)

