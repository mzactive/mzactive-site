# MZActive welcome-email implementation specification

Status: proposal only — not deployed or enabled.

## Confirmed requirements
- Send one welcome email after a **successful** account registration, for both coaches/providers and athletes/members.
- Email content in Modern Standard Arabic and English.
- Show sender display name **MZActive**.
- Set `Reply-To: Mzactive@yahoo.com` so replies reach administration.
- Do not claim a coach profile is published before admin approval.
- Do not send on page load, form submission alone, failed registration, or login.

## Implementation
1. In the server-side `POST /api/auth/register` handler, after the user record is successfully committed, enqueue a welcome email event with user ID, role, and email.
2. Process the event server-side via a configured email provider (verified sending domain/address required); never put API keys in browser JavaScript.
3. Use an idempotency key such as `welcome:<user-id>:v1` and persist delivery state so retries cannot send duplicate emails.
4. Use `From: MZActive <verified-sender@configured-domain>` and `Reply-To: Mzactive@yahoo.com`. Do not spoof Yahoo as the sender.
5. Log delivery outcomes without logging passwords, tokens, or unnecessary personal data. Handle provider outages without failing account registration.
6. Keep sending disabled until domain verification, provider configuration, and test approval.

## Coach template
Subject: مرحباً بك في MZActive | Welcome to MZActive

مرحباً بك في منصة MZActive! تم إنشاء حسابك بنجاح. يرجى إكمال ملفك الشخصي وخبراتك وخدماتك، وسيراجع فريق الإدارة ملفك قبل نشره. بعد الموافقة سيتمكن الرياضيون من العثور عليك وإرسال طلبات الحجز. **شكراً لانضمامك إلى عائلة MZActive.**

Welcome to MZActive! Your account has been created successfully. Please complete your profile, experience, and services. Our admin team will review your profile before it goes live. Once approved, athletes will be able to find you and send booking requests. Thank you for joining the MZActive family.

## Athlete template
Subject: أهلاً بك في MZActive | Welcome to MZActive

أهلاً بك في MZActive! تم إنشاء حسابك بنجاح. يمكنك الآن استكشاف المدربين وإرسال طلبات الحجز المناسبة لأهدافك. **شكراً لانضمامك إلى عائلة MZActive.**

Welcome to MZActive! Your account has been created successfully. You can now explore coaches and submit booking requests that match your goals. Thank you for joining the MZActive family.

## Acceptance tests (staging / mocked provider)
- Coach and athlete success each produce exactly one queued email, with correct role-specific bilingual text and Reply-To.
- Failed registration produces no email.
- Duplicate events or retries produce no duplicate emails.
- Email provider failure does not roll back a successfully created account.
- Test reply routes to administration mailbox after actual provider setup.

## Blockers
Locate the backend registration handler and storage/queue implementation; choose and configure an email delivery provider; verify a sender domain/address. No production secrets or deployment changes authorized by this document.
