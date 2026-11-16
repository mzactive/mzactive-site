# MZActive community onboarding

Status: APPROVED DESIGN, NOT LIVE. Do not claim membership or automatic email works before backend and tests.

## Mobile-first journey
1. Use device language first, persist manual choice; entire signup and email in Arabic or English.
2. Short signup: name, email, authentication and privacy acceptance. No required gender, age, city or sports preferences.
3. After durable verified membership creation, enqueue exactly one transactional welcome email using an idempotency key per member. No email on failed registration.
4. Optional profile after welcome: age range, gender (woman/man/self-describe/prefer not to say), city, sport interests, experience. Every field optional, editable, deletable; prominent Skip for now. Do not request disability or health details in general onboarding.
5. Separate unchecked marketing opt-in; retain consent evidence and allow unsubscribe.
6. Secure backend email sender, rate limits, and account/profile deletion.

## Welcome emails
Arabic subject: مرحباً بك في عائلة MZActive الرياضية!
Arabic body: أهلاً بك في عائلة MZActive! يسعدنا انضمامك إلى مجتمعنا الرياضي. هنا نتشارك حب الرياضة وندعم بعضنا لتحقيق أهدافنا. اكتشف الأنشطة القادمة، ويمكنك إكمال ملفك الشخصي في أي وقت. معاً نتدرب ونتطور. فريق MZActive.

English subject: Welcome to the MZActive Sports Family!
English body: Welcome to the MZActive family! We're glad you've joined our sports community. Connect with people who share your passion, discover upcoming activities, and complete your profile whenever you're ready. Let's train and grow together. The MZActive Team.

## Release acceptance
- Test iPhone/Android small screens, readable RTL and English, easy tap targets and clear errors.
- Successful signup creates one member and sends one email; failure sends none.
- Optional fields can be skipped and changed later. Marketing consent defaults off.
- No claim of working event booking or membership until production tested.
