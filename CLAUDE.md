# BrainHealth Backend — AI Coding Context

## ⚠️ READ THIS FIRST

**Full system documentation lives one level up:**

```
../SYSTEM_DOCUMENTATION.md
```

or equivalently:

```
d:/CodeBaseLEGACY/FYP/SYSTEM_DOCUMENTATION.md
```

Read it before writing any code. It documents every module, every API endpoint, the full DB schema, RBAC rules, auth strategies, and design patterns.

---

## Backend Quick Reference

**Framework:** NestJS v11 · **Port:** 8001 · **Language:** TypeScript strict  
**ORM:** Prisma v6 → PostgreSQL (Neon)  
**Auth:** Passport Local + JWT + Refresh JWT + Google OAuth2  
**Swagger:** `http://localhost:8001/api/docs`

### Module list (`src/`)
```
auth/         ← 4 Passport strategies, token rotation
user/         ← profile, guardian link, patient list
therapist/    ← verified therapist directory, reviews
appointment/  ← book / confirm / cancel / complete
journal/      ← AI emotion detection, crisis detection
mood/         ← mood logs, 7-day insights
chatbot/      ← Groq (gpt-oss-120b) sessions + HuggingFace emotion
cbt/          ← CBT exercise library + completions
report/       ← cron-generated weekly reports → email
admin/        ← platform stats, user management, crisis events
notification/ ← global in-app notifications (injected everywhere)
questionnaire/← PHQ-9 / GAD-7 / OCI-R / DASS-21 scoring (no AI)
screening/    ← text analysis (HF models) + voice proxy to the ML service
common/       ← shared crisis keywords, Hugging Face + Groq helpers, therapist-link check
prisma/       ← global PrismaModule / PrismaService
filters/      ← GlobalExceptionFilter (catches all errors)
types/        ← shared enums (Role, EmotionLabel, etc.)
```

### Key conventions
- Every protected controller starts with `@UseGuards(JwtAuthGuard)`
- Role restrictions: `@Roles(Role.X) @UseGuards(JwtAuthGuard, RolesGuard)` (JWT must come first)
- Ownership verified at DB level: `findFirst({ where: { id, userId } })` — never `findUnique` alone
- DTOs use `class-validator` decorators; `ValidationPipe(whitelist: true)` is global
- External API failures (HuggingFace, Groq) always fall back — never let them throw to the client
- `NotificationService` is globally provided — inject it anywhere, no re-import needed

### Dev commands
```bash
npm run dev          # watch mode
npx prisma studio    # DB browser
npx prisma migrate dev --name <name>   # create migration
npx prisma generate  # regenerate client after schema change
```
